import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ContractsService } from './contracts.service';
import { PdfService } from './pdf.service';
import {
  AdminContractsController,
  TenantContractsController,
} from './contracts.controller';
import { Contract } from './entities/contract.entity';
import { ContractHistory } from './entities/contract-history.entity';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [TypeOrmModule.forFeature([Contract, ContractHistory]), NotificationsModule],
  providers: [ContractsService, PdfService],
  controllers: [AdminContractsController, TenantContractsController],
  exports: [ContractsService, PdfService],
})
export class ContractsModule {}
