import { Module } from '@nestjs/common';
import { AccountingLedgerService } from './accounting-ledger.service';
import { AccountingExpensePostingService } from './accounting-expense-posting.service';
import { AccountingOutboxProcessor } from './accounting-outbox.processor';
import { AccountingOutboxService } from './accounting-outbox.service';
import { AccountingOwnerStatementPostingService } from './accounting-owner-statement-posting.service';
import { AccountingPeriodsService } from './accounting-periods.service';
import { AccountingPaymentPostingService } from './accounting-payment-posting.service';
import { AccountingPaymentRefundPostingService } from './accounting-payment-refund-posting.service';
import { AccountingDashboardService } from './accounting-dashboard.service';
import { AccountingFinancialIntegrityService } from './accounting-financial-integrity.service';
import { AccountingBankReconciliationService } from './accounting-bank-reconciliation.service';
import { AccountingQueriesService } from './accounting-queries.service';
import { AccountingReportsService } from './accounting-reports.service';
import { AccountingManualEntryService } from './accounting-manual-entry.service';
import { AccountingController } from './accounting.controller';
import { PaymentLedgerService } from '../payments/payment-ledger.service';
import { TenantsModule } from '../tenants/tenants.module';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';

@Module({
  imports: [TenantsModule, AuditLogsModule],
  controllers: [AccountingController],
  providers: [
    AccountingLedgerService,
    AccountingManualEntryService,
    AccountingPeriodsService,
    AccountingOutboxService,
    AccountingExpensePostingService,
    AccountingOwnerStatementPostingService,
    AccountingPaymentPostingService,
    AccountingPaymentRefundPostingService,
    AccountingOutboxProcessor,
    AccountingDashboardService,
    AccountingFinancialIntegrityService,
    AccountingBankReconciliationService,
    AccountingQueriesService,
    AccountingReportsService,
    PaymentLedgerService,
  ],
  exports: [
    AccountingLedgerService,
    AccountingOutboxService,
    AccountingPeriodsService,
    AccountingDashboardService,
    AccountingFinancialIntegrityService,
    AccountingBankReconciliationService,
    AccountingQueriesService,
    AccountingReportsService,
  ],
})
export class AccountingModule {}
