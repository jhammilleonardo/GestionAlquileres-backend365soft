import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { BillingCronService } from './billing-cron.service';

/**
 * Scheduler de facturación.
 * Corre cada hora en UTC. BillingCronService verifica internamente si es
 * medianoche (o día 1 del mes) en la zona horaria de cada tenant antes
 * de ejecutar la lógica de negocio.
 */
@Injectable()
export class BillingCronScheduler {
  private readonly logger = new Logger(BillingCronScheduler.name);

  constructor(private readonly billingService: BillingCronService) {}

  /** Cada hora — mora y recordatorios de pago para tenants cuya medianoche coincida. */
  @Cron('0 * * * *')
  async runDailyBilling(): Promise<void> {
    this.logger.log('Iniciando ciclo de facturación diaria');
    await this.billingService.runDailyBilling();
    this.logger.log('Ciclo de facturación diaria completado');
  }

  /** Cada hora — genera liquidaciones para tenants en cuyo día 1 del mes sea ahora. */
  @Cron('0 * * * *')
  async runMonthlyStatements(): Promise<void> {
    this.logger.log('Iniciando ciclo de liquidaciones mensuales');
    await this.billingService.runMonthlyStatements();
    this.logger.log('Ciclo de liquidaciones mensuales completado');
  }
}
