import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { PaymentsService } from './payments.service';
import {
  AdminPaymentsController,
  TenantPaymentsController,
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
    HttpModule.register({ timeout: 30000, maxRedirects: 3 }),
    TenantsModule,
    NotificationsModule,
    OwnerStatementsModule,
    SplitPaymentModule,
    AuditLogsModule,
    QrPaymentModule,
  ],
  controllers: [
    AdminPaymentsController,
    TenantPaymentsController,
    WebhookController,
  ],
  providers: [
    PaymentsService,
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
