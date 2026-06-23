import { Module } from '@nestjs/common';
import { AccountingLedgerService } from './accounting-ledger.service';
import { AccountingExpensePostingService } from './accounting-expense-posting.service';
import { AccountingOutboxProcessor } from './accounting-outbox.processor';
import { AccountingOutboxService } from './accounting-outbox.service';
import { AccountingOwnerStatementPostingService } from './accounting-owner-statement-posting.service';
import { AccountingPeriodsService } from './accounting-periods.service';
import { AccountingPaymentPostingService } from './accounting-payment-posting.service';
import { AccountingPaymentRefundPostingService } from './accounting-payment-refund-posting.service';
import { AccountingQueriesService } from './accounting-queries.service';
import { AccountingReportsService } from './accounting-reports.service';
import { AccountingController } from './accounting.controller';
import { TenantsModule } from '../tenants/tenants.module';

@Module({
  imports: [TenantsModule],
  controllers: [AccountingController],
  providers: [
    AccountingLedgerService,
    AccountingPeriodsService,
    AccountingOutboxService,
    AccountingExpensePostingService,
    AccountingOwnerStatementPostingService,
    AccountingPaymentPostingService,
    AccountingPaymentRefundPostingService,
    AccountingOutboxProcessor,
    AccountingQueriesService,
    AccountingReportsService,
  ],
  exports: [
    AccountingLedgerService,
    AccountingOutboxService,
    AccountingPeriodsService,
    AccountingQueriesService,
    AccountingReportsService,
  ],
})
export class AccountingModule {}
