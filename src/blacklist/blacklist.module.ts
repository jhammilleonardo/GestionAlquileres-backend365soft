import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BlacklistService } from './blacklist.service';
import {
  AdminBlacklistController,
  PublicBlacklistController,
} from './blacklist.controller';
import { BlacklistedTenant } from './entities/blacklisted-tenant.entity';
import { BlacklistAuditLog } from './entities/blacklist-audit-log.entity';
import { TenantsModule } from '../tenants/tenants.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([BlacklistedTenant, BlacklistAuditLog], 'default'),
    TenantsModule,
  ],
  providers: [BlacklistService],
  controllers: [AdminBlacklistController, PublicBlacklistController],
  exports: [BlacklistService],
})
export class BlacklistModule {}
