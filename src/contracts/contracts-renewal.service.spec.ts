import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ContractsService, ContractResult } from './contracts.service';
import { ContractStatus } from './enums/contract-status.enum';
import { RenewContractDto } from './dto/renew-contract.dto';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { PdfService } from './pdf.service';
import { NotificationsService } from '../notifications/notifications.service';
import { LifecycleNotificationsService } from '../lifecycle-notifications/lifecycle-notifications.service';
import { ContractTemplatesService } from '../contract-templates/contract-templates.service';

type QueryCall = [string, unknown[]];
function queryParams(mock: jest.Mock, callIndex: number): unknown[] {
  return (mock.mock.calls[callIndex] as QueryCall)[1];
}
function querySql(mock: jest.Mock, callIndex: number): string {
  return (mock.mock.calls[callIndex] as QueryCall)[0];
}

function makeContract(overrides: Partial<ContractResult> = {}): ContractResult {
  return {
    id: 1,
    contract_number: 'CTR-2024-0001',
    tenant_id: 10,
    property_id: 20,
    unit_id: 5,
    start_date: '2024-01-01',
    end_date: '2024-12-31',
    duration_months: 12,
    monthly_rent: 1000,
    currency: 'USD',
    payment_day: 5,
    deposit_amount: 2000,
    payment_method: 'transferencia',
    late_fee_percentage: 2,
    grace_days: 5,
    included_services: ['agua', 'luz'],
    tenant_responsibilities: null,
    owner_responsibilities: null,
    prohibitions: null,
    coexistence_rules: null,
    renewal_terms: null,
    termination_terms: null,
    jurisdiction: 'Bolivia',
    auto_renew: false,
    renewal_notice_days: 30,
    auto_increase_percentage: 5,
    bank_account_number: null,
    bank_account_type: null,
    bank_name: null,
    bank_account_holder: null,
    status: ContractStatus.ACTIVO,
    terms_conditions: null,
    created_at: new Date('2024-01-01'),
    updated_at: new Date('2024-01-01'),
    property_title: 'Casa A',
    property_description: null,
    property_status: 'OCUPADO',
    street_address: 'Calle 1',
    city: 'La Paz',
    state: null,
    zip_code: null,
    country: 'Bolivia',
    tenant_name: 'Juan Pérez',
    tenant_email: 'juan@test.com',
    tenant_phone: '70000000',
    ...overrides,
  };
}

