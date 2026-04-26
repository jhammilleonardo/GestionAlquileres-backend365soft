import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { LifecycleNotificationsService } from './lifecycle-notifications.service';

@Injectable()
export class LifecycleNotificationsCron {
  private readonly logger = new Logger(LifecycleNotificationsCron.name);

  constructor(
    private readonly lifecycleService: LifecycleNotificationsService,
  ) {}

  /** Diariamente a las 08:00 UTC — verifica contratos próximos a vencer (60, 30, 15 días). */
  @Cron(CronExpression.EVERY_DAY_AT_8AM)
  async runContractExpiryCheck(): Promise<void> {
    this.logger.log('Iniciando verificación de contratos próximos a vencer');
    await this.lifecycleService.checkExpiringContracts();
    this.logger.log('Verificación de contratos completada');
  }

  /** Cada 6 horas — verifica solicitudes de mantenimiento sin respuesta por más de 48 horas. */
  @Cron('0 */6 * * *')
  async runMaintenanceUnassignedCheck(): Promise<void> {
    this.logger.log('Iniciando verificación de mantenimiento sin asignar');
    await this.lifecycleService.checkUnassignedMaintenance();
    this.logger.log('Verificación de mantenimiento completada');
  }
}
