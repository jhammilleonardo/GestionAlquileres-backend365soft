import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ContractsService, ContractResult } from './contracts.service';
import { ContractStatus } from './enums/contract-status.enum';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { PdfService } from './pdf.service';
import { NotificationsService } from '../notifications/notifications.service';
import { LifecycleNotificationsService } from '../lifecycle-notifications/lifecycle-notifications.service';
import { ContractTemplatesService } from '../contract-templates/contract-templates.service';
import { TenantsService } from '../tenants/tenants.service';
import { ContractQueriesService } from './contract-queries.service';
import { ContractNumberService } from './contract-number.service';
import { ContractHistoryService } from './contract-history.service';
import { ContractRenewalService } from './contract-renewal.service';
import { ContractSigningService } from './contract-signing.service';
import { ContractCreationService } from './contract-creation.service';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeContract(overrides: Partial<ContractResult> = {}): ContractResult {
  return {
    id: 1,
    contract_number: 'CTR-2025-0001',
    tenant_id: 10,
    property_id: 20,
    unit_id: 5,
    status: ContractStatus.ACTIVO,
    start_date: '2024-01-01',
    end_date: '2024-12-31',
    duration_months: 12,
    monthly_rent: 1000,
    currency: 'BOB',
    payment_day: 5,
    deposit_amount: 2000,
    late_fee_percentage: 2,
    grace_days: 5,
    jurisdiction: 'Bolivia',
    auto_renew: false,
    renewal_notice_days: 30,
    auto_increase_percentage: 0,
    created_at: new Date('2024-01-01'),
    updated_at: new Date('2024-01-01'),
    ...overrides,
  };
}

type QueryCall = [string, unknown[]];

function queryParams(mock: jest.Mock, callIndex: number): unknown[] {
  return (mock.mock.calls[callIndex] as QueryCall)[1];
}

function querySql(mock: jest.Mock, callIndex: number): string {
  return (mock.mock.calls[callIndex] as QueryCall)[0];
}

const mockAuditLog = { log: jest.fn().mockResolvedValue(undefined) };

// ─── renew ────────────────────────────────────────────────────────────────────