describe('ContractsService — renovación', () => {
  let service: ContractsService;
  let mockQuery: jest.Mock;
  let mockAuditLog: jest.Mock;

  beforeEach(async () => {
    mockQuery = jest.fn();
    mockAuditLog = jest.fn().mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContractsService,
        { provide: getDataSourceToken(), useValue: { query: mockQuery } },
        { provide: PdfService, useValue: {} },
        {
          provide: NotificationsService,
          useValue: { createForUser: jest.fn(), notifyAdmins: jest.fn() },
        },
        {
          provide: LifecycleNotificationsService,
          useValue: { onContractActivated: jest.fn() },
        },
        {
          provide: ContractTemplatesService,
          useValue: { getActiveTemplate: jest.fn() },
        },
        {
          provide: AuditLogsService,
          useValue: { log: mockAuditLog },
        },
      ],
    }).compile();

    service = module.get(ContractsService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('renew()', () => {
    it('debe crear un nuevo contrato BORRADOR y marcar el anterior como RENOVADO', async () => {
      const old = makeContract({ status: ContractStatus.ACTIVO });
      const newContract = makeContract({
        id: 2,
        contract_number: 'CTR-2024-0002',
        status: ContractStatus.BORRADOR,
      });

      // findOne: SELECT c.* ...
      mockQuery.mockResolvedValueOnce([old]);
      // generateContractNumber
      mockQuery.mockResolvedValueOnce([{ contract_number: 'CTR-2024-0001' }]);
      // INSERT nuevo contrato
      mockQuery.mockResolvedValueOnce([newContract]);
      // UPDATE anterior → RENOVADO
      mockQuery.mockResolvedValueOnce([]);
      // logHistory x2
      mockQuery.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

      const result = await service.renew(1, {}, 99);

      expect(result.id).toBe(2);
      expect(result.status).toBe(ContractStatus.BORRADOR);

      const updateSql = querySql(mockQuery, 3);
      expect(updateSql).toContain('status = $1');
      const updateParams = queryParams(mockQuery, 3);
      expect(updateParams[0]).toBe(ContractStatus.RENOVADO);
    });

    it('debe heredar propiedad, unidad e inquilino del contrato anterior', async () => {
      const old = makeContract({ property_id: 99, unit_id: 7, tenant_id: 55 });
      mockQuery.mockResolvedValueOnce([old]);
      mockQuery.mockResolvedValueOnce([{ contract_number: 'CTR-2024-0001' }]);
      mockQuery.mockResolvedValueOnce([
        makeContract({ id: 2, status: ContractStatus.BORRADOR }),
      ]);
      mockQuery.mockResolvedValueOnce([]);
      mockQuery.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

      await service.renew(1);

      const insertParams = queryParams(mockQuery, 2);
      expect(insertParams[0]).toBe(55); // tenant_id
      expect(insertParams[1]).toBe(99); // property_id
    });

    it('debe aplicar auto_increase_percentage al calcular la renta', async () => {
      const old = makeContract({
        monthly_rent: 1000,
        auto_increase_percentage: 10,
        status: ContractStatus.ACTIVO,
      });
      mockQuery.mockResolvedValueOnce([old]);
      mockQuery.mockResolvedValueOnce([{ contract_number: 'CTR-2024-0001' }]);
      mockQuery.mockResolvedValueOnce([
        makeContract({ id: 2, status: ContractStatus.BORRADOR }),
      ]);
      mockQuery.mockResolvedValueOnce([]);
      mockQuery.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

      await service.renew(1);

      const insertParams = queryParams(mockQuery, 2);
      expect(insertParams[6]).toBeCloseTo(1100); // monthly_rent con 10% de aumento
    });

    it('debe usar monthly_rent del DTO si se proporciona (override)', async () => {
      const old = makeContract({
        monthly_rent: 1000,
        auto_increase_percentage: 10,
      });
      mockQuery.mockResolvedValueOnce([old]);
      mockQuery.mockResolvedValueOnce([{ contract_number: 'CTR-2024-0001' }]);
      mockQuery.mockResolvedValueOnce([
        makeContract({ id: 2, status: ContractStatus.BORRADOR }),
      ]);
      mockQuery.mockResolvedValueOnce([]);
      mockQuery.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

      const dto: RenewContractDto = { monthly_rent: 1500 };
      await service.renew(1, dto);

      const insertParams = queryParams(mockQuery, 2);
      expect(insertParams[6]).toBe(1500);
    });

    it('debe usar start_date del DTO si se proporciona', async () => {
      const old = makeContract({ end_date: '2024-12-31' });
      mockQuery.mockResolvedValueOnce([old]);
      mockQuery.mockResolvedValueOnce([{ contract_number: 'CTR-2024-0001' }]);
      mockQuery.mockResolvedValueOnce([
        makeContract({ id: 2, status: ContractStatus.BORRADOR }),
      ]);
      mockQuery.mockResolvedValueOnce([]);
      mockQuery.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

      const dto: RenewContractDto = { start_date: '2025-03-01' };
      await service.renew(1, dto);

      const insertParams = queryParams(mockQuery, 2);
      expect(insertParams[3]).toBe('2025-03-01');
    });

    it('debe usar duration_months del DTO si se proporciona', async () => {
      const old = makeContract({ duration_months: 12 });
      mockQuery.mockResolvedValueOnce([old]);
      mockQuery.mockResolvedValueOnce([{ contract_number: 'CTR-2024-0001' }]);
      mockQuery.mockResolvedValueOnce([
        makeContract({ id: 2, status: ContractStatus.BORRADOR }),
      ]);
      mockQuery.mockResolvedValueOnce([]);
      mockQuery.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

      const dto: RenewContractDto = { duration_months: 6 };
      await service.renew(1, dto);

      const insertParams = queryParams(mockQuery, 2);
      expect(insertParams[5]).toBe(6);
    });

    it('debe lanzar BadRequestException si el contrato está FINALIZADO', async () => {
      const old = makeContract({ status: ContractStatus.FINALIZADO });
      mockQuery.mockResolvedValueOnce([old]);

      await expect(service.renew(1)).rejects.toThrow(BadRequestException);
    });

    it('debe lanzar NotFoundException si el contrato no existe', async () => {
      mockQuery.mockResolvedValueOnce([]);

      await expect(service.renew(999)).rejects.toThrow(NotFoundException);
    });

    it('debe funcionar con contratos en estado POR_VENCER', async () => {
      const old = makeContract({ status: ContractStatus.POR_VENCER });
      mockQuery.mockResolvedValueOnce([old]);
      mockQuery.mockResolvedValueOnce([{ contract_number: 'CTR-2024-0001' }]);
      mockQuery.mockResolvedValueOnce([
        makeContract({ id: 2, status: ContractStatus.BORRADOR }),
      ]);
      mockQuery.mockResolvedValueOnce([]);
      mockQuery.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

      const result = await service.renew(1);

      expect(result.status).toBe(ContractStatus.BORRADOR);
    });

    it('debe registrar el audit log de renovación', async () => {
      const old = makeContract({ status: ContractStatus.ACTIVO });
      mockQuery.mockResolvedValueOnce([old]);
      mockQuery.mockResolvedValueOnce([{ contract_number: 'CTR-2024-0001' }]);
      mockQuery.mockResolvedValueOnce([
        makeContract({ id: 2, status: ContractStatus.BORRADOR }),
      ]);
      mockQuery.mockResolvedValueOnce([]);
      mockQuery.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

      await service.renew(1, {}, 42);

      expect(mockAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 42,
          action: 'renewed',
          entityType: 'contract',
          entityId: 1,
        }),
      );
    });
  });

  describe('getContractHistory()', () => {
    it('debe retornar contratos en orden cronológico por unit_id', async () => {
      const contract = makeContract({ unit_id: 5 });
      const history = [
        makeContract({
          id: 1,
          status: ContractStatus.RENOVADO,
          start_date: '2023-01-01',
        }),
        makeContract({
          id: 2,
          status: ContractStatus.ACTIVO,
          start_date: '2024-01-01',
        }),
      ];

      mockQuery.mockResolvedValueOnce([contract]); // findOne
      mockQuery.mockResolvedValueOnce(history); // history query

      const result = await service.getContractHistory(1);

      expect(result).toHaveLength(2);
      const historySql = querySql(mockQuery, 1);
      expect(historySql).toContain('unit_id = $1');
      expect(historySql).toContain('ORDER BY c.start_date ASC');
    });

    it('debe usar property_id como fallback cuando no hay unit_id', async () => {
      const contract = makeContract({ unit_id: undefined });
      mockQuery.mockResolvedValueOnce([contract]); // findOne
      mockQuery.mockResolvedValueOnce([contract]); // history query

      await service.getContractHistory(1);

      const historySql = querySql(mockQuery, 1);
      expect(historySql).toContain('property_id = $1');
    });

    it('debe incluir contratos RENOVADO y BORRADOR en el historial', async () => {
      const contract = makeContract({ unit_id: 5 });
      const history = [
        makeContract({ id: 1, status: ContractStatus.RENOVADO }),
        makeContract({ id: 2, status: ContractStatus.BORRADOR }),
      ];

      mockQuery.mockResolvedValueOnce([contract]);
      mockQuery.mockResolvedValueOnce(history);

      const result = await service.getContractHistory(1);

      const statuses = result.map((c) => c.status);
      expect(statuses).toContain(ContractStatus.RENOVADO);
      expect(statuses).toContain(ContractStatus.BORRADOR);
    });

    it('debe lanzar NotFoundException si el contrato no existe', async () => {
      mockQuery.mockResolvedValueOnce([]);

      await expect(service.getContractHistory(999)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('debe retornar array vacío cuando no hay historial para la propiedad', async () => {
      const contract = makeContract({ unit_id: undefined });
      mockQuery.mockResolvedValueOnce([contract]);
      mockQuery.mockResolvedValueOnce([]);

      const result = await service.getContractHistory(1);

      expect(result).toEqual([]);
    });
  });
});
