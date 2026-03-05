import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PaymentsService } from './payments.service';
import { AdminPaymentsController, TenantPaymentsController } from './payments.controller';
import { TenantsModule } from '../tenants/tenants.module';
import { NotificationsModule } from '../notifications/notifications.module';

/**
 * Payments Module
 *
 * Módulo completo de gestión de pagos multi-moneda y multi-método.
 * Incluye soporte para procesadores de pago internacionales.
 */
@Module({
  imports: [TenantsModule, NotificationsModule],
  controllers: [AdminPaymentsController, TenantPaymentsController],
  providers: [PaymentsService],
  exports: [PaymentsService]
})
export class PaymentsModule {}
