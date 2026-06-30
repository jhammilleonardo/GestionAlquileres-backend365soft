import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { calculateLateFee } from '../billing-cron/late-fee.calculator';
import { quoteIdent } from '../common/utils/sql-identifier';
import { MoneyDecimal, MONEY_ROUNDING } from '../common/money';
import { PaymentStatus, PaymentType } from './enums';

type MonthStatus =
  | 'paid'
  | 'partial'
  | 'review'
  | 'overdue'
  | 'current'
  | 'upcoming';
type ReservationAlert =
  | 'deposit_required'
  | 'balance_before_checkin'
  | 'checkout_debt'
  | 'refund_pending'
  | 'paid';

interface ContractLedgerRow {
  id: number;
  contract_number: string;
  tenant_id: number;
  tenant_name: string | null;
  property_id: number;
  property_title: string | null;
  start_date: string;
  end_date: string;
  duration_months: number | string | null;
  monthly_rent: number | string;
  currency: string | null;
  payment_day: number | string | null;
  late_fee_percentage: number | string | null;
  grace_days: number | string | null;
  status: string;
}

interface ReservationLedgerRow {
  id: number;
  tenant_id: number;
  tenant_name: string | null;
  property_id: number;
  property_title: string | null;
  unit_number: string | null;
  checkin_date: string;
  checkout_date: string;
  nights: number | string;
  price_per_night: number | string;
  cleaning_fee: number | string | null;
  security_deposit: number | string | null;
  deposit_required: number | string | null;
  total_amount: number | string;
  currency: string | null;
  status: string;
}

interface PaymentLedgerRow {
  id: number;
  contract_id: number | null;
  reservation_id: number | null;
  amount: number | string;
  currency: string;
  payment_type: PaymentType;
  status: PaymentStatus;
  payment_date: string;
  due_date: string | null;
  parent_payment_id: number | null;
  total_refunded: number | string;
}

export interface LongTermLedgerMonth {
  label: string;
  due_date: string;
  rent_amount: number;
  paid_rent: number;
  pending_review: number;
  late_fee: number;
  outstanding_rent: number;
  total_due: number;
  days_overdue: number;
  status: MonthStatus;
}

export interface LongTermLedger {
  contract_id: number;
  contract_number: string;
  tenant_id: number;
  tenant_name: string;
  property_id: number;
  property_name: string;
  start_date: string;
  end_date: string;
  duration_months: number;
  elapsed_months: number;
  paid_months: number;
  overdue_months: number;
  monthly_rent: number;
  currency: string;
  payment_day: number;
  grace_days: number;
  late_fee_percentage: number;
  total_paid_rent: number;
  total_pending_review: number;
  base_debt: number;
  late_fee_debt: number;
  total_debt: number;
  months: LongTermLedgerMonth[];
}

export interface ShortTermReservationLedger {
  reservation_id: number;
  tenant_id: number;
  tenant_name: string;
  property_id: number;
  property_name: string;
  unit_number: string | null;
  checkin_date: string;
  checkout_date: string;
  nights: number;
  status: string;
  total_amount: number;
  deposit_required: number;
  paid_amount: number;
  pending_review: number;
  refunded_amount: number;
  balance_due: number;
  deposit_due: number;
  cleaning_fee: number;
  security_deposit: number;
  currency: string;
  alert: ReservationAlert;
  days_to_checkin: number;
}

export interface PaymentLedgerAlert {
  scope: 'long_term' | 'short_term';
  severity: 'info' | 'warning' | 'danger';
  message: string;
  amount?: number;
  entity_id?: number;
}

export interface AdminPaymentLedger {
  generated_at: string;
  summary: {
    long_term_contracts: number;
    long_term_debt: number;
    long_term_overdue_months: number;
    short_term_reservations: number;
    short_term_balance_due: number;
    short_term_pending_review: number;
    total_receivable: number;
  };
  long_term: LongTermLedger[];
  short_term: ShortTermReservationLedger[];
  alerts: PaymentLedgerAlert[];
}

@Injectable()
export class PaymentLedgerService {
  constructor(private readonly dataSource: DataSource) {}

