import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';

@Injectable()
export class ProductionReadinessService implements OnApplicationBootstrap {
  private readonly logger = new Logger(ProductionReadinessService.name);

  onApplicationBootstrap(): void {
    if (!this.shouldValidate()) {
      return;
    }

    const errors = [
      ...this.validateCoreSecurity(),
      ...this.validateCorsAndProxy(),
      ...this.validateStorage(),
      ...this.validatePaymentProviders(),
      ...this.validateObservability(),
      ...this.validateOperations(),
    ];

    if (errors.length > 0) {
      throw new Error(
        `Configuración de producción incompleta:\n- ${errors.join('\n- ')}`,
      );
    }

    this.logger.log('Configuración de producción validada correctamente');
  }

  private shouldValidate(): boolean {
    return (
      process.env.NODE_ENV === 'production' ||
      this.envBool('STRICT_CONFIG_VALIDATION')
    );
  }

  private validateCoreSecurity(): string[] {
    const errors: string[] = [];
    const jwtSecret = process.env.JWT_SECRET ?? '';
    const dbPassword = process.env.DB_PASSWORD ?? '';

    if (jwtSecret.length < 32 || /super-secret|change|dev/i.test(jwtSecret)) {
      errors.push(
        'JWT_SECRET debe ser real, aleatorio y tener al menos 32 caracteres',
      );
    }

    if (!dbPassword || dbPassword === 'postgres' || dbPassword === 'password') {
      errors.push('DB_PASSWORD debe ser un secreto real, no un valor de dev');
    }

    if (!this.envBool('SECRET_ROTATION_POLICY_ACK')) {
      errors.push(
        'SECRET_ROTATION_POLICY_ACK=true debe confirmar política de rotación de secretos',
      );
    }

    return errors;
  }

  private validateCorsAndProxy(): string[] {
    const errors: string[] = [];
    const frontendUrls = process.env.FRONTEND_URLS ?? '';

    if (
      !frontendUrls ||
      frontendUrls.includes('*') ||
      frontendUrls.includes('localhost')
    ) {
      errors.push(
        'FRONTEND_URLS debe listar dominios HTTPS reales, sin wildcard ni localhost',
      );
    }

    if (
      !this.envBool('HTTPS_ENABLED') &&
      !this.envBool('TLS_TERMINATED_BY_PROXY')
    ) {
      errors.push(
        'HTTPS_ENABLED=true o TLS_TERMINATED_BY_PROXY=true debe estar definido',
      );
    }

    if (
      this.envBool('TLS_TERMINATED_BY_PROXY') &&
      !this.envBool('TRUST_PROXY')
    ) {
      errors.push('TRUST_PROXY=true es requerido si TLS termina en el proxy');
    }

    if (!this.envBool('RATE_LIMIT_POLICY_ACK')) {
      errors.push(
        'RATE_LIMIT_POLICY_ACK=true debe confirmar la política final de rate limiting',
      );
    }

    return errors;
  }

  private validateStorage(): string[] {
    const errors: string[] = [];
    const driver = (process.env.STORAGE_DRIVER ?? 'local').toLowerCase();

    if (driver !== 's3' && !this.envBool('ALLOW_LOCAL_STORAGE_IN_PRODUCTION')) {
      errors.push(
        'STORAGE_DRIVER=s3 es requerido en producción, salvo ALLOW_LOCAL_STORAGE_IN_PRODUCTION=true',
      );
    }

    if (driver === 's3') {
      this.requireAll(errors, [
        'AWS_REGION',
        'AWS_BUCKET_NAME',
        'AWS_ACCESS_KEY_ID',
        'AWS_SECRET_ACCESS_KEY',
      ]);
    }

    return errors;
  }

