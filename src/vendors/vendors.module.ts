import { Module } from '@nestjs/common';
import { VendorsService } from './vendors.service';
import { VendorsController } from './vendors.controller';
import { VendorPortalController } from './vendor-portal.controller';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuditLogsModule, AuthModule],
  providers: [VendorsService],
  controllers: [VendorsController, VendorPortalController],
  exports: [VendorsService],
})
export class VendorsModule {}
