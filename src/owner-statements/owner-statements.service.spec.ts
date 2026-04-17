import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { getDataSourceToken } from '@nestjs/typeorm';
import { OwnerStatementsService } from './owner-statements.service';
import { OwnerStatementPdfService } from './owner-statement-pdf.service';
import {
  CreateOwnerStatementDto,
  UpdateOwnerStatementDto,
  OwnerStatementResponseDto,
} from './dto';

// Mock function
function mockOwnerStatement(overrides?: Partial<any>): any {
  return {
    id: 1,
    rental_owner_id: 5,
    property_id: 10,
    period_month: 4,
    period_year: 2026,
    gross_rent: '5000.00',
    maintenance_deduction: '500.00',
    management_commission: '750.00',
    net_amount: '3750.00',
    currency: 'BOB',
    payment_count: 1,
    generated_at: new Date('2026-04-14'),
    created_at: new Date('2026-04-14'),
    updated_at: new Date('2026-04-14'),
    ...overrides,
  };
}

describe('OwnerStatementsService', () => {
  let service: OwnerStatementsService;
  let pdfService: OwnerStatementPdfService;
  const mockDataSource = {
    query: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OwnerStatementsService,
        OwnerStatementPdfService,
        { provide: getDataSourceToken(), useValue: mockDataSource },
      ],
    }).compile();

    service = module.get<OwnerStatementsService>(OwnerStatementsService);
    pdfService = module.get<OwnerStatementPdfService>(OwnerStatementPdfService);
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('debe crear un nuevo estado de cuenta', async () => {
      const dto: CreateOwnerStatementDto = {
        rental_owner_id: 5,
        property_id: 10,
        period_month: 4,
        period_year: 2026,
        gross_rent: 5000,
        maintenance_deduction: 500,
        management_commission: 750,
        net_amount: 3750,
        currency: 'BOB',
        payment_count: 1,
      };

      const mockResult = mockOwnerStatement();
      mockDataSource.query.mockResolvedValueOnce([mockResult]);

      const result = await service.create(dto);

      expect(result).toBeDefined();
      expect(result.rental_owner_id).toBe(dto.rental_owner_id);
      expect(mockDataSource.query).toHaveBeenCalledTimes(1);
    });

    it('debe lanzar BadRequestException si ya existe el statement', async () => {
      const dto: CreateOwnerStatementDto = {
        rental_owner_id: 5,
        property_id: 10,
        period_month: 4,
        period_year: 2026,
        gross_rent: 5000,
        maintenance_deduction: 500,
        management_commission: 750,
        net_amount: 3750,
      };

      const error = new Error('Duplicate key value violates unique constraint');
      error['code'] = '23505';
      mockDataSource.query.mockRejectedValueOnce(error);

      await expect(service.create(dto)).rejects.toThrow(BadRequestException);
    });
  });

  describe('findOne', () => {
    it('debe retornar un estado de cuenta por ID', async () => {
      const mockResult = mockOwnerStatement();
      mockDataSource.query.mockResolvedValueOnce([mockResult]);

      const result = await service.findOne(1);

      expect(result).toBeDefined();
      expect(result.id).toBe(1);
    });

    it('debe lanzar NotFoundException si no existe', async () => {
      mockDataSource.query.mockResolvedValueOnce([]);

      await expect(service.findOne(999)).rejects.toThrow(NotFoundException);
    });
  });

  describe('findByOwner', () => {
    it('debe retornar todos los estados de cuenta de un propietario', async () => {
      const mockResults = [
        mockOwnerStatement({ id: 1, period_month: 3 }),
        mockOwnerStatement({ id: 2, period_month: 4 }),
      ];
      mockDataSource.query.mockResolvedValueOnce(mockResults);

      const result = await service.findByOwner(5);

      expect(result).toHaveLength(2);
      expect(result[0].rental_owner_id).toBe(5);
    });

    it('debe retornar lista vacía si no hay statements', async () => {
      mockDataSource.query.mockResolvedValueOnce([]);

      const result = await service.findByOwner(999);

      expect(result).toHaveLength(0);
    });
  });

  describe('findByPeriod', () => {
    it('debe retornar statements filtrados por período', async () => {
      const mockResults = [mockOwnerStatement(), mockOwnerStatement({ id: 2 })];
      mockDataSource.query.mockResolvedValueOnce(mockResults);

      const result = await service.findByPeriod(2026, 4);

      expect(result).toHaveLength(2);
      expect(result[0].period_year).toBe(2026);
      expect(result[0].period_month).toBe(4);
    });
  });

  describe('update', () => {
    it('debe actualizar un estado de cuenta', async () => {
      const dto: UpdateOwnerStatementDto = {
        gross_rent: 6000,
        management_commission: 900,
      };

      const mockExisting = mockOwnerStatement();
      const mockUpdated = mockOwnerStatement({
        gross_rent: '6000.00',
        management_commission: '900.00',
      });

      mockDataSource.query
        .mockResolvedValueOnce([mockExisting])
        .mockResolvedValueOnce([mockUpdated]);

      const result = await service.update(1, dto);

      expect(result.gross_rent).toBe(6000);
      expect(result.management_commission).toBe(900);
    });

    it('debe retornar el mismo statement si no hay cambios', async () => {
      const mockExisting = mockOwnerStatement();
      mockDataSource.query.mockResolvedValueOnce([mockExisting]);

      const result = await service.update(1, {});

      expect(result.id).toBe(1);
    });
  });

  describe('delete', () => {
    it('debe eliminar un estado de cuenta', async () => {
      const mockExisting = mockOwnerStatement();
      mockDataSource.query
        .mockResolvedValueOnce([mockExisting])
        .mockResolvedValueOnce(null);

      const result = await service.delete(1);

      expect(result.message).toContain('eliminado');
    });
  });

  describe('createStatementFromPayment', () => {
    it('debe crear un statement desde datos de pago', async () => {
      const paymentData = {
        month: 4,
        year: 2026,
        rentalOwnerId: 5,
        propertyId: 10,
        grossRent: 5000,
        maintenanceDeduction: 500,
        commissionPercentage: 15,
        currency: 'BOB',
        paymentCount: 1,
      };

      const mockResult = mockOwnerStatement();
      mockDataSource.query.mockResolvedValueOnce([mockResult]);

      const result = await service.createStatementFromPayment(paymentData);

      expect(result).toBeDefined();
      // Commission should be calculated as 5000 * 15 / 100 = 750
      expect(result.management_commission).toBe(750);
    });
  });
});

