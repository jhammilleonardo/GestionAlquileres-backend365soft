import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, QueryRunner } from 'typeorm';
import { tenantConnectionStore } from './tenant-connection.store';

/**
 * Reemplaza el token `DataSource` en todos los servicios de negocio.
 *
 * Cuando se llama dentro de un request HTTP (donde TenantConnectionInterceptor
 * ya inicializó el store), delega TODAS las queries al QueryRunner exclusivo
 * de ese request — garantizando que search_path es el correcto y no hay
 * race condition con otras conexiones del pool.
 *
 * Fuera de un request (startup migrations, seeds), cae al DataSource normal.
 *
 * Los servicios que actualmente declaran `@InjectDataSource() private dataSource`
 * no necesitan cambiar su código — sólo se sustituye qué se inyecta.
 *
 * IMPORTANTE: Este servicio es SINGLETON para no añadir overhead de DI.
 * El aislamiento por request lo da el AsyncLocalStorage, no el scope.
 */
@Injectable()
export class TenantAwareDataSource {
  constructor(
    @InjectDataSource()
    private readonly rawDataSource: DataSource,
  ) {}

  private getActiveRunner(): QueryRunner | null {
    return tenantConnectionStore.getStore()?.queryRunner ?? null;
  }

  // ── Proxy de los métodos más usados por los servicios ────────────────────

  async query<T = unknown>(sql: string, params?: unknown[]): Promise<T> {
    const runner = this.getActiveRunner();
    if (runner) {
      return runner.query(sql, params) as Promise<T>;
    }
    return this.rawDataSource.query(sql, params) as Promise<T>;
  }

  /**
   * Crea un QueryRunner que respeta el contexto del request.
   * Los servicios que necesiten transacciones explícitas deben usar
   * este método en lugar de `dataSource.createQueryRunner()`.
   */
  createQueryRunner(): QueryRunner {
    const runner = this.getActiveRunner();
    if (runner) {
      return runner;
    }
    return this.rawDataSource.createQueryRunner();
  }

  /** Acceso al DataSource subyacente para migraciones / DDL de inicio. */
  get rawSource(): DataSource {
    return this.rawDataSource;
  }

  // ── Delegaciones que algunos servicios usan ──────────────────────────────

  get isInitialized() {
    return this.rawDataSource.isInitialized;
  }

  getRepository<T>(entity: new () => T) {
    return this.rawDataSource.getRepository(entity);
  }

  manager() {
    return this.rawDataSource.manager;
  }
}

/**
 * Token de inyección para TenantAwareDataSource.
 * Se usa en los providers de cada módulo para reemplazar DataSource.
 */
export const TENANT_DATA_SOURCE = 'TENANT_DATA_SOURCE';
