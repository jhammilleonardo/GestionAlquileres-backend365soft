import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ContractsService, ContractResult } from './contracts.service';
import { ContractStatus } from './enums/contract-status.enum';
import { PdfService } from './pdf.service';
import { NotificationsService } from '../notifications/notifications.service';
import { LifecycleNotificationsService } from '../lifecycle-notifications/lifecycle-notifications.service';
import { ContractTemplatesService } from '../contract-templates/contract-templates.service';

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

// ─── renew ────────────────────────────────────────────────────────────────────

describe('ContractsService.renew', () => {
  let service: ContractsService;
  const mockDataSource = { query: jest.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContractsService,
        { provide: getDataSourceToken(), useValue: mockDataSource },
        { provide: PdfService, useValue: {} },
        { provide: NotificationsService, useValue: {} },
        { provide: LifecycleNotificationsService, useValue: {} },
        { provide: ContractTemplatesService, useValue: {} },
      ],
    }).compile();

    service = module.get<ContractsService>(ContractsService);
  });

  afterEach(() => jest.resetAllMocks());

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
});

// ─── getContractHistory ───────────────────────────────────────────────────────

describe('ContractsService.getContractHistory', () => {
  let service: ContractsService;
  const mockDataSource = { query: jest.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContractsService,
        { provide: getDataSourceToken(), useValue: mockDataSource },
        { provide: PdfService, useValue: {} },
        { provide: NotificationsService, useValue: {} },
        { provide: LifecycleNotificationsService, useValue: {} },
        { provide: ContractTemplatesService, useValue: {} },
      ],
    }).compile();

    service = module.get<ContractsService>(ContractsService);
  });

  afterEach(() => jest.resetAllMocks());

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
});
