import { Module } from '@nestjs/common';
import { LifecycleNotificationsService } from './lifecycle-notifications.service';
import { LifecycleNotificationsCron } from './lifecycle-notifications.cron';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  providers: [LifecycleNotificationsService, LifecycleNotificationsCron],
  exports: [LifecycleNotificationsService],
})
export class LifecycleNotificationsModule {}
