import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Observable } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { tenantConnectionStore } from '../tenant/tenant-connection.store';
import { quoteIdent } from '../utils/sql-identifier';
import type { TenantRequest } from '../middleware/tenant-context.middleware';

/**
 * Interceptor global que garantiza aislamiento de conexión por request.
 *
 * PROBLEMA que resuelve:
 *   `SET search_path` es una propiedad de la conexión PostgreSQL.
 *   Si el middleware setea el search_path en la conexión A del pool y el
 *   servicio luego pide una query que llega a la conexión B (pool), B no
 *   tiene el search_path correcto → potencial cross-tenant data leak.
 *
 * SOLUCIÓN:
 *   1. Al inicio de cada request: adquirir un QueryRunner dedicado del pool.
 *   2. Ejecutar `SET search_path TO "<schema>", public` en ESA conexión.
 *   3. Almacenar el QueryRunner en AsyncLocalStorage (sin costos de DI).
 *   4. TenantAwareDataSource lo recupera y lo usa en TODAS las queries del request.
 *   5. Al finalizar el request (éxito o error): liberar la conexión al pool.
 *
 * `SET search_path` (sin LOCAL) persiste en la conexión para la duración del
 * request. Antes de liberar la conexión se resetea a public.
 */
@Injectable()
export class TenantConnectionInterceptor implements NestInterceptor {
  private readonly logger = new Logger(TenantConnectionInterceptor.name);
  private static isDataSourcePatched = false;
  private readonly originalQuery: DataSource['query'];

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {
    this.originalQuery = this.dataSource.query.bind(
      this.dataSource,
    ) as DataSource['query'];
    this.patchDataSourceQuery();
  }

  /**
   * Redirige DataSource.query al QueryRunner del request (si existe contexto).
   * Esto elimina la dependencia de que todos los servicios usen un wrapper.
   */
  private patchDataSourceQuery(): void {
    if (TenantConnectionInterceptor.isDataSourcePatched) return;

    const rawQuery = this.originalQuery;
    this.dataSource.query = ((
      sql: string,
      params?: unknown[],
    ): Promise<unknown> => {
      const scopedRunner = tenantConnectionStore.getStore()?.queryRunner;
      if (scopedRunner) {
        return scopedRunner.query(sql, params);
      }
      return rawQuery(sql, params);
    }) as DataSource['query'];

    TenantConnectionInterceptor.isDataSourcePatched = true;
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<TenantRequest>();
    const schemaName = req.tenant?.schema_name ?? null;

    // Adquirimos la conexión y seteamos el schema ANTES de que el handler
    // empiece. Incluso las rutas sin tenant usan un QueryRunner con
    // search_path=public para evitar conexiones del pool con estado residual.
    const store = {
      queryRunner: null as ReturnType<DataSource['createQueryRunner']> | null,
      schemaName,
    };

    const result$ = new Observable((subscriber) => {
      const queryRunner = this.dataSource.createQueryRunner();

      void (async () => {
        try {
          await queryRunner.connect();
          const searchPath = schemaName
            ? `${quoteIdent(schemaName)}, public`
            : 'public';
          await queryRunner.query(`SET search_path TO ${searchPath}`);
          store.queryRunner = queryRunner;

          tenantConnectionStore.run(store, () => {
            next
              .handle()
              .pipe(
                finalize(() => {
                  void this.releaseQueryRunner(queryRunner);
                }),
              )
              .subscribe({
                next: (value) => subscriber.next(value),
                error: (err) => subscriber.error(err),
                complete: () => subscriber.complete(),
              });
          });
        } catch (err) {
          this.logger.error('TenantConnectionInterceptor setup failed', err);
          await queryRunner.release().catch(() => undefined);
          subscriber.error(err);
        }
      })();
    });

    return result$;
  }

  private async releaseQueryRunner(
    queryRunner: ReturnType<DataSource['createQueryRunner']>,
  ): Promise<void> {
    try {
      // Resetear antes de devolver al pool
      await queryRunner.query('SET search_path TO public');
    } catch {
      // Si falló, el pool lo recicla igual
    } finally {
      await queryRunner.release();
    }
  }
}
