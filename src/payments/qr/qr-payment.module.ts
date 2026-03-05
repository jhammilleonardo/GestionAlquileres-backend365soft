import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { QrPaymentService } from './qr-payment.service';
import {
  AdminQrPaymentController,
  TenantQrPaymentController,
  PublicQrPaymentController,
} from './qr-payment.controller';
import { TenantsModule } from '../../tenants/tenants.module';

/**
 * QrPaymentModule
 *
 * Módulo de pago vía QR dinámico (API MC4/SIP – Bolivia).
 * Incluye endpoints para Admin, Inquilino y el callback público del banco.
 */
@Module({
  imports: [
    TenantsModule,
    HttpModule.register({
      timeout: 30000,
      maxRedirects: 3,
    }),
  ],
  controllers: [
    AdminQrPaymentController,
    TenantQrPaymentController,
    PublicQrPaymentController,
  ],
  providers: [QrPaymentService],
  exports: [QrPaymentService],
})
export class QrPaymentModule {}
