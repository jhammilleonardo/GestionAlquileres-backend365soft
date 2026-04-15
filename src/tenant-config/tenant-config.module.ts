import { Module } from '@nestjs/common';
import { TenantConfigService } from './tenant-config.service';
import { TenantConfigController } from './tenant-config.controller';

@Module({
  providers: [TenantConfigService],
  controllers: [TenantConfigController],
  exports: [TenantConfigService],
})
export class TenantConfigModule {}