describe('ContractsService.renew', () => {
  let service: ContractsService;
  const mockDataSource = {
    query: jest.fn(),
    createQueryRunner: jest.fn(),
  };
  const mockQueryRunner = {
    connect: jest.fn().mockResolvedValue(undefined),
    startTransaction: jest.fn().mockResolvedValue(undefined),
    commitTransaction: jest.fn().mockResolvedValue(undefined),
    rollbackTransaction: jest.fn().mockResolvedValue(undefined),
    release: jest.fn().mockResolvedValue(undefined),
    query: mockDataSource.query,
  };

  beforeEach(async () => {
    mockDataSource.createQueryRunner.mockReturnValue(mockQueryRunner);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContractsService,
        ContractCreationService,
        ContractQueriesService,
        ContractNumberService,
        ContractHistoryService,
        ContractRenewalService,
        ContractSigningService,
        { provide: getDataSourceToken(), useValue: mockDataSource },
        { provide: PdfService, useValue: {} },
        { provide: NotificationsService, useValue: {} },
        { provide: LifecycleNotificationsService, useValue: {} },
        { provide: ContractTemplatesService, useValue: {} },
        { provide: AuditLogsService, useValue: mockAuditLog },
        { provide: TenantsService, useValue: {} },
      ],
    }).compile();

    service = module.get<ContractsService>(ContractsService);
  });

  afterEach(() => jest.clearAllMocks());

  it('crea un nuevo contrato y marca el anterior como RENOVADO', async () => {
    const oldContract = makeContract();
    const newContract = makeContract({
      id: 2,
      contract_number: 'CTR-2025-0002',
      status: ContractStatus.BORRADOR,
    });

    mockDataSource.query
      .mockResolvedValueOnce([oldContract]) // findOne
      .mockResolvedValueOnce([{ contract_number: 'CTR-2025-0001' }]) // generateContractNumber
      .mockResolvedValueOnce([newContract]) // INSERT nuevo
      .mockResolvedValueOnce([]) // UPDATE → RENOVADO
      .mockResolvedValueOnce([]) // logHistory anterior
      .mockResolvedValueOnce([]); // logHistory nuevo

    const result = await service.renew(1, {}, 99);

    expect(result.id).toBe(2);
    expect(result.status).toBe(ContractStatus.BORRADOR);

    const updateSql = querySql(mockDataSource.query, 3);
    const updateVals = queryParams(mockDataSource.query, 3);
    expect(updateSql).toContain('UPDATE contracts SET status');
    expect(updateVals).toContain(ContractStatus.RENOVADO);
    expect(updateVals).toContain(1);
  });

  it('hereda propiedad, unidad e inquilino del contrato anterior', async () => {
    const oldContract = makeContract({
      property_id: 99,
      unit_id: 77,
      tenant_id: 55,
    });
    const newContract = makeContract({ id: 2 });

    mockDataSource.query
      .mockResolvedValueOnce([oldContract])
      .mockResolvedValueOnce([{ contract_number: 'CTR-2025-0001' }])
      .mockResolvedValueOnce([newContract])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    await service.renew(1, {}, 0);

    const params = queryParams(mockDataSource.query, 2);
    expect(params[0]).toBe(55); // $1 tenant_id
    expect(params[1]).toBe(99); // $2 property_id
    expect(params[2]).toBe(77); // $3 unit_id
  });

  it('aplica auto_increase_percentage al monto si no se provee override', async () => {
    const oldContract = makeContract({
      monthly_rent: 1000,
      auto_increase_percentage: 10,
    });
    const newContract = makeContract({ id: 2 });

    mockDataSource.query
      .mockResolvedValueOnce([oldContract])
      .mockResolvedValueOnce([{ contract_number: 'CTR-2025-0001' }])
      .mockResolvedValueOnce([newContract])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    await service.renew(1, {}, 0);

    const params = queryParams(mockDataSource.query, 2);
    expect(params[7]).toBeCloseTo(1100); // $8 monthly_rent = 1000 * 1.10
  });

  it('usa monthly_rent del dto si se provee', async () => {
    const oldContract = makeContract({
      monthly_rent: 1000,
      auto_increase_percentage: 10,
    });
    const newContract = makeContract({ id: 2 });

    mockDataSource.query
      .mockResolvedValueOnce([oldContract])
      .mockResolvedValueOnce([{ contract_number: 'CTR-2025-0001' }])
      .mockResolvedValueOnce([newContract])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    await service.renew(1, { monthly_rent: 1500 }, 0);

    const params = queryParams(mockDataSource.query, 2);
    expect(params[7]).toBe(1500); // override directo
  });

  it('usa start_date del dto si se provee', async () => {
    const oldContract = makeContract();
    const newContract = makeContract({ id: 2 });

    mockDataSource.query
      .mockResolvedValueOnce([oldContract])
      .mockResolvedValueOnce([{ contract_number: 'CTR-2025-0001' }])
      .mockResolvedValueOnce([newContract])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    await service.renew(1, { start_date: '2025-02-01' }, 0);

    const params = queryParams(mockDataSource.query, 2);
    expect(params[4]).toBe('2025-02-01'); // $5 start_date
  });

  it('calcula start_date como end_date + 1 día si no se provee override', async () => {
    const oldContract = makeContract({ end_date: '2024-12-31' });
    const newContract = makeContract({ id: 2 });

    mockDataSource.query
      .mockResolvedValueOnce([oldContract])
      .mockResolvedValueOnce([{ contract_number: 'CTR-2025-0001' }])
      .mockResolvedValueOnce([newContract])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    await service.renew(1, {}, 0);

    const params = queryParams(mockDataSource.query, 2);
    expect(params[4]).toBe('2025-01-01'); // día siguiente a 2024-12-31
  });

  it('usa duration_months del dto para calcular end_date', async () => {
    const oldContract = makeContract({
      end_date: '2024-12-31',
      duration_months: 12,
    });
    const newContract = makeContract({ id: 2 });

    mockDataSource.query
      .mockResolvedValueOnce([oldContract])
      .mockResolvedValueOnce([{ contract_number: 'CTR-2025-0001' }])
      .mockResolvedValueOnce([newContract])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    await service.renew(1, { duration_months: 6 }, 0);

    const params = queryParams(mockDataSource.query, 2);
    expect(params[6]).toBe(6); // $7 duration_months
  });

  it('lanza BadRequestException si el contrato no está ACTIVO ni POR_VENCER', async () => {
    const closedContract = makeContract({ status: ContractStatus.FINALIZADO });

    mockDataSource.query.mockResolvedValueOnce([closedContract]);

    await expect(service.renew(1, {}, 0)).rejects.toThrow(BadRequestException);
  });

  it('lanza NotFoundException si el contrato no existe', async () => {
    mockDataSource.query.mockResolvedValueOnce([]);

    await expect(service.renew(999, {}, 0)).rejects.toThrow(NotFoundException);
  });

  it('también renueva contratos con estado POR_VENCER', async () => {
    const expiringContract = makeContract({
      status: ContractStatus.POR_VENCER,
    });
    const newContract = makeContract({ id: 2 });

    mockDataSource.query
      .mockResolvedValueOnce([expiringContract])
      .mockResolvedValueOnce([{ contract_number: 'CTR-2025-0001' }])
      .mockResolvedValueOnce([newContract])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const result = await service.renew(1, {}, 0);
    expect(result).toBeDefined();
  });

  it('registra audit log con acción renewed', async () => {
    const oldContract = makeContract({ status: ContractStatus.ACTIVO });
    const newContract = makeContract({
      id: 2,
      status: ContractStatus.BORRADOR,
    });

    mockDataSource.query
      .mockResolvedValueOnce([oldContract])
      .mockResolvedValueOnce([{ contract_number: 'CTR-2025-0001' }])
      .mockResolvedValueOnce([newContract])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    await service.renew(1, {}, 42);

    expect(mockAuditLog.log).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 42,
        action: 'renewed',
        entityType: 'contract',
        entityId: 1,
      }),
    );
  });
});

