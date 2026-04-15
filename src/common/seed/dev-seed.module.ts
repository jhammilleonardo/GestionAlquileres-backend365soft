import { Module } from '@nestjs/common';
import { DevSeedService } from './dev-seed.service';
import { AuthModule } from '../../auth/auth.module';

@Module({
  imports: [AuthModule],
  providers: [DevSeedService],
})
export class DevSeedModule {}
