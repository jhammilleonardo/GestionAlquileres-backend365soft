import { ContractCreationService } from './contract-creation.service';
import { CreateContractDto } from './dto/create-contract.dto';
import { ContractStatus } from './enums/contract-status.enum';

// Posiciones (0-based) de los valores en el INSERT de insertContract().
const PARAM = {
  status: 3,
  currency: 9,
  lateFeePercentage: 13,
  graceDays: 14,
  jurisdiction: 22,
} as const;

type QueryCall = [string, unknown[]];

function makeDto(
  overrides: Partial<CreateContractDto> = {},
): CreateContractDto {
  return {
    tenant_id: 10,
    property_id: 20,
    start_date: '2026-01-01',
    end_date: '2026-12-31',
    monthly_rent: 2500,
    ...overrides,
  };
}

describe('ContractCreationService', () => {
  let service: ContractCreationService;
  let queryRunner: {
    connect: jest.Mock;
    startTransaction: jest.Mock;
    commitTransaction: jest.Mock;
    rollbackTransaction: jest.Mock;
    release: jest.Mock;
    query: jest.Mock;
  };
  let dataSource: { createQueryRunner: jest.Mock; query: jest.Mock };
  let tenantsService: { findBySlug: jest.Mock };
  let contractNumberService: { generate: jest.Mock };
  let contractHistoryService: { logChange: jest.Mock };
  let sideEffectsService: { emitCreated: jest.Mock };
  let validationService: { validate: jest.Mock };
  let tenantConfigService: { getConfig: jest.Mock };

  const savedContract = { id: 42, contract_number: 'CTR-2026-0001' };

  /** Devuelve la llamada nº `index` a queryRunner.query, ya tipada. */
  const queryCall = (index: number): QueryCall =>
    (queryRunner.query.mock.calls as QueryCall[])[index];

  /** Parámetros del INSERT de contrato (primera query). */
  const insertParams = (): unknown[] => queryCall(0)[1];

  beforeEach(() => {
    queryRunner = {
      connect: jest.fn(),
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      rollbackTransaction: jest.fn(),
      release: jest.fn(),
      query: jest
        .fn()
        .mockResolvedValueOnce([savedContract]) // INSERT contracts
        .mockResolvedValueOnce([]), // UPDATE properties
    };
    dataSource = {
      createQueryRunner: jest.fn(() => queryRunner),
      query: jest.fn(),
    };
    tenantsService = {
      findBySlug: jest.fn().mockResolvedValue({ schema_name: 'tenant_acme' }),
    };
    contractNumberService = {
      generate: jest.fn().mockResolvedValue('CTR-2026-0001'),
    };
    contractHistoryService = { logChange: jest.fn() };
    sideEffectsService = { emitCreated: jest.fn() };
    validationService = { validate: jest.fn().mockResolvedValue(undefined) };
    tenantConfigService = {
      getConfig: jest.fn().mockResolvedValue({
        currency: 'USD',
        country: 'US',
        late_fee_percentage: 5,
        grace_days_late_fee: 3,
      }),
    };

    service = new ContractCreationService(
      dataSource as never,
      tenantsService as never,
      contractNumberService as never,
      contractHistoryService as never,
      sideEffectsService as never,
      validationService as never,
      tenantConfigService as never,
    );
  });

  it('deja la propiedad en RESERVADO al crear el contrato (no OCUPADO)', async () => {
    await service.create(makeDto(), 99, 'acme');

    const [sql, params] = queryCall(1);
    expect(sql).toEqual(expect.stringContaining('RESERVADO'));
    expect(sql).not.toEqual(expect.stringContaining('OCUPADO'));
    expect(params).toEqual([20]);
  });

  it('crea el contrato en estado BORRADOR', async () => {
    await service.create(makeDto(), 99, 'acme');

    expect(insertParams()[PARAM.status]).toBe(ContractStatus.BORRADOR);
  });

  it('toma moneda, mora, gracia y jurisdicción de la config regional del tenant', async () => {
    await service.create(makeDto(), 99, 'acme');

    const params = insertParams();
    expect(params[PARAM.currency]).toBe('USD');
    expect(params[PARAM.lateFeePercentage]).toBe(5);
    expect(params[PARAM.graceDays]).toBe(3);
    expect(params[PARAM.jurisdiction]).toBe('Estados Unidos');
  });

  it('prioriza los valores explícitos del DTO sobre la config regional', async () => {
    await service.create(
      makeDto({
        currency: 'BOB',
        late_fee_percentage: 2,
        jurisdiction: 'La Paz',
      }),
      99,
      'acme',
    );

    const params = insertParams();
    expect(params[PARAM.currency]).toBe('BOB');
    expect(params[PARAM.lateFeePercentage]).toBe(2);
    expect(params[PARAM.jurisdiction]).toBe('La Paz');
  });

  it('cae a defaults genéricos si el tenant no tiene config regional', async () => {
    tenantConfigService.getConfig.mockRejectedValue(new Error('no config'));

    await service.create(makeDto(), 99, 'acme');

    const params = insertParams();
    expect(params[PARAM.currency]).toBe('BOB');
    expect(params[PARAM.jurisdiction]).toBe('Bolivia');
  });
});