// ─── update ───────────────────────────────────────────────────────────────────

describe('ContractsService.update', () => {
  let service: ContractsService;
  const mockDataSource = {
    query: jest.fn(),
    createQueryRunner: jest.fn(),
  };
  const mockQueryRunner = {
    connect: jest.fn().mockResolvedValue(undefined),
    startTransaction: jest.fn().mockResolvedValue(undefined),
    commitTransaction: jest.fn().mockResolvedValue(undefined),
    rollbackTransaction: jest.fn().mockResolvedValue(undefined),
    release: jest.fn().mockResolvedValue(undefined),
    query: jest.fn(),
  };
  const mockLifecycleNotifications = {
    onContractActivated: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    mockDataSource.createQueryRunner.mockReturnValue(mockQueryRunner);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContractsService,
        ContractCreationService,
        ContractQueriesService,
        ContractNumberService,
        ContractHistoryService,
        ContractRenewalService,
        ContractSigningService,
        { provide: getDataSourceToken(), useValue: mockDataSource },
        { provide: PdfService, useValue: {} },
        {
          provide: NotificationsService,
          useValue: {
            createForUser: jest.fn().mockResolvedValue(undefined),
            createForUserInSchema: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: LifecycleNotificationsService,
          useValue: mockLifecycleNotifications,
        },
        { provide: ContractTemplatesService, useValue: {} },
        { provide: AuditLogsService, useValue: mockAuditLog },
        { provide: TenantsService, useValue: {} },
      ],
    }).compile();

    service = module.get<ContractsService>(ContractsService);
  });

  afterEach(() => jest.clearAllMocks());

  it('actualiza estado, propiedad e historial en una transacción', async () => {
    const oldContract = makeContract({ status: ContractStatus.BORRADOR });
    const updatedContract = makeContract({ status: ContractStatus.ACTIVO });

    mockQueryRunner.query
      .mockResolvedValueOnce([oldContract])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    mockDataSource.query.mockResolvedValueOnce([updatedContract]);

    await expect(
      service.update(
        1,
        {
          status: ContractStatus.ACTIVO,
          update_reason: 'Aprobación administrativa',
        },
        99,
      ),
    ).resolves.toMatchObject({ status: ContractStatus.ACTIVO });

    expect(mockQueryRunner.query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('FOR UPDATE'),
      [1],
    );
    expect(mockQueryRunner.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('UPDATE contracts SET status'),
      [ContractStatus.ACTIVO, 1],
    );
    expect(mockQueryRunner.query).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining('INSERT INTO contract_history'),
      [
        1,
        'status',
        ContractStatus.BORRADOR,
        ContractStatus.ACTIVO,
        99,
        'Aprobación administrativa',
      ],
    );
    expect(mockQueryRunner.query).toHaveBeenNthCalledWith(
      4,
      expect.stringContaining("UPDATE properties SET status = 'OCUPADO'"),
      [oldContract.property_id],
    );
    expect(mockQueryRunner.commitTransaction).toHaveBeenCalledTimes(1);
    expect(mockLifecycleNotifications.onContractActivated).toHaveBeenCalledWith(
      1,
      undefined,
    );
    expect(mockAuditLog.log).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 99,
        action: 'status_changed',
        entityType: 'contract',
        entityId: 1,
      }),
    );
  });
});

