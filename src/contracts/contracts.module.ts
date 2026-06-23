import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ContractsService } from './contracts.service';
import { ContractCreationService } from './contract-creation.service';
import { ContractCreationSideEffectsService } from './contract-creation-side-effects.service';
import { ContractCreationValidationService } from './contract-creation-validation.service';
import { ContractQueriesService } from './contract-queries.service';
import { ContractNumberService } from './contract-number.service';
import { ContractHistoryService } from './contract-history.service';
import { ContractRenewalService } from './contract-renewal.service';
import { ContractSigningService } from './contract-signing.service';
import { ContractPdfService } from './contract-pdf.service';
import { ContractUpdateService } from './contract-update.service';
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
import { TenantConfigModule } from '../tenant-config/tenant-config.module';
import { StorageModule } from '../common/storage/storage.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Contract, ContractHistory]),
    NotificationsModule,
    LifecycleNotificationsModule,
    ContractTemplatesModule,
    AuditLogsModule,
    TenantsModule,
    TenantConfigModule,
    StorageModule,
  ],
  providers: [
    ContractsService,
    ContractCreationService,
    ContractCreationSideEffectsService,
    ContractCreationValidationService,
    ContractQueriesService,
    ContractNumberService,
    ContractHistoryService,
    ContractUpdateService,
    ContractRenewalService,
    ContractSigningService,
    ContractPdfService,
    PdfService,
  ],
  controllers: [AdminContractsController, TenantContractsController],
  exports: [
    ContractsService,
    ContractCreationService,
    ContractCreationSideEffectsService,
    ContractCreationValidationService,
    ContractQueriesService,
    ContractNumberService,
    ContractHistoryService,
    ContractUpdateService,
    ContractRenewalService,
    ContractSigningService,
    ContractPdfService,
    PdfService,
  ],
})
export class ContractsModule {}