  private validatePaymentProviders(): string[] {
    const errors: string[] = [];

    if (this.envBool('MC4_ENABLED')) {
      this.requireAll(errors, [
        'MC4_AUTH_URL',
        'MC4_QR_URL',
        'MC4_STATUS_URL',
        'MC4_API_KEY_AUTH',
        'MC4_API_KEY_SERVICIO',
        'MC4_USERNAME',
        'MC4_PASSWORD',
        'MC4_CALLBACK_SECRET',
      ]);

      if ((process.env.MC4_CALLBACK_SECRET ?? '').length < 32) {
        errors.push('MC4_CALLBACK_SECRET debe tener al menos 32 caracteres');
      }
    }

    if (this.envBool('STRIPE_ENABLED')) {
      this.requireAll(errors, ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET']);
      if ((process.env.STRIPE_SECRET_KEY ?? '').startsWith('sk_test_')) {
        errors.push('STRIPE_SECRET_KEY debe ser live en producción');
      }
    }

    if (this.envBool('PAYPAL_ENABLED')) {
      this.requireAll(errors, [
        'PAYPAL_CLIENT_ID',
        'PAYPAL_CLIENT_SECRET',
        'PAYPAL_WEBHOOK_ID',
        'PAYPAL_BASE_URL',
      ]);
      if (process.env.PAYPAL_BASE_URL !== 'https://api-m.paypal.com') {
        errors.push('PAYPAL_BASE_URL debe apuntar a producción');
      }
    }

    return errors;
  }

  private validateObservability(): string[] {
    const errors: string[] = [];
    const monitoringProvider = (
      process.env.MONITORING_PROVIDER ?? 'logger'
    ).toLowerCase();
    const notificationProvider = (
      process.env.LIFECYCLE_NOTIFICATION_PROVIDER ?? 'stub'
    ).toLowerCase();

    if (monitoringProvider === 'logger') {
      errors.push(
        'MONITORING_PROVIDER debe ser webhook u otro proveedor real en producción',
      );
    }

    if (monitoringProvider === 'webhook') {
      this.requireAll(errors, ['MONITORING_WEBHOOK_URL']);
    }

    if (
      notificationProvider === 'stub' &&
      !this.envBool('ALLOW_NOTIFICATION_STUB_IN_PRODUCTION')
    ) {
      errors.push(
        'LIFECYCLE_NOTIFICATION_PROVIDER debe ser sendgrid, twilio o whatsapp_cloud en producción',
      );
    }

    if (notificationProvider === 'sendgrid') {
      this.requireAll(errors, ['SENDGRID_API_KEY', 'SENDGRID_FROM_EMAIL']);
    }

    if (notificationProvider === 'twilio') {
      this.requireAll(errors, [
        'TWILIO_ACCOUNT_SID',
        'TWILIO_AUTH_TOKEN',
        'TWILIO_WHATSAPP_FROM',
      ]);
    }

    if (notificationProvider === 'whatsapp_cloud') {
      this.requireAll(errors, [
        'WHATSAPP_CLOUD_TOKEN',
        'WHATSAPP_CLOUD_PHONE_NUMBER_ID',
      ]);
    }

    if (!this.envBool('LOG_AGGREGATION_ENABLED')) {
      errors.push(
        'LOG_AGGREGATION_ENABLED=true debe confirmar logs centralizados',
      );
    }

    return errors;
  }

  private validateOperations(): string[] {
    const errors: string[] = [];

    if (!this.envBool('POSTGRES_BACKUP_ENABLED')) {
      errors.push(
        'POSTGRES_BACKUP_ENABLED=true debe confirmar backups automáticos de PostgreSQL',
      );
    }

    if (!this.envBool('PROVISIONING_RUNBOOK_ACK')) {
      errors.push(
        'PROVISIONING_RUNBOOK_ACK=true debe confirmar runbook de provisioning/startup upgrades',
      );
    }

    return errors;
  }

  private requireAll(errors: string[], names: string[]): void {
    for (const name of names) {
      if (!process.env[name]) {
        errors.push(`${name} es requerido`);
      }
    }
  }

  private envBool(name: string): boolean {
    return ['1', 'true', 'yes', 'on'].includes(
      (process.env[name] ?? '').trim().toLowerCase(),
    );
  }
}