// ─── getContractHistory ───────────────────────────────────────────────────────

describe('ContractsService.getContractHistory', () => {
  let service: ContractsService;
  const mockDataSource = {
    query: jest.fn(),
    createQueryRunner: jest.fn(),
  };
  const mockQueryRunner = {
    connect: jest.fn().mockResolvedValue(undefined),
    startTransaction: jest.fn().mockResolvedValue(undefined),
    commitTransaction: jest.fn().mockResolvedValue(undefined),
    rollbackTransaction: jest.fn().mockResolvedValue(undefined),
    release: jest.fn().mockResolvedValue(undefined),
    query: jest.fn(),
  };
  const mockTenantsService = {
    findBySlug: jest.fn(),
  };

  beforeEach(async () => {
    mockDataSource.createQueryRunner.mockReturnValue(mockQueryRunner);
    mockTenantsService.findBySlug.mockResolvedValue({
      slug: 'acme',
      schema_name: 'tenant_acme',
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContractsService,
        ContractCreationService,
        ContractQueriesService,
        ContractNumberService,
        ContractHistoryService,
        ContractRenewalService,
        ContractSigningService,
        { provide: getDataSourceToken(), useValue: mockDataSource },
        { provide: PdfService, useValue: {} },
        { provide: NotificationsService, useValue: {} },
        { provide: LifecycleNotificationsService, useValue: {} },
        { provide: ContractTemplatesService, useValue: {} },
        { provide: AuditLogsService, useValue: mockAuditLog },
        { provide: TenantsService, useValue: mockTenantsService },
      ],
    }).compile();

    service = module.get<ContractsService>(ContractsService);
  });

  afterEach(() => jest.clearAllMocks());

  it('retorna todos los contratos de la unidad en orden cronológico', async () => {
    const contract = makeContract({ unit_id: 5 });
    const history = [
      makeContract({
        id: 1,
        start_date: '2023-01-01',
        status: ContractStatus.RENOVADO,
      }),
      makeContract({
        id: 2,
        start_date: '2024-01-01',
        status: ContractStatus.ACTIVO,
      }),
    ];

    mockDataSource.query
      .mockResolvedValueOnce([contract]) // findOne
      .mockResolvedValueOnce(history); // history query por unit_id

    const result = await service.getContractHistory(1);

    expect(result).toHaveLength(2);
    expect(result[0].id).toBe(1);
    expect(result[1].id).toBe(2);
  });

  it('incluye el contrato renovado y el nuevo en el historial', async () => {
    const contract = makeContract({ unit_id: 5 });
    const history = [
      makeContract({
        id: 1,
        status: ContractStatus.RENOVADO,
        start_date: '2023-01-01',
      }),
      makeContract({
        id: 2,
        status: ContractStatus.BORRADOR,
        start_date: '2024-01-01',
      }),
    ];

    mockDataSource.query
      .mockResolvedValueOnce([contract])
      .mockResolvedValueOnce(history);

    const result = await service.getContractHistory(1);
    const statuses = result.map((c) => c.status);

    expect(statuses).toContain(ContractStatus.RENOVADO);
    expect(statuses).toContain(ContractStatus.BORRADOR);
  });

  it('usa property_id si el contrato no tiene unidad', async () => {
    const contract = makeContract({ unit_id: undefined });
    const history = [makeContract({ id: 1, start_date: '2024-01-01' })];

    mockDataSource.query
      .mockResolvedValueOnce([contract])
      .mockResolvedValueOnce(history);

    const result = await service.getContractHistory(1);
    expect(result).toHaveLength(1);

    const sql = querySql(mockDataSource.query, 1);
    const params = queryParams(mockDataSource.query, 1);
    expect(sql).toContain('c.property_id = $1');
    expect(params).toContain(contract.property_id);
  });

  it('lanza NotFoundException si el contrato no existe', async () => {
    mockDataSource.query.mockResolvedValueOnce([]);

    await expect(service.getContractHistory(999)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('retorna arreglo vacío si no hay historial para la unidad', async () => {
    const contract = makeContract({ unit_id: 5 });

    mockDataSource.query
      .mockResolvedValueOnce([contract])
      .mockResolvedValueOnce([]);

    const result = await service.getContractHistory(1);
    expect(result).toEqual([]);
  });

  it('findOne usa tablas calificadas por schema sin mutar search_path', async () => {
    const contract = makeContract();
    mockDataSource.query.mockResolvedValueOnce([contract]);

    await expect(service.findOne(1, 'acme')).resolves.toBe(contract);

    expect(mockTenantsService.findBySlug).toHaveBeenCalledWith('acme');
    expect(mockDataSource.query).toHaveBeenCalledWith(
      expect.stringContaining('FROM "tenant_acme".contracts c'),
      [1],
    );
    expect(mockDataSource.query).not.toHaveBeenCalledWith(
      expect.stringContaining('SET search_path'),
    );
  });

  it('create usa schema calificado cuando recibe tenantSlug', async () => {
    const contract = makeContract({
      id: 44,
      contract_number: 'CTR-2026-0007',
      status: ContractStatus.BORRADOR,
    });

    mockDataSource.query
      .mockResolvedValueOnce([{ id: 3, applicant_id: 10 }]) // application
      .mockResolvedValueOnce([]) // active contract
      .mockResolvedValueOnce([{ status: 'DISPONIBLE' }]); // property
    mockQueryRunner.query
      .mockResolvedValueOnce([]) // CREATE SEQUENCE
      .mockResolvedValueOnce([{ num: '7' }]) // nextval
      .mockResolvedValueOnce([contract]) // INSERT contract
      .mockResolvedValueOnce([]) // UPDATE property
      .mockResolvedValueOnce([]); // history

    await expect(
      service.create(
        {
          tenant_id: 10,
          property_id: 20,
          application_id: 3,
          start_date: '2026-06-01',
          end_date: '2027-06-01',
          monthly_rent: 2500,
        },
        99,
        'acme',
      ),
    ).resolves.toBe(contract);

    expect(mockDataSource.query).toHaveBeenNthCalledWith(
      1,
      'SELECT id, applicant_id FROM "tenant_acme".rental_applications WHERE id = $1',
      [3],
    );
    expect(querySql(mockQueryRunner.query, 2)).toContain(
      'INSERT INTO "tenant_acme".contracts',
    );
    expect(querySql(mockQueryRunner.query, 3)).toContain(
      'UPDATE "tenant_acme".properties',
    );
    expect(querySql(mockQueryRunner.query, 4)).toContain(
      'INSERT INTO "tenant_acme".contract_history',
    );
    expect(mockQueryRunner.commitTransaction).toHaveBeenCalledTimes(1);
    expect(mockDataSource.query).not.toHaveBeenCalledWith(
      expect.stringContaining('SET search_path'),
    );
  });
});
