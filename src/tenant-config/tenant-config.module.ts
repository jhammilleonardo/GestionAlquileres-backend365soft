import { Module } from '@nestjs/common';
import { TenantConfigService } from './tenant-config.service';
import { TenantConfigController } from './tenant-config.controller';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';

@Module({
  imports: [AuditLogsModule],
  providers: [TenantConfigService],
  controllers: [TenantConfigController],
  exports: [TenantConfigService],
})
export class TenantConfigModule {}
