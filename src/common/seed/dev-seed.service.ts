import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AuthService } from '../../auth/auth.service';
import { TenantCountry } from '../../tenants/dto/create-tenant.dto';

/**
 * Seed automático del entorno de desarrollo.
 *
 * Solo se ejecuta cuando NODE_ENV = 'development'.
 * Es completamente idempotente: si el tenant demo ya existe, no hace nada.
 *
 * Credenciales del admin de desarrollo:
 *   URL:      http://localhost:3000/demo/admin/...
 *   Email:    admin@365soft.com
 *   Password: Admin365!
 */
@Injectable()
export class DevSeedService implements OnModuleInit {
  private readonly logger = new Logger(DevSeedService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly authService: AuthService,
  ) {}

  async onModuleInit() {
    if (process.env.NODE_ENV !== 'development') return;

    try {
      await this.seedDevTenant();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Dev seed falló: ${msg}`);
    }
  }

  private async seedDevTenant() {
    const existing: { id: number }[] = await this.dataSource.query(
      `SELECT id FROM public.tenant WHERE slug = 'demo' LIMIT 1`,
    );

    if (existing.length > 0) {
      this.logger.log('Dev seed: tenant "demo" ya existe, nada que hacer.');
      return;
    }

    const seedEmail = process.env.DEV_SEED_EMAIL ?? 'admin@365soft.com';
    const seedPassword = process.env.DEV_SEED_PASSWORD ?? 'Admin365!';

    this.logger.log('Dev seed: creando tenant "demo" con admin inicial...');

    await this.authService.registerAdmin({
      slug: 'demo',
      company_name: '365Soft Demo',
      country: TenantCountry.BO,
      name: 'Admin Demo',
      email: seedEmail,
      password: seedPassword,
      currency: 'BOB',
      locale: 'es-BO',
    });

    this.logger.log('✔ Dev seed completado.');
    this.logger.log('  → Slug:     demo');
    this.logger.log(`  → Email:    ${seedEmail}`);
    this.logger.log('  → Password: (ver DEV_SEED_PASSWORD en .env)');
    this.logger.log('  → Login:    POST /auth/demo/login');
  }
}
