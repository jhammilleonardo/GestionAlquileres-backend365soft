import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ApplicationsService } from './applications.service';
import { ApplicationApprovalContractFactoryService } from './application-approval-contract-factory.service';
import { ApplicationApprovalSideEffectsService } from './application-approval-side-effects.service';
import { ApplicationApprovalService } from './application-approval.service';
import { ApplicationCreationService } from './application-creation.service';
import { ApplicationDocumentsService } from './application-documents.service';
import { ApplicationQueriesService } from './application-queries.service';
import { ApplicationScreeningFeeService } from './application-screening-fee.service';
import { ApplicationScreeningDecisionService } from './application-screening-decision.service';
import { ApplicationScreeningService } from './application-screening.service';
import { ApplicationStatusService } from './application-status.service';
import { ApplicationsController } from './applications.controller';
import { RentalApplication } from './entities/application.entity';
import { ScreeningChecklist } from './entities/screening-checklist.entity';
import { NotificationsModule } from '../notifications/notifications.module';
import { UsersModule } from '../users/users.module';
import { ContractsModule } from '../contracts/contracts.module';
import { BlacklistModule } from '../blacklist/blacklist.module';
import { TenantsModule } from '../tenants/tenants.module';
import { StorageModule } from '../common/storage/storage.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([RentalApplication, ScreeningChecklist]),
    NotificationsModule,
    UsersModule,
    ContractsModule,
    BlacklistModule,
    TenantsModule,
    StorageModule,
  ],
  controllers: [ApplicationsController],
  providers: [
    ApplicationsService,
    ApplicationApprovalContractFactoryService,
    ApplicationApprovalSideEffectsService,
    ApplicationApprovalService,
    ApplicationCreationService,
    ApplicationDocumentsService,
    ApplicationQueriesService,
    ApplicationScreeningFeeService,
    ApplicationScreeningDecisionService,
    ApplicationScreeningService,
    ApplicationStatusService,
  ],
  exports: [
    ApplicationsService,
    ApplicationApprovalContractFactoryService,
    ApplicationApprovalSideEffectsService,
    ApplicationApprovalService,
    ApplicationCreationService,
    ApplicationDocumentsService,
    ApplicationQueriesService,
    ApplicationScreeningFeeService,
    ApplicationScreeningDecisionService,
    ApplicationScreeningService,
    ApplicationStatusService,
  ],
})
export class ApplicationsModule {}
