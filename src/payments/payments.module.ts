import { Module } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import {
  AdminPaymentsController,
  TenantPaymentsController,
} from './payments.controller';
import { TenantsModule } from '../tenants/tenants.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { OwnerStatementsModule } from '../owner-statements/owner-statements.module';
import { SplitPaymentModule } from '../split-payment/split-payment.module';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { PaymentProcessorFactory } from './payment-processor.factory';
import { ManualPaymentProcessor } from './processors/manual.processor';
import { StripeProcessor } from './processors/stripe.processor';
import { QRBoliviaProcessor } from './processors/qr-bolivia.processor';

/**
 * Payments Module
 *
 * Módulo completo de gestión de pagos multi-moneda y multi-método.
 *
 * Arquitectura de procesadores:
 *   - IPaymentProcessor  → interfaz común para todos los procesadores
 *   - ManualPaymentProcessor  → activo ahora (comprobante + aprobación admin)
 *   - StripeProcessor         → stub listo para conectar (Fase 3)
 *   - QRBoliviaProcessor      → stub listo para conectar con QrPaymentService (Fase 3)
 *   - PaymentProcessorFactory → selecciona el procesador según tenant_config.payment_methods
 */
@Module({
  imports: [TenantsModule, NotificationsModule, OwnerStatementsModule, SplitPaymentModule, AuditLogsModule],
  controllers: [AdminPaymentsController, TenantPaymentsController],
  providers: [
    PaymentsService,
    PaymentProcessorFactory,
    ManualPaymentProcessor,
    StripeProcessor,
    QRBoliviaProcessor,
  ],
  exports: [PaymentsService, PaymentProcessorFactory],
})
export class PaymentsModule {}
