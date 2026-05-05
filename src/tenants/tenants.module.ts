import { Module, OnModuleInit } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TenantsService } from './tenants.service';
import { TenantsController } from './tenants.controller';
import { Tenant } from './metadata/tenant.entity';
import { DataSource } from 'typeorm';

@Module({
  imports: [TypeOrmModule.forFeature([Tenant])],
  providers: [TenantsService],
  controllers: [TenantsController],
  exports: [TenantsService],
})
export class TenantsModule implements OnModuleInit {
  constructor(private dataSource: DataSource) {}

  async onModuleInit() {
    await this.initializeTenantTable();
  }

  private async initializeTenantTable() {
    try {
      // Verificar si la tabla tenant existe
      const result = await this.dataSource.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables
          WHERE table_schema = 'public'
          AND table_name = 'tenant'
        );
      `);

      if (!result[0].exists) {
        console.log('⚠️  Tabla "tenant" no existe. Creándola...');

        // Crear la tabla tenant
        await this.dataSource.query(`
          CREATE TABLE public.tenant (
            id SERIAL PRIMARY KEY,
            slug VARCHAR NOT NULL UNIQUE,
            schema_name VARCHAR NOT NULL UNIQUE,
            company_name VARCHAR NOT NULL,
            logo_url VARCHAR,
            currency VARCHAR DEFAULT 'BOB',
            locale VARCHAR DEFAULT 'es-BO',
            is_active BOOLEAN DEFAULT true,
            created_at TIMESTAMP NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMP NOT NULL DEFAULT NOW()
          );

          CREATE INDEX IF NOT EXISTS IDX_TENANT_SLUG ON public.tenant(slug);
          CREATE INDEX IF NOT EXISTS IDX_TENANT_SCHEMA_NAME ON public.tenant(schema_name);
          CREATE INDEX IF NOT EXISTS IDX_TENANT_IS_ACTIVE ON public.tenant(is_active);
        `);

        console.log('✅ Tabla "tenant" creada exitosamente en schema public');
      } else {
        console.log('✅ Tabla "tenant" ya existe');
      }

      // Seguridad operativa: por defecto un tenant nuevo queda inactivo
      // hasta completar provisioning de schema/tablas.
      await this.dataSource.query(`
        ALTER TABLE public.tenant
        ALTER COLUMN is_active SET DEFAULT false;
      `);
    } catch (error) {
      console.error('❌ Error al inicializar la tabla tenant:', error);
      throw error;
    }
  }
}
