import { Module } from '@nestjs/common';
import { QrPaymentService } from './qr-payment.service';
import { QrPaymentProcessingService } from './qr-payment-processing.service';
import { QrProviderService } from './qr-provider.service';
import { QrPaymentPersistenceService } from './qr-payment-persistence.service';
import {
  AdminQrPaymentController,
  TenantQrPaymentController,
  PublicQrPaymentController,
} from './qr-payment.controller';
import { TenantsModule } from '../../tenants/tenants.module';
import { SafeHttpClientService } from '../../common/http/safe-http-client.service';

/**
 * QrPaymentModule
 *
 * Módulo de pago vía QR dinámico (API MC4/SIP – Bolivia).
 * Incluye endpoints para Admin, Inquilino y el callback público del banco.
 */
@Module({
  imports: [TenantsModule],
  controllers: [
    AdminQrPaymentController,
    TenantQrPaymentController,
    PublicQrPaymentController,
  ],
  providers: [
    QrPaymentService,
    QrPaymentProcessingService,
    QrProviderService,
    QrPaymentPersistenceService,
    SafeHttpClientService,
  ],
  exports: [QrPaymentService],
})
export class QrPaymentModule {}
