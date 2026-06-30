import { Module } from '@nestjs/common';
import { ViolationsController } from './violations.controller';
import { ViolationsService } from './violations.service';
import { ViolationsPdfService } from './violations-pdf.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { StorageModule } from '../common/storage/storage.module';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';

@Module({
  imports: [NotificationsModule, StorageModule, AuditLogsModule],
  controllers: [ViolationsController],
  providers: [ViolationsService, ViolationsPdfService],
  exports: [ViolationsService],
})
export class ViolationsModule {}
