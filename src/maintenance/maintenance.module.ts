import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MaintenanceService } from './maintenance.service';
import { MaintenanceCreationService } from './maintenance-creation.service';
import { MaintenanceLookupService } from './maintenance-lookup.service';
import { MaintenanceMessageNotificationsService } from './maintenance-message-notifications.service';
import { MaintenanceMessagesService } from './maintenance-messages.service';
import { MaintenanceStageService } from './maintenance-stage.service';
import { MaintenanceStatsService } from './maintenance-stats.service';
import { MaintenanceUpdateService } from './maintenance-update.service';
import { MaintenanceVendorsService } from './maintenance-vendors.service';
import {
  AdminMaintenanceController,
  TenantMaintenanceController,
  TecnicoMaintenanceController,
  VendorMaintenanceController,
} from './maintenance.controller';
import { MaintenanceRequest } from './entities/maintenance-request.entity';
import { MaintenanceMessage } from './entities/maintenance-message.entity';
import { MaintenanceAttachment } from './entities/maintenance-attachment.entity';
import { MaintenanceStageHistory } from './entities/maintenance-stage-history.entity';
import { Contract } from '../contracts/entities/contract.entity';
import { NotificationsModule } from '../notifications/notifications.module';
import { StorageModule } from '../common/storage/storage.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      MaintenanceRequest,
      MaintenanceMessage,
      MaintenanceAttachment,
      MaintenanceStageHistory,
      Contract,
    ]),
    NotificationsModule,
    StorageModule,
  ],
  controllers: [
    AdminMaintenanceController,
    TenantMaintenanceController,
    TecnicoMaintenanceController,
    VendorMaintenanceController,
  ],
  providers: [
    MaintenanceService,
    MaintenanceCreationService,
    MaintenanceLookupService,
    MaintenanceMessageNotificationsService,
    MaintenanceMessagesService,
    MaintenanceStageService,
    MaintenanceStatsService,
    MaintenanceUpdateService,
    MaintenanceVendorsService,
  ],
  exports: [MaintenanceService],
})
export class MaintenanceModule {}
