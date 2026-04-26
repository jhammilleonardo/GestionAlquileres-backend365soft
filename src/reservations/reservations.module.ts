import { Module } from '@nestjs/common';
import { ReservationsService } from './reservations.service';
import {
  PublicAvailabilityController,
  AdminReservationsController,
  TenantReservationsController,
} from './reservations.controller';

@Module({
  providers: [ReservationsService],
  controllers: [
    PublicAvailabilityController,
    AdminReservationsController,
    TenantReservationsController,
  ],
  exports: [ReservationsService],
})
export class ReservationsModule {}
