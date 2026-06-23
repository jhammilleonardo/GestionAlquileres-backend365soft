import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OwnerStatementsService } from './owner-statements.service';
import { OwnerStatementPdfService } from './owner-statement-pdf.service';
import { AdminOwnerStatementsController } from './owner-statements.controller';
import { OwnerStatement } from './entities/owner-statement.entity';
import { AccountingModule } from '../accounting/accounting.module';

@Module({
  imports: [TypeOrmModule.forFeature([OwnerStatement]), AccountingModule],
  providers: [OwnerStatementsService, OwnerStatementPdfService],
  controllers: [AdminOwnerStatementsController],
  exports: [OwnerStatementsService, OwnerStatementPdfService],
})
export class OwnerStatementsModule {}
