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
import { LifecycleNotificationsModule } from '../lifecycle-notifications/lifecycle-notifications.module';
import { ContractTemplatesModule } from '../contract-templates/contract-templates.module';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Contract, ContractHistory]),
    NotificationsModule,
    LifecycleNotificationsModule,
    ContractTemplatesModule,
    AuditLogsModule,
  ],
  providers: [ContractsService, PdfService],
  controllers: [AdminContractsController, TenantContractsController],
  exports: [ContractsService, PdfService],
})
export class ContractsModule {}
