import { ProductionReadinessService } from './production-readiness.service';

describe('ProductionReadinessService', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('no valida en desarrollo por defecto', () => {
    process.env.NODE_ENV = 'development';
    delete process.env.STRICT_CONFIG_VALIDATION;

    expect(() =>
      new ProductionReadinessService().onApplicationBootstrap(),
    ).not.toThrow();
  });

  it('falla temprano si producción queda con secretos o adapters incompletos', () => {
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = 'dev';
    process.env.DB_PASSWORD = 'postgres';
    process.env.FRONTEND_URLS = 'http://localhost:4200';
    process.env.STORAGE_DRIVER = 'local';

    expect(() =>
      new ProductionReadinessService().onApplicationBootstrap(),
    ).toThrow(/Configuración de producción incompleta/);
  });

  it('acepta una configuración productiva completa con providers habilitados', () => {
    process.env = {
      ...process.env,
      NODE_ENV: 'production',
      JWT_SECRET:
        '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      DB_PASSWORD: 'prod-db-secret',
      FRONTEND_URLS: 'https://app.example.com',
      TLS_TERMINATED_BY_PROXY: 'true',
      TRUST_PROXY: 'true',
      RATE_LIMIT_POLICY_ACK: 'true',
      SECRET_ROTATION_POLICY_ACK: 'true',
      STORAGE_DRIVER: 's3',
      AWS_REGION: 'us-east-1',
      AWS_BUCKET_NAME: 'bucket',
      AWS_ACCESS_KEY_ID: 'access',
      AWS_SECRET_ACCESS_KEY: 'secret',
      MC4_ENABLED: 'true',
      MC4_AUTH_URL: 'https://mc4.example/auth',
      MC4_QR_URL: 'https://mc4.example/qr',
      MC4_STATUS_URL: 'https://mc4.example/status',
      MC4_API_KEY_AUTH: 'auth',
      MC4_API_KEY_SERVICIO: 'service',
      MC4_USERNAME: 'user',
      MC4_PASSWORD: 'pass',
      MC4_CALLBACK_SECRET:
        'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789',
      STRIPE_ENABLED: 'false',
      PAYPAL_ENABLED: 'false',
      MONITORING_PROVIDER: 'webhook',
      MONITORING_WEBHOOK_URL: 'https://monitoring.example/intake',
      LIFECYCLE_NOTIFICATION_PROVIDER: 'sendgrid',
      SENDGRID_API_KEY: 'sendgrid-key',
      SENDGRID_FROM_EMAIL: 'noreply@example.com',
      LOG_AGGREGATION_ENABLED: 'true',
      POSTGRES_BACKUP_ENABLED: 'true',
      PROVISIONING_RUNBOOK_ACK: 'true',
    };

    expect(() =>
      new ProductionReadinessService().onApplicationBootstrap(),
    ).not.toThrow();
  });
});
