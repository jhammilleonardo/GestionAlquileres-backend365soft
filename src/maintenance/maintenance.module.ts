import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MaintenanceService } from './maintenance.service';
import {
  AdminMaintenanceController,
  TenantMaintenanceController,
  TecnicoMaintenanceController,
  OwnerMaintenanceController,
} from './maintenance.controller';
import { MaintenanceRequest } from './entities/maintenance-request.entity';
import { MaintenanceMessage } from './entities/maintenance-message.entity';
import { MaintenanceAttachment } from './entities/maintenance-attachment.entity';
import { MaintenanceStageHistory } from './entities/maintenance-stage-history.entity';
import { Contract } from '../contracts/entities/contract.entity';
import { NotificationsModule } from '../notifications/notifications.module';

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
  ],
  controllers: [
    AdminMaintenanceController,
    TenantMaintenanceController,
    TecnicoMaintenanceController,
    OwnerMaintenanceController,
  ],
  providers: [MaintenanceService],
  exports: [MaintenanceService],
})
export class MaintenanceModule {}
