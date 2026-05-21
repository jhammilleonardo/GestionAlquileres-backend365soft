import { Module } from '@nestjs/common';
import { InspectionsController } from './inspections.controller';
import { InspectionsService } from './inspections.service';
import { InspectionPhotosService } from './inspection-photos.service';
import { InspectionPdfService } from './inspection-pdf.service';
import { LifecycleNotificationsModule } from '../lifecycle-notifications/lifecycle-notifications.module';
import { StorageModule } from '../common/storage/storage.module';

@Module({
  imports: [LifecycleNotificationsModule, StorageModule],
  controllers: [InspectionsController],
  providers: [
    InspectionsService,
    InspectionPhotosService,
    InspectionPdfService,
  ],
  exports: [InspectionsService],
})
export class InspectionsModule {}
