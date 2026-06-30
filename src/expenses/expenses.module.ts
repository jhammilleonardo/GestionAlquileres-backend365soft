import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExpensesService } from './expenses.service';
import { AdminExpensesController } from './expenses.controller';
import { Expense } from './entities/expense.entity';
import { AccountingModule } from '../accounting/accounting.module';
import { StorageModule } from '../common/storage/storage.module';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Expense]),
    AccountingModule,
    StorageModule,
    AuditLogsModule,
  ],
  controllers: [AdminExpensesController],
  providers: [ExpensesService],
  exports: [ExpensesService],
})
export class ExpensesModule {}
