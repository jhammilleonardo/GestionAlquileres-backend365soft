import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ReservationExpiryService } from './reservation-expiry.service';

/**
 * Dispara la expiración de reservas PENDING vencidas. Cada 15 minutos es
 * suficiente: el TTL es de horas, no de minutos, y mantiene la latencia baja
 * para liberar fechas sin cargar la BD.
 */
@Injectable()
export class ReservationExpiryScheduler {
  private readonly logger = new Logger(ReservationExpiryScheduler.name);

  constructor(private readonly expiryService: ReservationExpiryService) {}

  @Cron('*/15 * * * *')
  async run(): Promise<void> {
    await this.expiryService.expireStalePendingReservations();
  }
}
