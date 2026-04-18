import { Module } from '@nestjs/common';
import { SplitPaymentService } from './split-payment.service';

@Module({
  providers: [SplitPaymentService],
  exports: [SplitPaymentService],
})
export class SplitPaymentModule {}
