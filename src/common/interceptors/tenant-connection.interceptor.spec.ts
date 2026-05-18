import { ExecutionContext, CallHandler } from '@nestjs/common';
import { lastValueFrom, of } from 'rxjs';
import { DataSource } from 'typeorm';
import { tenantConnectionStore } from '../tenant/tenant-connection.store';
import { TenantConnectionInterceptor } from './tenant-connection.interceptor';

describe('TenantConnectionInterceptor', () => {
  let queryRunner: {
    connect: jest.Mock;
    query: jest.Mock;
    release: jest.Mock;
  };
  let dataSource: {
    query: jest.Mock;
    createQueryRunner: jest.Mock;
  };

  beforeEach(() => {
    (
      TenantConnectionInterceptor as unknown as { isDataSourcePatched: boolean }
    ).isDataSourcePatched = false;

    queryRunner = {
      connect: jest.fn().mockResolvedValue(undefined),
      query: jest.fn().mockResolvedValue([]),
      release: jest.fn().mockResolvedValue(undefined),
    };
    dataSource = {
      query: jest.fn().mockResolvedValue([]),
      createQueryRunner: jest.fn().mockReturnValue(queryRunner),
    };
  });

  it('uses a dedicated public connection for requests without tenant', async () => {
    const interceptor = new TenantConnectionInterceptor(
      dataSource as unknown as DataSource,
    );

    await lastValueFrom(
      interceptor.intercept(
        buildContext({ tenant: undefined }),
        buildHandler(async () => {
          await dataSource.query('SELECT 1');
          return 'ok';
        }),
      ),
    );
    await flushPromises();

    expect(queryRunner.connect).toHaveBeenCalledTimes(1);
    expect(queryRunner.query).toHaveBeenNthCalledWith(
      1,
      'SET search_path TO public',
    );
    expect(queryRunner.query).toHaveBeenCalledWith('SELECT 1', undefined);
    expect(queryRunner.query).toHaveBeenCalledWith('SET search_path TO public');
    expect(queryRunner.release).toHaveBeenCalledTimes(1);
  });

  it('uses a dedicated tenant connection and exposes it through AsyncLocalStorage', async () => {
    const interceptor = new TenantConnectionInterceptor(
      dataSource as unknown as DataSource,
    );

    await lastValueFrom(
      interceptor.intercept(
        buildContext({ tenant: { schema_name: 'tenant_acme' } }),
        buildHandler(() => {
          expect(tenantConnectionStore.getStore()?.schemaName).toBe(
            'tenant_acme',
          );
          return 'ok';
        }),
      ),
    );
    await flushPromises();

    expect(queryRunner.query).toHaveBeenNthCalledWith(
      1,
      'SET search_path TO "tenant_acme", public',
    );
    expect(queryRunner.query).toHaveBeenCalledWith('SET search_path TO public');
    expect(queryRunner.release).toHaveBeenCalledTimes(1);
  });
});

function buildContext(request: unknown): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as ExecutionContext;
}

function buildHandler<T>(handler: () => T | Promise<T>): CallHandler {
  return {
    handle: () => of(handler()).pipe(),
  };
}

async function flushPromises(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve));
}