  async getAdminLedger(schemaName: string): Promise<AdminPaymentLedger> {
    const schema = quoteIdent(schemaName);
    const [contracts, reservations, payments] = await Promise.all([
      this.getActiveContracts(schema),
      this.getReservations(schema),
      this.getLedgerPayments(schema),
    ]);

    const longTerm = this.buildLongTermLedgers(contracts, payments);
    const shortTerm = this.buildShortTermLedgers(reservations, payments);
    const alerts = this.buildAlerts(longTerm, shortTerm);
    const longTermDebt = this.round2(
      longTerm.reduce((sum, item) => sum + item.total_debt, 0),
    );
    const shortTermBalanceDue = this.round2(
      shortTerm.reduce((sum, item) => sum + item.balance_due, 0),
    );

    return {
      generated_at: new Date().toISOString(),
      summary: {
        long_term_contracts: longTerm.length,
        long_term_debt: longTermDebt,
        long_term_overdue_months: longTerm.reduce(
          (sum, item) => sum + item.overdue_months,
          0,
        ),
        short_term_reservations: shortTerm.length,
        short_term_balance_due: shortTermBalanceDue,
        short_term_pending_review: this.round2(
          shortTerm.reduce((sum, item) => sum + item.pending_review, 0),
        ),
        total_receivable: this.round2(longTermDebt + shortTermBalanceDue),
      },
      long_term: longTerm,
      short_term: shortTerm,
      alerts,
    };
  }

  private getActiveContracts(schema: string): Promise<ContractLedgerRow[]> {
    return this.dataSource.query<ContractLedgerRow[]>(
      `SELECT c.id, c.contract_number, c.tenant_id, u.name AS tenant_name,
              c.property_id, p.title AS property_title, c.start_date::text,
              c.end_date::text, c.duration_months, c.monthly_rent, c.currency,
              c.payment_day, c.late_fee_percentage, c.grace_days, c.status
         FROM ${schema}.contracts c
         LEFT JOIN ${schema}."user" u ON u.id = c.tenant_id
         LEFT JOIN ${schema}.properties p ON p.id = c.property_id
        WHERE c.status IN ('ACTIVO', 'FIRMADO', 'POR_VENCER')
        ORDER BY c.end_date ASC, c.id DESC`,
    );
  }

  private getReservations(schema: string): Promise<ReservationLedgerRow[]> {
    return this.dataSource.query<ReservationLedgerRow[]>(
      `SELECT r.id, r.tenant_id, u.name AS tenant_name, r.property_id,
              p.title AS property_title, un.unit_number, r.checkin_date::text,
              r.checkout_date::text, r.nights, r.price_per_night, r.cleaning_fee,
              r.security_deposit, r.deposit_required, r.total_amount, r.currency,
              r.status
         FROM ${schema}.reservations r
         LEFT JOIN ${schema}."user" u ON u.id = r.tenant_id
         LEFT JOIN ${schema}.properties p ON p.id = r.property_id
         LEFT JOIN ${schema}.units un ON un.id = r.unit_id
        WHERE r.status NOT IN ('expired', 'declined')
        ORDER BY r.checkin_date ASC, r.id DESC`,
    );
  }

  private getLedgerPayments(schema: string): Promise<PaymentLedgerRow[]> {
    return this.dataSource.query<PaymentLedgerRow[]>(
      `SELECT p.id, p.contract_id, p.reservation_id, p.amount, p.currency,
              p.payment_type, p.status, p.payment_date::text,
              p.due_date::text, p.parent_payment_id,
              COALESCE(ref.total_refunded, 0)::numeric AS total_refunded
         FROM ${schema}.payments p
         LEFT JOIN LATERAL (
           SELECT COALESCE(SUM(amount), 0)::numeric AS total_refunded
             FROM ${schema}.payment_refunds
            WHERE payment_id = p.id
         ) ref ON true
        WHERE p.contract_id IS NOT NULL OR p.reservation_id IS NOT NULL
        ORDER BY p.payment_date ASC, p.id ASC`,
    );
  }

  private buildLongTermLedgers(
    contracts: readonly ContractLedgerRow[],
    payments: readonly PaymentLedgerRow[],
  ): LongTermLedger[] {
    return contracts
      .map((contract) =>
        this.buildLongTermLedger(
          contract,
          payments.filter((payment) => payment.contract_id === contract.id),
        ),
      )
      .sort(
        (a, b) =>
          b.total_debt - a.total_debt ||
          a.property_name.localeCompare(b.property_name),
      );
  }

