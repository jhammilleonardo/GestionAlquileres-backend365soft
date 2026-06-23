import { Module } from '@nestjs/common';
import { TenantWebsiteService } from './tenant-website.service';
import { TenantWebsiteController } from './tenant-website.controller';
import { PublicWebsiteController } from './public-website.controller';
import { PublicBrandingController } from './public-branding.controller';
import { StorageModule } from '../common/storage/storage.module';

@Module({
  imports: [StorageModule],
  providers: [TenantWebsiteService],
  controllers: [
    TenantWebsiteController,
    PublicWebsiteController,
    PublicBrandingController,
  ],
  exports: [TenantWebsiteService],
})
export class TenantWebsiteModule {}
