import { ForbiddenException } from '@nestjs/common';
import type { Request, Response } from 'express';
import type { DataSource } from 'typeorm';
import type { TenantRequest } from '../middleware/tenant-context.middleware';
import type { StorageService } from './storage.service';
import { StorageController } from './storage.controller';

describe('StorageController private file access', () => {
  let dataSource: { query: jest.Mock };
  let storageService: {
    buildStoragePath: jest.Mock;
    resolveReadAccess: jest.Mock;
  };
  let controller: StorageController;
  let response: jest.Mocked<
    Pick<Response, 'setHeader' | 'sendFile' | 'redirect'>
  >;

  beforeEach(() => {
    dataSource = { query: jest.fn() };
    storageService = {
      buildStoragePath: jest.fn((...segments: string[]) =>
        ['storage', ...segments].join('/'),
      ),
      resolveReadAccess: jest.fn().mockResolvedValue({
        kind: 'local',
        absolutePath: '/tmp/receipt.webp',
      }),
    };
    controller = new StorageController(
      storageService as unknown as StorageService,
      dataSource as unknown as DataSource,
    );
    response = {
      setHeader: jest.fn(),
      sendFile: jest.fn(),
      redirect: jest.fn(),
    };
  });

  it('serves a receipt when the authenticated tenant owns the payment', async () => {
    dataSource.query
      .mockResolvedValueOnce([{ schema_name: 'tenant_acme' }])
      .mockResolvedValueOnce([
        {
          tenant_id: 7,
          contract_tenant_id: 7,
          owner_allowed: false,
        },
      ]);

    await controller.serveReceipt(
      'acme',
      'receipt.webp',
      requestFor({ userId: 7, role: 'INQUILINO' }),
      response as unknown as Response,
    );

    expect(response.sendFile).toHaveBeenCalledWith('/tmp/receipt.webp');
  });

  it('blocks a receipt for another authenticated user in the same tenant', async () => {
    dataSource.query
      .mockResolvedValueOnce([{ schema_name: 'tenant_acme' }])
      .mockResolvedValueOnce([
        {
          tenant_id: 7,
          contract_tenant_id: 7,
          owner_allowed: false,
        },
      ]);

    await expect(
      controller.serveReceipt(
        'acme',
        'receipt.webp',
        requestFor({ userId: 99, role: 'INQUILINO' }),
        response as unknown as Response,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(storageService.resolveReadAccess).not.toHaveBeenCalled();
  });

  function requestFor(params: { userId: number; role: string }): Request {
    return {
      user: {
        userId: params.userId,
        email: `${params.userId}@example.com`,
        role: params.role,
        tenantSlug: 'acme',
      },
    } as TenantRequest;
  }
});