  private buildLongTermLedger(
    contract: ContractLedgerRow,
    payments: readonly PaymentLedgerRow[],
  ): LongTermLedger {
    const start = this.parseDate(contract.start_date) ?? new Date();
    const end = this.parseDate(contract.end_date) ?? start;
    const monthlyRent = this.toNumber(contract.monthly_rent);
    const paymentDay = this.resolvePaymentDay(contract.payment_day, start);
    const rentByMonth = new Map<string, { paid: number; pending: number }>();
    const lateFeesByMonth = new Map<
      string,
      { open: number; hasRecord: boolean }
    >();
    const rentPaymentMonth = new Map<number, string>();

    payments
      .filter((payment) => payment.payment_type === PaymentType.RENT)
      .forEach((payment) => {
        const date =
          this.parseDate(payment.due_date) ??
          this.parseDate(payment.payment_date);
        if (!date) return;

        const key = this.monthKey(date);
        rentPaymentMonth.set(payment.id, key);
        const current = rentByMonth.get(key) ?? { paid: 0, pending: 0 };
        const netAmount = this.netPaymentAmount(payment);
        if (payment.status === PaymentStatus.APPROVED) {
          current.paid += netAmount;
        } else if (
          payment.status === PaymentStatus.PENDING ||
          payment.status === PaymentStatus.PROCESSING
        ) {
          current.pending += this.toNumber(payment.amount);
        }
        rentByMonth.set(key, current);
      });

    payments
      .filter((payment) => payment.payment_type === PaymentType.LATE_FEE)
      .forEach((payment) => {
        const parentKey = payment.parent_payment_id
          ? rentPaymentMonth.get(payment.parent_payment_id)
          : null;
        const date =
          this.parseDate(payment.due_date) ??
          this.parseDate(payment.payment_date);
        const key = parentKey ?? (date ? this.monthKey(date) : null);
        if (!key) return;

        const current = lateFeesByMonth.get(key) ?? {
          open: 0,
          hasRecord: false,
        };
        current.hasRecord = true;
        if (this.isOpenCharge(payment.status)) {
          current.open += this.toNumber(payment.amount);
        }
        lateFeesByMonth.set(key, current);
      });

    const months = this.buildContractMonths({
      end,
      graceDays: this.toNumber(contract.grace_days),
      lateFeePercentage: this.toNumber(contract.late_fee_percentage),
      lateFeesByMonth,
      monthlyRent,
      paymentDay,
      rentByMonth,
      start,
    });
    const today = this.startOfDay(new Date());
    const dueMonths = months.filter(
      (month) => this.parseDate(month.due_date)! <= today,
    );
    const totalPaidRent = this.round2(
      months.reduce((sum, month) => sum + month.paid_rent, 0),
    );
    const totalPendingReview = this.round2(
      months.reduce((sum, month) => sum + month.pending_review, 0),
    );
    const baseDebt = this.round2(
      dueMonths.reduce((sum, month) => sum + month.outstanding_rent, 0),
    );
    const lateFeeDebt = this.round2(
      months.reduce((sum, month) => sum + month.late_fee, 0),
    );

    return {
      contract_id: contract.id,
      contract_number: contract.contract_number,
      tenant_id: contract.tenant_id,
      tenant_name: contract.tenant_name || 'Inquilino',
      property_id: contract.property_id,
      property_name: contract.property_title || 'Propiedad',
      start_date: this.dateKey(start),
      end_date: this.dateKey(end),
      duration_months: this.toNumber(contract.duration_months) || months.length,
      elapsed_months: dueMonths.length,
      paid_months: months.filter((month) => month.status === 'paid').length,
      overdue_months: months.filter(
        (month) => month.days_overdue > 0 && month.outstanding_rent > 0,
      ).length,
      monthly_rent: monthlyRent,
      currency: contract.currency || 'BOB',
      payment_day: paymentDay,
      grace_days: this.toNumber(contract.grace_days),
      late_fee_percentage: this.toNumber(contract.late_fee_percentage),
      total_paid_rent: totalPaidRent,
      total_pending_review: totalPendingReview,
      base_debt: baseDebt,
      late_fee_debt: lateFeeDebt,
      total_debt: this.round2(baseDebt + lateFeeDebt),
      months,
    };
  }

