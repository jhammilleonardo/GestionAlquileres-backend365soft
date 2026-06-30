import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { quoteIdent } from '../common/utils/sql-identifier';
import { CreateReservationPaymentDto } from './dto';
import { PaymentCreationNotificationService } from './payment-creation-notification.service';
import { PaymentProcessor, PaymentStatus, PaymentType } from './enums';
import { Payment } from './interfaces/payment.interface';

interface ReservationPayableRow {
  id: number;
  tenant_id: number;
  property_id: number;
  status: string;
  currency: string;
  total_amount: string;
}

/**
 * Creación de pagos de RESERVAS de corto plazo (pago polimórfico §4.6). Es un
 * servicio aparte de `PaymentCreationService` (SRP + Open/Closed): aquel está
 * acoplado al ciclo de contratos de largo plazo; éste vincula el pago a una
 * reserva (`reservation_id`, con `contract_id` NULL). Ambos escriben en la
 * misma tabla `payments` y, una vez aprobados, recorren el MISMO pipeline
 * (aprobación → split por propiedad → outbox → posteo contable), que es
 * agnóstico al contrato.
 */
@Injectable()
export class ReservationPaymentService {
  /** Estados de reserva sobre los que se admite registrar un pago. */
  private static readonly PAYABLE_STATUSES: readonly string[] = [
    'pending',
    'confirmed',
    'in_progress',
  ];

  constructor(
    private readonly dataSource: DataSource,
    private readonly notificationService: PaymentCreationNotificationService,
  ) {}

  async createReservationPayment(
    schemaName: string,
    reservationId: number,
    tenantUserId: number,
    dto: CreateReservationPaymentDto,
    tenantSlug?: string,
  ): Promise<Payment> {
    const q = quoteIdent(schemaName);
    const schemaPrefix = `${q}.`;
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Bloqueo de fila: serializa pagos concurrentes sobre la misma reserva
      // para que el control de sobrepago sea consistente.
      const rows = (await queryRunner.query(
        `SELECT id, tenant_id, property_id, status, currency, total_amount
           FROM ${q}.reservations WHERE id = $1 FOR UPDATE`,
        [reservationId],
      )) as ReservationPayableRow[];

      const reservation = rows[0];
      if (!reservation || reservation.tenant_id !== tenantUserId) {
        throw new NotFoundException(`Reserva ${reservationId} no encontrada`);
      }

      this.assertPayable(reservation);
      await this.assertNotOverpaying(
        queryRunner,
        q,
        reservationId,
        Number(reservation.total_amount),
        dto.amount,
      );

      const payments = (await queryRunner.query(
        `INSERT INTO ${q}.payments (
           tenant_id, contract_id, reservation_id, property_id, amount, currency,
           payment_type, payment_method, status, payment_date,
           reference_number, notes, payment_processor, created_by,
           created_at, updated_at
         ) VALUES ($1, NULL, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW(), NOW())
         RETURNING *`,
        [
          tenantUserId,
          reservationId,
          reservation.property_id,
          dto.amount,
          reservation.currency,
          PaymentType.RENT,
          dto.payment_method,
          PaymentStatus.PENDING,
          dto.payment_date,
          dto.reference_number ?? null,
          dto.notes ?? null,
          PaymentProcessor.MANUAL,
          tenantUserId,
        ],
      )) as Payment[];

      const payment = payments[0];
      if (!payment) {
        throw new Error('No se pudo registrar el pago de la reserva');
      }

      await queryRunner.commitTransaction();

      await this.notificationService.notifyAdminsOfPendingPayment({
        dataSourceQuery: <T>(sql: string, params?: unknown[]) =>
          this.dataSource.query<T[]>(sql, params),
        schemaName,
        schemaPrefix,
        tenantSlug,
        payment,
        amount: dto.amount,
        currency: reservation.currency,
        hasReceipt: false,
      });

      return payment;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  private assertPayable(reservation: ReservationPayableRow): void {
    if (
      !ReservationPaymentService.PAYABLE_STATUSES.includes(reservation.status)
    ) {
      throw new BadRequestException(
        `No se puede pagar una reserva en estado '${reservation.status}'.`,
      );
    }
  }

  /**
   * Evita pagar más que el saldo pendiente: total de la reserva menos lo ya
   * pagado/aprobado o en revisión (pending/processing/approved cuentan como
   * comprometido). Se tolera 1 centavo de holgura por redondeo.
   */
  private async assertNotOverpaying(
    queryRunner: {
      query: (sql: string, params?: unknown[]) => Promise<unknown>;
    },
    q: string,
    reservationId: number,
    totalAmount: number,
    newAmount: number,
  ): Promise<void> {
    const rows = (await queryRunner.query(
      `SELECT COALESCE(
                SUM(
                  CASE
                    WHEN p.status = 'APPROVED'
                      THEN GREATEST(0, p.amount - COALESCE(ref.total_refunded, 0))
                    ELSE p.amount
                  END
                ),
                0
              )::text AS paid
         FROM ${q}.payments p
         LEFT JOIN LATERAL (
           SELECT COALESCE(SUM(pr.amount), 0)::numeric AS total_refunded
             FROM ${q}.payment_refunds pr
            WHERE pr.payment_id = p.id
         ) ref ON true
        WHERE p.reservation_id = $1
          AND p.status IN ('PENDING', 'PROCESSING', 'APPROVED')`,
      [reservationId],
    )) as Array<{ paid: string }>;

    const committed = Number(rows[0]?.paid ?? '0');
    const outstanding = totalAmount - committed;

    if (newAmount > outstanding + 0.01) {
      throw new BadRequestException(
        `El monto excede el saldo pendiente de la reserva (${outstanding.toFixed(2)}).`,
      );
    }
  }
}
