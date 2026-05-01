import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExpensesService } from './expenses.service';
import { AdminExpensesController } from './expenses.controller';
import { Expense } from './entities/expense.entity';
import { TenantConfigModule } from '../tenant-config/tenant-config.module';

@Module({
  imports: [TypeOrmModule.forFeature([Expense]), TenantConfigModule],
  controllers: [AdminExpensesController],
  providers: [ExpensesService],
  exports: [ExpensesService],
})
export class ExpensesModule {}
