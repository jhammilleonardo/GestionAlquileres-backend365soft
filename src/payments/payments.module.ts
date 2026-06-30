import { Module } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { PaymentQueriesService } from './payment-queries.service';
import { PaymentApprovalService } from './payment-approval.service';
import { PaymentStatusService } from './payment-status.service';
import { PaymentStatusNotificationService } from './payment-status-notification.service';
import { PaymentRefundsService } from './payment-refunds.service';
import { PaymentWebhookService } from './payment-webhook.service';
import { PaymentCreationService } from './payment-creation.service';
import { PaymentCreationNotificationService } from './payment-creation-notification.service';
import { PaymentCreationValidationService } from './payment-creation-validation.service';
import { ReservationPaymentService } from './reservation-payment.service';
import { PaymentMethodsService } from './payment-methods.service';
import { PaymentLedgerService } from './payment-ledger.service';
import {
  AdminPaymentsController,
  TenantPaymentsController,
  TenantReservationPaymentsController,
} from './payments.controller';
import { WebhookController } from './webhooks/webhook.controller';
import { TenantsModule } from '../tenants/tenants.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { OwnerStatementsModule } from '../owner-statements/owner-statements.module';
import { SplitPaymentModule } from '../split-payment/split-payment.module';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { QrPaymentModule } from './qr/qr-payment.module';
import { PaymentProcessorFactory } from './payment-processor.factory';
import { ManualPaymentProcessor } from './processors/manual.processor';
import { StripeProcessor } from './processors/stripe.processor';
import { PayPalProcessor } from './processors/paypal.processor';
import { PayUProcessor } from './processors/payu.processor';
import { QRBoliviaProcessor } from './processors/qr-bolivia.processor';
import { StorageModule } from '../common/storage/storage.module';
import { AccountingModule } from '../accounting/accounting.module';
import { ReservationPaymentConfirmationService } from './reservation-payment-confirmation.service';
import { SafeHttpClientService } from '../common/http/safe-http-client.service';

/**
 * Payments Module
 *
 * Procesadores disponibles:
 *   - ManualPaymentProcessor  → activo siempre (comprobante + aprobación admin)
 *   - StripeProcessor         → EE.UU. y Guatemala (stripe, ach)
 *   - PayPalProcessor         → EE.UU. (paypal)
 *   - PayUProcessor           → Guatemala y Honduras (payu, tarjeta)
 *   - QRBoliviaProcessor      → Bolivia (qr_accl, qr_mc4) — delega a QrPaymentService
 *
 * El tenant activa/desactiva procesadores desde tenant_config.payment_methods.
 * PaymentProcessorFactory selecciona el procesador sin cambios de código.
 */
@Module({
  imports: [
    TenantsModule,
    NotificationsModule,
    OwnerStatementsModule,
    SplitPaymentModule,
    AuditLogsModule,
    QrPaymentModule,
    StorageModule,
    AccountingModule,
  ],
  controllers: [
    AdminPaymentsController,
    TenantPaymentsController,
    TenantReservationPaymentsController,
    WebhookController,
  ],
  providers: [
    PaymentsService,
    PaymentQueriesService,
    PaymentApprovalService,
    PaymentStatusService,
    PaymentStatusNotificationService,
    PaymentRefundsService,
    PaymentWebhookService,
    PaymentCreationService,
    PaymentCreationNotificationService,
    PaymentCreationValidationService,
    ReservationPaymentService,
    ReservationPaymentConfirmationService,
    PaymentLedgerService,
    SafeHttpClientService,
    PaymentMethodsService,
    PaymentProcessorFactory,
    ManualPaymentProcessor,
    StripeProcessor,
    PayPalProcessor,
    PayUProcessor,
    QRBoliviaProcessor,
  ],
  exports: [PaymentsService, PaymentProcessorFactory],
})
export class PaymentsModule {}
