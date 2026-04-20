import { Module, Global } from '@nestjs/common';
import { TenantAwareDataSource } from './tenant-aware-data-source';
import { TenantConnectionInterceptor } from '../interceptors/tenant-connection.interceptor';

/**
 * Módulo global que provee TenantAwareDataSource y registra el interceptor
 * de conexión por request.
 *
 * @Global() hace que TenantAwareDataSource esté disponible en todos los
 * módulos sin necesidad de importar TenantModule explícitamente.
 */
@Global()
@Module({
  providers: [TenantAwareDataSource, TenantConnectionInterceptor],
  exports: [TenantAwareDataSource, TenantConnectionInterceptor],
})
export class TenantModule {}
