import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { CalendarSyncService } from './calendar-sync.service';

/**
 * Sincroniza los calendarios externos cada 6 horas. Los calendarios de terceros
 * no cambian al minuto; 6 h mantiene la disponibilidad fresca sin saturar la red
 * ni las fuentes externas.
 */
@Injectable()
export class CalendarSyncScheduler {
  private readonly logger = new Logger(CalendarSyncScheduler.name);

  constructor(private readonly syncService: CalendarSyncService) {}

  @Cron('0 */6 * * *')
  async run(): Promise<void> {
    this.logger.log('Iniciando sincronización de calendarios externos');
    await this.syncService.syncAllTenants();
  }
}
