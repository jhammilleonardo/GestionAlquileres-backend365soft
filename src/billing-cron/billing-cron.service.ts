import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { NotificationEventType } from '../notifications/dto/create-notification.dto';
import { quoteIdent } from '../common/utils/sql-identifier';
import {
  calculateLateFee,
  getPreviousMonthYear,
  isFirstDayOfMonthInTz,
  isMidnightWindowInTz,
} from './late-fee.calculator';

// ─── Tipos internos ────────────────────────────────────────────────────────────

interface TenantRecord {
  schema_name: string;
  slug: string;
}

interface TenantConfig {
  timezone: string;
  grace_days_late_fee: number;
  late_fee_percentage: number;
  commission_percentage: number;
  currency: string;
  notification_channels: {
    internal: boolean;
    email: boolean;
    whatsapp: boolean;
  };
}

interface OverduePayment {
  id: number;
  amount: string;
  currency: string;
  due_date: string;
  tenant_id: number;
  contract_id: number;
  property_id: number;
  contract_number: string;
  property_title: string;
}

interface UpcomingPayment {
  id: number;
  amount: string;
  currency: string;
  due_date: string;
  tenant_id: number;
  contract_id: number;
  contract_number: string;
  property_title: string;
}

interface PropertyWithOwner {
  property_id: number;
  contract_id: number;
  rental_owner_id: number;
  property_title: string;
}

// ─── Servicio ──────────────────────────────────────────────────────────────────

@Injectable()
export class BillingCronService {
  private readonly logger = new Logger(BillingCronService.name);

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  // ── Entry points (llamados por el scheduler) ────────────────────────────────

  /**
   * Ejecuta facturación diaria para cada tenant que esté en su ventana de medianoche.
   * Aplica mora a pagos vencidos y envía recordatorios 7 días antes del vencimiento.
   */
  async runDailyBilling(): Promise<void> {
    const tenants = await this.getAllActiveTenants();
    for (const tenant of tenants) {
      try {
        const config = await this.getConfigForSchema(tenant.schema_name);
        if (!isMidnightWindowInTz(config.timezone)) continue;
        await this.processDailyBillingForTenant(tenant.schema_name, config);
      } catch (error) {
        this.captureError(tenant.schema_name, 'daily-billing', error);
      }
    }
  }

  /**
   * Genera liquidaciones mensuales para propietarios cuando es el día 1 en la
   * zona horaria del tenant. Solo procesa si hay pagos aprobados el mes anterior.
   */
  async runMonthlyStatements(): Promise<void> {
    const tenants = await this.getAllActiveTenants();
    for (const tenant of tenants) {
      try {
        const config = await this.getConfigForSchema(tenant.schema_name);
        if (!isMidnightWindowInTz(config.timezone)) continue;
        if (!isFirstDayOfMonthInTz(config.timezone)) continue;
        await this.processMonthlyStatementsForTenant(
          tenant.schema_name,
          config,
        );
      } catch (error) {
        this.captureError(tenant.schema_name, 'monthly-statements', error);
      }
    }
  }

  // ── Procesamiento por tenant ────────────────────────────────────────────────

  private async processDailyBillingForTenant(
    schemaName: string,
    config: TenantConfig,
  ): Promise<void> {
    await this.applyLateFees(schemaName, config);
    await this.sendPaymentReminders(schemaName, config);
  }

  private async processMonthlyStatementsForTenant(
    schemaName: string,
    config: TenantConfig,
  ): Promise<void> {
    const { month, year } = getPreviousMonthYear(config.timezone);
    await this.generateOwnerStatements(schemaName, month, year, config);
  }

  // ── Aplicar mora ────────────────────────────────────────────────────────────

