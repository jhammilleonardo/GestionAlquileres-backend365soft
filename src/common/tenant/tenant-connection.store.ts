import { AsyncLocalStorage } from 'async_hooks';
import type { QueryRunner } from 'typeorm';

export interface TenantStore {
  queryRunner: QueryRunner | null;
  schemaName: string | null;
}

/**
 * Almacén por-request usando AsyncLocalStorage nativo de Node.js.
 *
 * Evita dependencias externas para contexto asíncrono — `AsyncLocalStorage`
 * es estable desde Node 16 y propaga el contexto a través de await, callbacks
 * y streams sin configuración adicional.
 *
 * Se inicializa en TenantConnectionInterceptor antes de cada request y se
 * lee en TenantAwareDataSource para garantizar que todas las queries del
 * mismo request usan la misma conexión (y el mismo search_path).
 */
export const tenantConnectionStore = new AsyncLocalStorage<TenantStore>();
