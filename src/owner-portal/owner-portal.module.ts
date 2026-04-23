import { Module } from '@nestjs/common';
import { OwnerPortalController } from './owner-portal.controller';
import { OwnerPortalService } from './owner-portal.service';
import { OwnerStatementsModule } from '../owner-statements/owner-statements.module';

@Module({
  imports: [OwnerStatementsModule],
  controllers: [OwnerPortalController],
  providers: [OwnerPortalService],
})
export class OwnerPortalModule {}
