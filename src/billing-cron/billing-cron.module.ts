import { Module } from '@nestjs/common';
import { BillingCronService } from './billing-cron.service';
import { BillingCronScheduler } from './billing-cron.scheduler';

@Module({
  providers: [BillingCronService, BillingCronScheduler],
  exports: [BillingCronService],
})
export class BillingCronModule {}
