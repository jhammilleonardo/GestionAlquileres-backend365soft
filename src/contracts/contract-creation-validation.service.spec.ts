import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ContractCreationValidationService } from './contract-creation-validation.service';
import { CreateContractDto } from './dto/create-contract.dto';
import { ContractStatus } from './enums/contract-status.enum';

function makeDto(
  overrides: Partial<CreateContractDto> = {},
): CreateContractDto {
  return {
    tenant_id: 10,
    property_id: 20,
    start_date: '2026-01-01',
    end_date: '2026-12-31',
    monthly_rent: 2500,
    currency: 'BOB',
    ...overrides,
  };
}

describe('ContractCreationValidationService', () => {
  let service: ContractCreationValidationService;
  const executor = {
    query: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ContractCreationValidationService();
  });

  it('valida creación manual con inquilino elegible, solicitud aprobada y propiedad disponible', async () => {
    executor.query
      .mockResolvedValueOnce([{ role: 'INQUILINO' }])
      .mockResolvedValueOnce([{ id: 100 }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ status: 'DISPONIBLE' }]);

    await expect(
      service.validate({
        createContractDto: makeDto(),
        adminUserId: 99,
        executor,
        schemaPrefix: '"tenant_acme".',
      }),
    ).resolves.toBeUndefined();

    expect(executor.query).toHaveBeenNthCalledWith(
      1,
      'SELECT role FROM "tenant_acme"."user" WHERE id = $1',
      [10],
    );
    expect(executor.query).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining('status::text = ANY($2)'),
      [
        10,
        [
          ContractStatus.BORRADOR,
          ContractStatus.PENDIENTE,
          ContractStatus.FIRMADO,
          ContractStatus.ACTIVO,
          ContractStatus.POR_VENCER,
        ],
      ],
    );
  });

  it('rechaza creación manual si el admin intenta crearse contrato a si mismo', async () => {
    await expect(
      service.validate({
        createContractDto: makeDto({ tenant_id: 99 }),
        adminUserId: 99,
        executor,
        schemaPrefix: '',
      }),
    ).rejects.toThrow(BadRequestException);

    expect(executor.query).not.toHaveBeenCalled();
  });

  it('rechaza creación manual sin solicitud aprobada', async () => {
    executor.query
      .mockResolvedValueOnce([{ role: 'INQUILINO' }])
      .mockResolvedValueOnce([]);

    await expect(
      service.validate({
        createContractDto: makeDto(),
        adminUserId: 99,
        executor,
        schemaPrefix: '',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('valida creación desde solicitud y permite propiedad no disponible', async () => {
    executor.query
      .mockResolvedValueOnce([{ id: 5, applicant_id: 10 }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ status: 'OCUPADO' }]);

    await expect(
      service.validate({
        createContractDto: makeDto({ application_id: 5 }),
        adminUserId: 99,
        executor,
        schemaPrefix: '',
      }),
    ).resolves.toBeUndefined();
  });

  it('rechaza solicitud que no pertenece al inquilino', async () => {
    executor.query.mockResolvedValueOnce([{ id: 5, applicant_id: 11 }]);

    await expect(
      service.validate({
        createContractDto: makeDto({ application_id: 5 }),
        adminUserId: 99,
        executor,
        schemaPrefix: '',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rechaza si ya existe contrato activo para el inquilino', async () => {
    executor.query
      .mockResolvedValueOnce([{ role: 'INQUILINO' }])
      .mockResolvedValueOnce([{ id: 100 }])
      .mockResolvedValueOnce([{ id: 55 }]);

    await expect(
      service.validate({
        createContractDto: makeDto(),
        adminUserId: 99,
        executor,
        schemaPrefix: '',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rechaza propiedad inexistente', async () => {
    executor.query
      .mockResolvedValueOnce([{ role: 'INQUILINO' }])
      .mockResolvedValueOnce([{ id: 100 }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    await expect(
      service.validate({
        createContractDto: makeDto(),
        adminUserId: 99,
        executor,
        schemaPrefix: '',
      }),
    ).rejects.toThrow(NotFoundException);
  });
});
