import { Module } from '@nestjs/common';
import { BillingCronService } from './billing-cron.service';
import { BillingCronScheduler } from './billing-cron.scheduler';
import { ErrorMonitoringService } from '../common/monitoring/error-monitoring.service';

@Module({
  providers: [BillingCronService, BillingCronScheduler, ErrorMonitoringService],
  exports: [BillingCronService],
})
export class BillingCronModule {}
