import { BadRequestException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { LifecycleNotificationsService } from '../lifecycle-notifications/lifecycle-notifications.service';
import { NotificationsService } from '../notifications/notifications.service';
import { TenantsService } from '../tenants/tenants.service';
import { ContractHistoryService } from './contract-history.service';
import { ContractQueriesService } from './contract-queries.service';
import { ContractSigningService } from './contract-signing.service';
import { ContractStatus } from './enums/contract-status.enum';
import type { ContractResult } from './contracts.service';

describe('ContractSigningService', () => {
  let service: ContractSigningService;
  let dataSource: {
    query: jest.Mock<Promise<unknown>, [string, unknown[]?]>;
    createQueryRunner: jest.Mock;
  };
  let queryRunner: {
    connect: jest.Mock<Promise<void>, []>;
    startTransaction: jest.Mock<Promise<void>, []>;
    commitTransaction: jest.Mock<Promise<void>, []>;
    rollbackTransaction: jest.Mock<Promise<void>, []>;
    release: jest.Mock<Promise<void>, []>;
    query: jest.Mock<Promise<unknown>, [string, unknown[]?]>;
  };
  let notificationsService: {
    createForUserInSchema: jest.Mock;
    createForUser: jest.Mock;
  };
  let lifecycleNotificationsService: {
    onContractActivated: jest.Mock;
  };
  let auditLogsService: {
    log: jest.Mock;
  };
  let tenantsService: {
    findBySlug: jest.Mock;
  };

  const contract: ContractResult = {
    id: 1,
    contract_number: 'CTR-2026-0001',
    tenant_id: 10,
    property_id: 20,
    start_date: '2026-01-01',
    end_date: '2026-12-31',
    monthly_rent: 1000,
    currency: 'BOB',
    payment_day: 5,
    deposit_amount: 1000,
    status: ContractStatus.BORRADOR,
    created_at: new Date('2026-01-01'),
    updated_at: new Date('2026-01-01'),
  };

  beforeEach(() => {
    dataSource = {
      query: jest.fn<Promise<unknown>, [string, unknown[]?]>(),
      createQueryRunner: jest.fn(),
    };
    queryRunner = {
      connect: jest.fn<Promise<void>, []>().mockResolvedValue(undefined),
      startTransaction: jest
        .fn<Promise<void>, []>()
        .mockResolvedValue(undefined),
      commitTransaction: jest
        .fn<Promise<void>, []>()
        .mockResolvedValue(undefined),
      rollbackTransaction: jest
        .fn<Promise<void>, []>()
        .mockResolvedValue(undefined),
      release: jest.fn<Promise<void>, []>().mockResolvedValue(undefined),
      query: jest.fn<Promise<unknown>, [string, unknown[]?]>(),
    };
    dataSource.createQueryRunner.mockReturnValue(queryRunner);
    notificationsService = {
      createForUserInSchema: jest.fn().mockResolvedValue(undefined),
      createForUser: jest.fn().mockResolvedValue(undefined),
    };
    lifecycleNotificationsService = {
      onContractActivated: jest.fn().mockResolvedValue(undefined),
    };
    auditLogsService = {
      log: jest.fn().mockResolvedValue(undefined),
    };
    tenantsService = {
      findBySlug: jest.fn().mockResolvedValue({
        slug: 'acme',
        schema_name: 'tenant_acme',
      }),
    };

    const queryService = new ContractQueriesService(
      dataSource as unknown as DataSource,
      tenantsService as unknown as TenantsService,
    );
    const historyService = new ContractHistoryService(
      dataSource as unknown as DataSource,
    );

    service = new ContractSigningService(
      dataSource as unknown as DataSource,
      queryService,
      historyService,
      notificationsService as unknown as NotificationsService,
      lifecycleNotificationsService as unknown as LifecycleNotificationsService,
      auditLogsService as unknown as AuditLogsService,
      tenantsService as unknown as TenantsService,
    );
  });

  it('firma contrato con tablas calificadas por schema y notifica activación', async () => {
    queryRunner.query
      .mockResolvedValueOnce([contract])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    dataSource.query
      .mockResolvedValueOnce([{ id: 2 }])
      .mockResolvedValueOnce([{ ...contract, status: ContractStatus.ACTIVO }]);

    await expect(
      service.signContract(1, 10, '127.0.0.1', 'acme', {
        signatureImage: 'data:image/png;base64,AAA',
        signatureMethod: 'draw',
        userAgent: 'jest-agent',
      }),
    ).resolves.toMatchObject({
      id: 1,
      status: ContractStatus.ACTIVO,
    });

    expect(queryRunner.query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('FOR UPDATE'),
      [1],
    );
    expect(queryRunner.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('UPDATE "tenant_acme".contracts'),
      [
        ContractStatus.ACTIVO,
        '127.0.0.1',
        'data:image/png;base64,AAA',
        'draw',
        'jest-agent',
        1,
      ],
    );
    expect(queryRunner.query).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining('INSERT INTO "tenant_acme".contract_history'),
      [
        1,
        'status',
        ContractStatus.BORRADOR,
        ContractStatus.ACTIVO,
        10,
        'Firma digital del inquilino (Aceptación de términos)',
      ],
    );
    expect(queryRunner.query).toHaveBeenNthCalledWith(
      4,
      expect.stringContaining('UPDATE "tenant_acme".properties'),
      [20],
    );
    expect(queryRunner.commitTransaction).toHaveBeenCalledTimes(1);
    expect(notificationsService.createForUserInSchema).toHaveBeenCalledTimes(1);
    expect(
      lifecycleNotificationsService.onContractActivated,
    ).toHaveBeenCalledWith(1, 'tenant_acme');
    expect(auditLogsService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 10,
        action: 'signed',
        entityType: 'contract',
        entityId: 1,
      }),
    );
  });

  it('rechaza firma si el contrato pertenece a otro inquilino', async () => {
    queryRunner.query.mockResolvedValueOnce([contract]);

    await expect(
      service.signContract(1, 99, '127.0.0.1', 'acme'),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(queryRunner.query).toHaveBeenCalledTimes(1);
    expect(queryRunner.rollbackTransaction).toHaveBeenCalledTimes(1);
  });

  it('rechaza firma si el contrato no está en estado firmable', async () => {
    queryRunner.query.mockResolvedValueOnce([
      { ...contract, status: ContractStatus.ACTIVO },
    ]);

    await expect(
      service.signContract(1, 10, '127.0.0.1', 'acme'),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(queryRunner.query).toHaveBeenCalledTimes(1);
    expect(queryRunner.rollbackTransaction).toHaveBeenCalledTimes(1);
  });
});
