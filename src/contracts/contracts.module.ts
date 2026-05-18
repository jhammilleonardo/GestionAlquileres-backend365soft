import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ContractsService } from './contracts.service';
import { ContractCreationService } from './contract-creation.service';
import { ContractQueriesService } from './contract-queries.service';
import { ContractNumberService } from './contract-number.service';
import { ContractHistoryService } from './contract-history.service';
import { ContractRenewalService } from './contract-renewal.service';
import { ContractSigningService } from './contract-signing.service';
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
import { TenantsModule } from '../tenants/tenants.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Contract, ContractHistory]),
    NotificationsModule,
    LifecycleNotificationsModule,
    ContractTemplatesModule,
    AuditLogsModule,
    TenantsModule,
  ],
  providers: [
    ContractsService,
    ContractCreationService,
    ContractQueriesService,
    ContractNumberService,
    ContractHistoryService,
    ContractRenewalService,
    ContractSigningService,
    PdfService,
  ],
  controllers: [AdminContractsController, TenantContractsController],
  exports: [
    ContractsService,
    ContractCreationService,
    ContractQueriesService,
    ContractNumberService,
    ContractHistoryService,
    ContractRenewalService,
    ContractSigningService,
    PdfService,
  ],
})
export class ContractsModule {}
