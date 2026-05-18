import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ApplicationsService } from './applications.service';
import { ApplicationApprovalService } from './application-approval.service';
import { ApplicationCreationService } from './application-creation.service';
import { ApplicationDocumentsService } from './application-documents.service';
import { ApplicationQueriesService } from './application-queries.service';
import { ApplicationScreeningFeeService } from './application-screening-fee.service';
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

@Module({
  imports: [
    TypeOrmModule.forFeature([RentalApplication, ScreeningChecklist]),
    NotificationsModule,
    UsersModule,
    ContractsModule,
    BlacklistModule,
    TenantsModule,
  ],
  controllers: [ApplicationsController],
  providers: [
    ApplicationsService,
    ApplicationApprovalService,
    ApplicationCreationService,
    ApplicationDocumentsService,
    ApplicationQueriesService,
    ApplicationScreeningFeeService,
    ApplicationScreeningService,
    ApplicationStatusService,
  ],
  exports: [
    ApplicationsService,
    ApplicationApprovalService,
    ApplicationCreationService,
    ApplicationDocumentsService,
    ApplicationQueriesService,
    ApplicationScreeningFeeService,
    ApplicationScreeningService,
    ApplicationStatusService,
  ],
})
export class ApplicationsModule {}
