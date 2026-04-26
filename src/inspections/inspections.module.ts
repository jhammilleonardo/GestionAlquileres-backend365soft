import { Module } from '@nestjs/common';
import { InspectionsController } from './inspections.controller';
import { InspectionsService } from './inspections.service';
import { LifecycleNotificationsModule } from '../lifecycle-notifications/lifecycle-notifications.module';

@Module({
  imports: [LifecycleNotificationsModule],
  controllers: [InspectionsController],
  providers: [InspectionsService],
  exports: [InspectionsService],
})
export class InspectionsModule {}
