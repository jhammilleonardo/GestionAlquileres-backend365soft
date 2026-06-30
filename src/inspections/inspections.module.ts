import { Module } from '@nestjs/common';
import { InspectionsController } from './inspections.controller';
import { InspectionTemplatesController } from './inspection-templates.controller';
import { InspectionsService } from './inspections.service';
import { InspectionTemplatesService } from './inspection-templates.service';
import { InspectionPhotosService } from './inspection-photos.service';
import { InspectionPdfService } from './inspection-pdf.service';
import { LifecycleNotificationsModule } from '../lifecycle-notifications/lifecycle-notifications.module';
import { StorageModule } from '../common/storage/storage.module';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';

@Module({
  imports: [LifecycleNotificationsModule, StorageModule, AuditLogsModule],
  controllers: [InspectionsController, InspectionTemplatesController],
  providers: [
    InspectionsService,
    InspectionTemplatesService,
    InspectionPhotosService,
    InspectionPdfService,
  ],
  exports: [InspectionsService],
})
export class InspectionsModule {}
