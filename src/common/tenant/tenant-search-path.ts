import { QueryRunner } from 'typeorm';

import { quoteIdent } from '../utils/sql-identifier';
import { tenantConnectionStore } from './tenant-connection.store';

/**
 * Fija el `search_path` del tenant actual en un QueryRunner creado a mano.
 *
 * Los runners dedicados (transacciones con `FOR UPDATE`) NO pasan por el patch
 * de `DataSource.query` del {@link TenantConnectionInterceptor}, así que toman
 * una conexión del pool con `search_path = public` y las tablas del tenant
 * "no existen" (error `relation "..." does not exist`). Este helper lee el
 * schema del request desde el store y lo aplica al runner, igual que el
 * interceptor lo hace para el resto de queries.
 */
export async function applyTenantSearchPath(
  queryRunner: QueryRunner,
): Promise<void> {
  const schemaName = tenantConnectionStore.getStore()?.schemaName;
  const searchPath = schemaName
    ? `${quoteIdent(schemaName)}, public`
    : 'public';
  await queryRunner.query(`SET search_path TO ${searchPath}`);
}
