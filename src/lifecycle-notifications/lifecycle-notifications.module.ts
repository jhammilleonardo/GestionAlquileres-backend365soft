import { Module } from '@nestjs/common';
import { LifecycleNotificationsService } from './lifecycle-notifications.service';
import { LifecycleNotificationsCron } from './lifecycle-notifications.cron';
import { NotificationsModule } from '../notifications/notifications.module';
import { LifecycleExternalNotificationAdapter } from './lifecycle-external-notification.adapter';

@Module({
  imports: [NotificationsModule],
  providers: [
    LifecycleNotificationsService,
    LifecycleNotificationsCron,
    LifecycleExternalNotificationAdapter,
  ],
  exports: [LifecycleNotificationsService],
})
export class LifecycleNotificationsModule {}
