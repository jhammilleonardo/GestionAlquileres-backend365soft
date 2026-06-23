import { Module } from '@nestjs/common';
import { ReservationsService } from './reservations.service';
import { ReservationsAdminService } from './reservations-admin.service';
import { QuoteService } from './quote.service';
import { ReservationExpiryService } from './reservation-expiry.service';
import { ReservationExpiryScheduler } from './reservation-expiry.scheduler';
import { ReservationNotificationService } from './reservation-notification.service';
import { ReservationRefundService } from './reservation-refund.service';
import { ReservationAnalyticsService } from './reservation-analytics.service';
import { IcalService } from './ical/ical.service';
import { CalendarSyncService } from './ical/calendar-sync.service';
import { CalendarSyncScheduler } from './ical/calendar-sync.scheduler';
import { SeasonRulesService } from './season-rules.service';
import { HousekeepingService } from './housekeeping.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { SafeHttpClientService } from '../common/http/safe-http-client.service';
import {
  PublicAvailabilityController,
  PublicQuoteController,
  AdminReservationsController,
  AdminReservationManagementController,
  TenantReservationsController,
  AdminUnitCalendarController,
  AdminUnitSeasonsController,
  AdminHousekeepingController,
  AdminCalendarSyncController,
} from './reservations.controller';

@Module({
  imports: [NotificationsModule],
  providers: [
    ReservationsService,
    ReservationsAdminService,
    QuoteService,
    ReservationExpiryService,
    ReservationExpiryScheduler,
    ReservationNotificationService,
    ReservationRefundService,
    ReservationAnalyticsService,
    IcalService,
    CalendarSyncService,
    CalendarSyncScheduler,
    SeasonRulesService,
    HousekeepingService,
    SafeHttpClientService,
  ],
  controllers: [
    PublicAvailabilityController,
    PublicQuoteController,
    AdminReservationsController,
    AdminReservationManagementController,
    TenantReservationsController,
    AdminUnitCalendarController,
    AdminUnitSeasonsController,
    AdminHousekeepingController,
    AdminCalendarSyncController,
  ],
  exports: [ReservationsService, ReservationsAdminService, QuoteService],
})
export class ReservationsModule {}