  private async applyLateFees(
    schemaName: string,
    config: TenantConfig,
  ): Promise<void> {
    const { grace_days_late_fee: graceDays, late_fee_percentage: lateFeePct } =
      config;
    if (lateFeePct <= 0) return;

    // Pagos RENT pendientes cuyo due_date superó el período de gracia,
    // excluyendo los que ya tienen un cargo por mora hijo.
    const overduePayments = await this.dataSource.query<OverduePayment[]>(
      `SELECT p.id, p.amount, p.currency, p.due_date, p.tenant_id,
              p.contract_id, p.property_id,
              c.contract_number, pr.title AS property_title
       FROM ${quoteIdent(schemaName)}.payments p
       JOIN ${quoteIdent(schemaName)}.contracts c  ON c.id = p.contract_id
       JOIN ${quoteIdent(schemaName)}.properties pr ON pr.id = p.property_id
       WHERE p.payment_type = 'RENT'
         AND p.status = 'PENDING'
         AND p.due_date < CURRENT_DATE - ($1 || ' days')::INTERVAL
         AND NOT EXISTS (
           SELECT 1 FROM ${quoteIdent(schemaName)}.payments lf
           WHERE lf.parent_payment_id = p.id
             AND lf.payment_type = 'LATE_FEE'
         )`,
      [graceDays],
    );

    for (const payment of overduePayments) {
      const fee = calculateLateFee(Number(payment.amount), lateFeePct);
      if (fee <= 0) continue;

      await this.dataSource.query(
        `INSERT INTO ${quoteIdent(schemaName)}.payments
           (tenant_id, contract_id, property_id, amount, currency,
            payment_type, payment_method, status,
            payment_date, due_date, parent_payment_id, notes,
            created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5,
                 'LATE_FEE', 'manual', 'PENDING',
                 CURRENT_DATE, CURRENT_DATE, $6, $7,
                 NOW(), NOW())`,
        [
          payment.tenant_id,
          payment.contract_id,
          payment.property_id,
          fee,
          payment.currency,
          payment.id,
          `Cargo por mora automático — renta vencida el ${payment.due_date}`,
        ],
      );

      if (config.notification_channels.internal) {
        await this.insertNotification(
          schemaName,
          payment.tenant_id,
          NotificationEventType.LATE_FEE_APPLIED,
          'Cargo por mora aplicado',
          `Se aplicó un cargo por mora de ${fee} ${payment.currency} por la renta ` +
            `vencida el ${payment.due_date} en ${payment.property_title}.`,
          {
            payment_id: payment.id,
            fee_amount: fee,
            currency: payment.currency,
            contract_number: payment.contract_number,
          },
        );
      }

      this.logger.log(
        `[${schemaName}] Mora de ${fee} ${payment.currency} aplicada al pago #${payment.id}`,
      );
    }
  }

  // ── Recordatorios de pago ────────────────────────────────────────────────────

  private async sendPaymentReminders(
    schemaName: string,
    config: TenantConfig,
  ): Promise<void> {
    if (!config.notification_channels.internal) return;

    const upcoming = await this.dataSource.query<UpcomingPayment[]>(
      `SELECT p.id, p.amount, p.currency, p.due_date, p.tenant_id, p.contract_id,
              c.contract_number, pr.title AS property_title
       FROM ${quoteIdent(schemaName)}.payments p
       JOIN ${quoteIdent(schemaName)}.contracts c  ON c.id = p.contract_id
       JOIN ${quoteIdent(schemaName)}.properties pr ON pr.id = p.property_id
       WHERE p.payment_type = 'RENT'
         AND p.status = 'PENDING'
         AND (p.due_date AT TIME ZONE $1)::date
             = (NOW() AT TIME ZONE $1)::date + INTERVAL '7 days'`,
      [config.timezone],
    );

    for (const payment of upcoming) {
      const alreadySent = await this.hasBeenSent(
        schemaName,
        'payment',
        payment.id,
        'payment.reminder.7d',
      );
      if (alreadySent) continue;

      await this.insertNotification(
        schemaName,
        payment.tenant_id,
        NotificationEventType.PAYMENT_REMINDER,
        'Recordatorio de pago',
        `Tu pago de ${payment.currency} ${payment.amount} para ${payment.property_title} ` +
          `vence el ${payment.due_date}. Realiza el pago a tiempo para evitar cargos por mora.`,
        {
          payment_id: payment.id,
          due_date: payment.due_date,
          amount: payment.amount,
          currency: payment.currency,
          contract_number: payment.contract_number,
        },
      );

      await this.markSent(
        schemaName,
        'payment',
        payment.id,
        'payment.reminder.7d',
      );
    }
  }

  // ── Liquidaciones mensuales ──────────────────────────────────────────────────

