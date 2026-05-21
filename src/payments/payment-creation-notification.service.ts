import { Injectable, Logger } from '@nestjs/common';
import { NotificationEventType } from '../notifications/dto/create-notification.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { Payment } from './interfaces/payment.interface';

@Injectable()
export class PaymentCreationNotificationService {
  private readonly logger = new Logger(PaymentCreationNotificationService.name);

  constructor(private readonly notificationsService: NotificationsService) {}

  async notifyAdminsOfPendingPayment(params: {
    dataSourceQuery: <T>(sql: string, params?: unknown[]) => Promise<T[]>;
    schemaName: string | null;
    schemaPrefix: string;
    tenantSlug?: string;
    payment: Payment;
    amount: number;
    currency: string;
    hasReceipt: boolean;
  }): Promise<void> {
    try {
      const admins = await params.dataSourceQuery<{ id: number }>(
        `SELECT id FROM ${params.schemaPrefix}"user" WHERE role = 'ADMIN' AND is_active = true LIMIT 5`,
      );
      const receiptNote = params.hasReceipt ? ' con comprobante adjunto' : '';

      await Promise.all(
        admins.map((admin) =>
          params.schemaName
            ? this.notificationsService.createForUserInSchema(
                params.schemaName,
                admin.id,
                NotificationEventType.PAYMENT_CREATED,
                'Pago pendiente de aprobación',
                `Un inquilino registró un pago de ${params.amount} ${params.currency}${receiptNote}. Requiere revisión.`,
                {
                  payment_id: params.payment.id,
                  amount: params.amount,
                  currency: params.currency,
                  has_receipt: params.hasReceipt,
                },
                params.tenantSlug,
              )
            : this.notificationsService.createForUser(
                admin.id,
                NotificationEventType.PAYMENT_CREATED,
                'Pago pendiente de aprobación',
                `Un inquilino registró un pago de ${params.amount} ${params.currency}${receiptNote}. Requiere revisión.`,
                {
                  payment_id: params.payment.id,
                  amount: params.amount,
                  currency: params.currency,
                  has_receipt: params.hasReceipt,
                },
                params.tenantSlug,
              ),
        ),
      );
    } catch (error) {
      this.logger.warn(
        `No se pudo notificar pago pendiente: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async notifyTenantOfApprovedPayment(
    tenantId: number,
    paymentId: number,
    amount: number,
    currency: string,
    schemaName?: string,
  ): Promise<void> {
    try {
      if (schemaName) {
        await this.notificationsService.createForUserInSchema(
          schemaName,
          tenantId,
          NotificationEventType.PAYMENT_APPROVED,
          'Pago aprobado',
          `Tu pago de ${amount} ${currency} ha sido aprobado`,
          { payment_id: paymentId, amount, currency },
        );
        return;
      }

      await this.notificationsService.createForUser(
        tenantId,
        NotificationEventType.PAYMENT_APPROVED,
        'Pago aprobado',
        `Tu pago de ${amount} ${currency} ha sido aprobado`,
        { payment_id: paymentId, amount, currency },
      );
    } catch (error) {
      this.logger.warn(
        `No se pudo notificar pago aprobado ${paymentId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
