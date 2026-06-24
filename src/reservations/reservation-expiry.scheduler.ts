import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ReservationExpiryService } from './reservation-expiry.service';

/**
 * Dispara la expiración de reservas vencidas (PENDING y PENDING_PAYMENT) y libera
 * sus fechas. Corre cada minuto porque el hold de pago QR es de 10 minutos: así
 * las fechas vuelven a estar disponibles para otros casi de inmediato al vencer.
 * La sentencia es un UPDATE indexado por estado/expires_at, barato de ejecutar.
 */
@Injectable()
export class ReservationExpiryScheduler {
  private readonly logger = new Logger(ReservationExpiryScheduler.name);

  constructor(private readonly expiryService: ReservationExpiryService) {}

  @Cron('* * * * *')
  async run(): Promise<void> {
    await this.expiryService.expireStalePendingReservations();
  }
}