  private buildContractMonths(params: {
    start: Date;
    end: Date;
    monthlyRent: number;
    paymentDay: number;
    graceDays: number;
    lateFeePercentage: number;
    rentByMonth: Map<string, { paid: number; pending: number }>;
    lateFeesByMonth: Map<string, { open: number; hasRecord: boolean }>;
  }): LongTermLedgerMonth[] {
    const months: LongTermLedgerMonth[] = [];
    const today = this.startOfDay(new Date());
    let cursor = new Date(
      params.start.getFullYear(),
      params.start.getMonth(),
      1,
    );
    const endMonth = new Date(
      params.end.getFullYear(),
      params.end.getMonth(),
      1,
    );

    while (cursor <= endMonth) {
      const year = cursor.getFullYear();
      const month = cursor.getMonth();
      const key = this.monthKey(cursor);
      const dueDate = this.startOfDay(
        new Date(
          year,
          month,
          Math.min(params.paymentDay, new Date(year, month + 1, 0).getDate()),
        ),
      );
      const rent = params.rentByMonth.get(key) ?? { paid: 0, pending: 0 };
      const lateFeeRecord = params.lateFeesByMonth.get(key);
      const paidRent = Math.min(rent.paid, params.monthlyRent);
      const outstandingRent = Math.max(0, params.monthlyRent - paidRent);
      const daysOverdue =
        dueDate < today && outstandingRent > 0
          ? Math.ceil((today.getTime() - dueDate.getTime()) / 86_400_000)
          : 0;
      const projectedLateFee =
        !lateFeeRecord?.hasRecord &&
        outstandingRent > 0 &&
        this.addDays(dueDate, params.graceDays) < today
          ? calculateLateFee(params.monthlyRent, params.lateFeePercentage)
          : 0;
      const lateFee = this.round2(lateFeeRecord?.open ?? projectedLateFee);

      months.push({
        label: this.formatMonthLabel(cursor),
        due_date: this.dateKey(dueDate),
        rent_amount: params.monthlyRent,
        paid_rent: this.round2(paidRent),
        pending_review: this.round2(rent.pending),
        late_fee: lateFee,
        outstanding_rent: this.round2(outstandingRent),
        total_due: this.round2(outstandingRent + lateFee),
        days_overdue: daysOverdue,
        status: this.resolveMonthStatus({
          daysOverdue,
          dueDate,
          outstandingRent,
          paidRent,
          pendingReview: rent.pending,
          today,
        }),
      });

      cursor = new Date(year, month + 1, 1);
    }

    return months;
  }

  private buildShortTermLedgers(
    reservations: readonly ReservationLedgerRow[],
    payments: readonly PaymentLedgerRow[],
  ): ShortTermReservationLedger[] {
    return reservations
      .map((reservation) =>
        this.buildShortTermLedger(
          reservation,
          payments.filter(
            (payment) => payment.reservation_id === reservation.id,
          ),
        ),
      )
      .sort(
        (a, b) =>
          b.balance_due - a.balance_due ||
          a.checkin_date.localeCompare(b.checkin_date),
      );
  }

  private buildShortTermLedger(
    reservation: ReservationLedgerRow,
    payments: readonly PaymentLedgerRow[],
  ): ShortTermReservationLedger {
    const paidAmount = this.round2(
      payments
        .filter((payment) => payment.status === PaymentStatus.APPROVED)
        .reduce((sum, payment) => sum + this.netPaymentAmount(payment), 0),
    );
    const pendingReview = this.round2(
      payments
        .filter(
          (payment) =>
            payment.status === PaymentStatus.PENDING ||
            payment.status === PaymentStatus.PROCESSING,
        )
        .reduce((sum, payment) => sum + this.toNumber(payment.amount), 0),
    );
    const refundedAmount = this.round2(
      payments.reduce(
        (sum, payment) => sum + this.toNumber(payment.total_refunded),
        0,
      ),
    );
    const totalAmount = this.toNumber(reservation.total_amount);
    const depositRequired =
      this.toNumber(reservation.deposit_required) || totalAmount;
    const balanceDue = this.round2(Math.max(0, totalAmount - paidAmount));
    const depositDue = this.round2(Math.max(0, depositRequired - paidAmount));
    const checkinDate = this.parseDate(reservation.checkin_date) ?? new Date();
    const checkoutDate =
      this.parseDate(reservation.checkout_date) ?? checkinDate;
    const daysToCheckin = Math.ceil(
      (this.startOfDay(checkinDate).getTime() -
        this.startOfDay(new Date()).getTime()) /
        86_400_000,
    );

    return {
      reservation_id: reservation.id,
      tenant_id: reservation.tenant_id,
      tenant_name: reservation.tenant_name || 'Inquilino',
      property_id: reservation.property_id,
      property_name: reservation.property_title || 'Propiedad',
      unit_number: reservation.unit_number,
      checkin_date: this.dateKey(checkinDate),
      checkout_date: this.dateKey(checkoutDate),
      nights: this.toNumber(reservation.nights),
      status: reservation.status,
      total_amount: totalAmount,
      deposit_required: depositRequired,
      paid_amount: paidAmount,
      pending_review: pendingReview,
      refunded_amount: refundedAmount,
      balance_due: balanceDue,
      deposit_due: depositDue,
      cleaning_fee: this.toNumber(reservation.cleaning_fee),
      security_deposit: this.toNumber(reservation.security_deposit),
      currency: reservation.currency || 'BOB',
      alert: this.resolveReservationAlert(
        reservation.status,
        balanceDue,
        depositDue,
        daysToCheckin,
        refundedAmount,
      ),
      days_to_checkin: daysToCheckin,
    };
  }

