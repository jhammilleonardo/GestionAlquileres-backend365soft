import { Injectable, Logger } from '@nestjs/common';
import { NotificationEventType } from '../notifications/dto/create-notification.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { PaymentStatusRow } from './payment-status.types';

@Injectable()
export class PaymentStatusNotificationService {
  private readonly logger = new Logger(PaymentStatusNotificationService.name);

  constructor(private readonly notificationsService: NotificationsService) {}

  async notifyApprovedSafely(
    payment: PaymentStatusRow,
    paymentId: number,
    schemaName?: string,
  ): Promise<void> {
    await this.emitSafely(
      () =>
        this.notifyTenant(
          schemaName,
          payment.tenant_id,
          NotificationEventType.PAYMENT_APPROVED,
          'Pago aprobado',
          `Tu pago de ${payment.amount} ${payment.currency} ha sido aprobado`,
          {
            payment_id: paymentId,
            amount: payment.amount,
            currency: payment.currency,
          },
        ),
      paymentId,
    );
  }

  async notifyRejectedSafely(
    payment: PaymentStatusRow,
    paymentId: number,
    rejectionReason: string,
    schemaName?: string,
  ): Promise<void> {
    await this.emitSafely(
      () =>
        this.notifyTenant(
          schemaName,
          payment.tenant_id,
          NotificationEventType.PAYMENT_REJECTED,
          'Pago rechazado',
          `Tu pago de ${payment.amount} ${payment.currency} fue rechazado: ${rejectionReason}`,
          {
            payment_id: paymentId,
            amount: payment.amount,
            currency: payment.currency,
            rejection_reason: rejectionReason,
          },
        ),
      paymentId,
    );
  }

  private async emitSafely(
    emit: () => Promise<void>,
    paymentId: number,
  ): Promise<void> {
    try {
      await emit();
    } catch (error) {
      this.logger.warn(
        `No se pudo emitir notificacion del pago ${paymentId}: ${String(error)}`,
      );
    }
  }

  private async notifyTenant(
    schemaName: string | undefined,
    tenantId: number,
    eventType: NotificationEventType,
    title: string,
    message: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    if (schemaName) {
      await this.notificationsService.createForUserInSchema(
        schemaName,
        tenantId,
        eventType,
        title,
        message,
        metadata,
      );
      return;
    }

    await this.notificationsService.createForUser(
      tenantId,
      eventType,
      title,
      message,
      metadata,
    );
  }
}