  private async generateOwnerStatements(
    schemaName: string,
    month: number,
    year: number,
    config: TenantConfig,
  ): Promise<void> {
    // Propiedades con contratos activos que tienen propietario asignado
    const properties = await this.dataSource.query<PropertyWithOwner[]>(
      `SELECT DISTINCT ON (c.property_id)
              c.property_id, c.id AS contract_id,
              po.rental_owner_id, p.title AS property_title
       FROM ${quoteIdent(schemaName)}.contracts c
       JOIN ${quoteIdent(schemaName)}.properties p ON p.id = c.property_id
       JOIN ${quoteIdent(schemaName)}.property_owners po
         ON po.property_id = c.property_id AND po.is_active = true
       WHERE c.status IN ('ACTIVO', 'POR_VENCER')
       ORDER BY c.property_id, c.id DESC`,
    );

    for (const prop of properties) {
      const paymentRows = await this.dataSource.query<
        { gross_rent: string; payment_count: string }[]
      >(
        `SELECT COALESCE(SUM(amount), 0) AS gross_rent, COUNT(*) AS payment_count
         FROM ${quoteIdent(schemaName)}.payments
         WHERE property_id = $1
           AND payment_type = 'RENT'
           AND status = 'APPROVED'
           AND EXTRACT(MONTH FROM payment_date) = $2
           AND EXTRACT(YEAR  FROM payment_date) = $3`,
        [prop.property_id, month, year],
      );

      const grossRent = Number(paymentRows[0]?.gross_rent ?? 0);
      if (grossRent <= 0) continue; // sin ingresos aprobados → no generar liquidación

      const expenseRows = await this.dataSource.query<{ total: string }[]>(
        `SELECT COALESCE(SUM(amount), 0) AS total
         FROM ${quoteIdent(schemaName)}.expenses
         WHERE property_id = $1
           AND EXTRACT(MONTH FROM date) = $2
           AND EXTRACT(YEAR  FROM date) = $3`,
        [prop.property_id, month, year],
      );

      const maintenanceDeduction = Number(expenseRows[0]?.total ?? 0);
      const managementCommission =
        Math.round(grossRent * (config.commission_percentage / 100) * 100) /
        100;
      const netAmount =
        Math.round(
          (grossRent - maintenanceDeduction - managementCommission) * 100,
        ) / 100;

      // Upsert — si ya existe el statement del mes, actualizarlo con los valores finales
      await this.dataSource.query(
        `INSERT INTO ${quoteIdent(schemaName)}.owner_statements
           (rental_owner_id, property_id, period_month, period_year,
            gross_rent, maintenance_deduction, management_commission, net_amount,
            currency, payment_count, status, generated_at, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'pending', NOW(), NOW(), NOW())
         ON CONFLICT (rental_owner_id, property_id, period_year, period_month)
         DO UPDATE SET
           gross_rent            = EXCLUDED.gross_rent,
           maintenance_deduction = EXCLUDED.maintenance_deduction,
           management_commission = EXCLUDED.management_commission,
           net_amount            = EXCLUDED.net_amount,
           payment_count         = EXCLUDED.payment_count,
           updated_at            = NOW()`,
        [
          prop.rental_owner_id,
          prop.property_id,
          month,
          year,
          grossRent,
          maintenanceDeduction,
          managementCommission,
          netAmount,
          config.currency,
          Number(paymentRows[0]?.payment_count ?? 0),
        ],
      );

      this.logger.log(
        `[${schemaName}] Liquidación generada: propiedad #${prop.property_id}, ${month}/${year}`,
      );
    }
  }

  // ── Helpers compartidos ──────────────────────────────────────────────────────

  private async getAllActiveTenants(): Promise<TenantRecord[]> {
    return this.dataSource.query<TenantRecord[]>(
      `SELECT schema_name, slug FROM public.tenant WHERE is_active = true`,
    );
  }

  private async getConfigForSchema(schemaName: string): Promise<TenantConfig> {
    const rows = await this.dataSource.query<TenantConfig[]>(
      `SELECT timezone, grace_days_late_fee, late_fee_percentage,
              commission_percentage, currency, notification_channels
       FROM ${quoteIdent(schemaName)}.tenant_config
       LIMIT 1`,
    );
    return rows[0];
  }

  private async insertNotification(
    schemaName: string,
    userId: number,
    eventType: NotificationEventType,
    title: string,
    message: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await this.dataSource.query(
      `INSERT INTO ${quoteIdent(schemaName)}.notifications
         (user_id, event_type, title, message, metadata, is_read, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, false, NOW(), NOW())`,
      [userId, eventType, title, message, JSON.stringify(metadata)],
    );
  }

  private async hasBeenSent(
    schemaName: string,
    entityType: string,
    entityId: number,
    eventKey: string,
  ): Promise<boolean> {
    const rows = await this.dataSource.query<{ id: number }[]>(
      `SELECT id FROM ${quoteIdent(schemaName)}.lifecycle_notification_log
       WHERE entity_type = $1 AND entity_id = $2 AND event_key = $3`,
      [entityType, entityId, eventKey],
    );
    return rows.length > 0;
  }

  private async markSent(
    schemaName: string,
    entityType: string,
    entityId: number,
    eventKey: string,
  ): Promise<void> {
    await this.dataSource.query(
      `INSERT INTO ${quoteIdent(schemaName)}.lifecycle_notification_log
         (entity_type, entity_id, event_key)
       VALUES ($1, $2, $3)
       ON CONFLICT ON CONSTRAINT uq_lifecycle_notif_log DO NOTHING`,
      [entityType, entityId, eventKey],
    );
  }

  /**
   * Captura el error, lo loguea con contexto y lo reporta a Sentry cuando esté disponible.
   * No relanza — el caller continúa con el siguiente tenant.
   */
  private captureError(schemaName: string, job: string, error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;
    this.logger.error(`[${schemaName}] ${job} falló: ${message}`, stack);
    // TODO: captureException(error, { tags: { job, tenant: schemaName } })
    //       Descomentar cuando @sentry/nestjs esté instalado y configurado.
  }
}