  private buildAlerts(
    longTerm: readonly LongTermLedger[],
    shortTerm: readonly ShortTermReservationLedger[],
  ): PaymentLedgerAlert[] {
    const alerts: PaymentLedgerAlert[] = [];

    longTerm
      .filter((ledger) => ledger.total_debt > 0)
      .slice(0, 6)
      .forEach((ledger) => {
        alerts.push({
          scope: 'long_term',
          severity: ledger.overdue_months > 0 ? 'danger' : 'warning',
          message: `${ledger.tenant_name} debe ${ledger.total_debt.toFixed(2)} en ${ledger.property_name}`,
          amount: ledger.total_debt,
          entity_id: ledger.contract_id,
        });
      });

    shortTerm
      .filter((ledger) => ledger.balance_due > 0 || ledger.pending_review > 0)
      .slice(0, 6)
      .forEach((ledger) => {
        alerts.push({
          scope: 'short_term',
          severity: ledger.alert === 'checkout_debt' ? 'danger' : 'warning',
          message: `${ledger.tenant_name} tiene saldo ${ledger.balance_due.toFixed(2)} para ${ledger.property_name}`,
          amount: ledger.balance_due,
          entity_id: ledger.reservation_id,
        });
      });

    return alerts;
  }

  private resolveMonthStatus(params: {
    dueDate: Date;
    today: Date;
    paidRent: number;
    pendingReview: number;
    outstandingRent: number;
    daysOverdue: number;
  }): MonthStatus {
    if (params.outstandingRent <= 0) return 'paid';
    if (params.paidRent > 0) return 'partial';
    if (params.pendingReview > 0) return 'review';
    if (params.daysOverdue > 0) return 'overdue';
    if (
      params.dueDate.getFullYear() === params.today.getFullYear() &&
      params.dueDate.getMonth() === params.today.getMonth()
    ) {
      return 'current';
    }
    return 'upcoming';
  }

  private resolveReservationAlert(
    status: string,
    balanceDue: number,
    depositDue: number,
    daysToCheckin: number,
    refundedAmount: number,
  ): ReservationAlert {
    if (
      ['cancelled', 'no_show'].includes(status) &&
      refundedAmount <= 0 &&
      balanceDue <= 0
    ) {
      return 'refund_pending';
    }
    if (depositDue > 0 && ['pending', 'pending_payment'].includes(status))
      return 'deposit_required';
    if (balanceDue > 0 && daysToCheckin <= 0) return 'checkout_debt';
    if (balanceDue > 0 && daysToCheckin <= 7) return 'balance_before_checkin';
    return 'paid';
  }

  private isOpenCharge(status: PaymentStatus): boolean {
    return [
      PaymentStatus.PENDING,
      PaymentStatus.PROCESSING,
      PaymentStatus.DISPUTED,
    ].includes(status);
  }

  private netPaymentAmount(payment: PaymentLedgerRow): number {
    return this.round2(
      Math.max(
        0,
        this.toNumber(payment.amount) - this.toNumber(payment.total_refunded),
      ),
    );
  }

  private resolvePaymentDay(
    value: number | string | null,
    start: Date,
  ): number {
    const day = this.toNumber(value);
    return day >= 1 && day <= 31 ? Math.round(day) : start.getDate();
  }

  private monthKey(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  }

  private dateKey(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
      date.getDate(),
    ).padStart(2, '0')}`;
  }

  private formatMonthLabel(date: Date): string {
    const raw = date.toLocaleDateString('es-BO', {
      month: 'short',
      year: 'numeric',
    });
    return raw.charAt(0).toUpperCase() + raw.slice(1);
  }

  private parseDate(value?: string | Date | null): Date | null {
    if (!value) return null;
    if (typeof value === 'string') {
      const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
      if (match)
        return new Date(
          Number(match[1]),
          Number(match[2]) - 1,
          Number(match[3]),
        );
    }
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  private startOfDay(date: Date): Date {
    const normalized = new Date(date);
    normalized.setHours(0, 0, 0, 0);
    return normalized;
  }

  private addDays(date: Date, days: number): Date {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    return this.startOfDay(next);
  }

  private toNumber(value: number | string | null | undefined): number {
    const parsed = typeof value === 'number' ? value : Number(value ?? 0);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private round2(value: number): number {
    return new MoneyDecimal(value)
      .toDecimalPlaces(2, MONEY_ROUNDING)
      .toNumber();
  }
}
