import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

export interface MonitoringContext {
  tags?: Record<string, string | number | boolean>;
  extra?: Record<string, unknown>;
}

type MonitoringProvider = 'logger' | 'webhook';

@Injectable()
export class ErrorMonitoringService {
  private readonly logger = new Logger(ErrorMonitoringService.name);
  private readonly provider = this.getProvider();
  private readonly serviceName =
    process.env.MONITORING_SERVICE_NAME ?? '365soft-backend';
  private readonly environment =
    process.env.MONITORING_ENVIRONMENT ?? process.env.NODE_ENV ?? 'development';

  captureException(error: unknown, context: MonitoringContext = {}): void {
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;

    this.logger.error(
      `Captured exception: ${message} context=${JSON.stringify(context)}`,
      stack,
    );

    if (this.provider !== 'webhook') {
      return;
    }

    void this.sendWebhook(error, context).catch((webhookError: unknown) => {
      this.logger.warn(
        `No se pudo enviar error al proveedor de monitoring: ${this.toMessage(
          webhookError,
        )}`,
      );
    });
  }

  private async sendWebhook(
    error: unknown,
    context: MonitoringContext,
  ): Promise<void> {
    const webhookUrl = process.env.MONITORING_WEBHOOK_URL;
    if (!webhookUrl) {
      this.logger.warn(
        'MONITORING_PROVIDER=webhook requiere MONITORING_WEBHOOK_URL',
      );
      return;
    }

    const apiKey = process.env.MONITORING_API_KEY;
    const errorObject =
      error instanceof Error ? error : new Error(String(error));
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (apiKey) {
      headers.Authorization = `Bearer ${apiKey}`;
    }

    await axios.post(
      webhookUrl,
      {
        service: this.serviceName,
        environment: this.environment,
        level: 'error',
        message: errorObject.message,
        stack: errorObject.stack,
        tags: context.tags ?? {},
        extra: context.extra ?? {},
        timestamp: new Date().toISOString(),
      },
      {
        headers,
        timeout: Number(process.env.MONITORING_TIMEOUT_MS ?? 5000),
      },
    );
  }

  private getProvider(): MonitoringProvider {
    const provider = (process.env.MONITORING_PROVIDER ?? 'logger')
      .trim()
      .toLowerCase();
    return provider === 'webhook' ? 'webhook' : 'logger';
  }

  private toMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
