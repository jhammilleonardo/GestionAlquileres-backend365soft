import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OwnerStatementsService } from './owner-statements.service';
import { OwnerStatementPdfService } from './owner-statement-pdf.service';
import { AdminOwnerStatementsController, OwnerStatementPortalController } from './owner-statements.controller';
import { OwnerStatement } from './entities/owner-statement.entity';

@Module({
  imports: [TypeOrmModule.forFeature([OwnerStatement])],
  providers: [OwnerStatementsService, OwnerStatementPdfService],
  controllers: [AdminOwnerStatementsController, OwnerStatementPortalController],
  exports: [OwnerStatementsService, OwnerStatementPdfService],
})
export class OwnerStatementsModule {}
