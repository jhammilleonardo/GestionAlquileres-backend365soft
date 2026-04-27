import { Module } from '@nestjs/common';
import { TenantWebsiteService } from './tenant-website.service';
import { TenantWebsiteController } from './tenant-website.controller';
import { PublicWebsiteController } from './public-website.controller';

@Module({
  providers: [TenantWebsiteService],
  controllers: [TenantWebsiteController, PublicWebsiteController],
  exports: [TenantWebsiteService],
})
export class TenantWebsiteModule {}