describe('OwnerStatementPdfService', () => {
  let service: OwnerStatementPdfService;

  beforeEach(() => {
    service = new OwnerStatementPdfService();
  });

  describe('generatePdf', () => {
    it('debe generar un PDF válido', async () => {
      const statementData = {
        id: 1,
        owner_name: 'Juan Pérez',
        property_title: 'Departamento 2A',
        property_address: 'Av. Principal 123',
        property_city: 'La Paz',
        property_country: 'Bolivia',
        tenant_name: 'Carlos García',
        period_year: 2026,
        period_month: 4,
        gross_rent: 5000,
        maintenance_deduction: 500,
        management_commission: 750,
        net_amount: 3750,
        currency: 'BOB',
      };

      const filePath = await service.generatePdf(statementData, 'es');

      expect(filePath).toBeDefined();
      expect(filePath).toContain('liquidacion_');
    });

    it('debe generar PDF en inglés', async () => {
      const statementData = {
        id: 1,
        owner_name: 'John Smith',
        property_title: 'Apartment 2A',
        property_address: 'Main Ave 123',
        property_city: 'La Paz',
        property_country: 'Bolivia',
        tenant_name: 'Carlos García',
        period_year: 2026,
        period_month: 4,
        gross_rent: 5000,
        maintenance_deduction: 500,
        management_commission: 750,
        net_amount: 3750,
        currency: 'BOB',
      };

      const filePath = await service.generatePdf(statementData, 'en');

      expect(filePath).toBeDefined();
      expect(filePath).toContain('liquidacion_');
    });
  });

  describe('deletePdf', () => {
    it('debe intentar eliminar un PDF', async () => {
      const statementId = 1;
      const ownerName = 'Juan Pérez';

      // Este test simplemente verifica que el método no lance error
      await expect(
        service.deletePdf(statementId, ownerName),
      ).resolves.not.toThrow();
    });
  });
});
