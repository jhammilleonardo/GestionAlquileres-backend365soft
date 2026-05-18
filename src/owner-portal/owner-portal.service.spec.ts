import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { ForbiddenException } from '@nestjs/common';
import { OwnerPortalService } from './owner-portal.service';
import { OwnerStatementPdfService } from '../owner-statements/owner-statement-pdf.service';

const OWNER_ID = 1;
const OTHER_OWNER_ID = 99;

describe('OwnerPortalService', () => {
  let service: OwnerPortalService;
  let dataSource: { query: jest.Mock };

  beforeEach(async () => {
    dataSource = { query: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OwnerPortalService,
        {
          provide: getDataSourceToken(),
          useValue: dataSource,
        },
        {
          provide: OwnerStatementPdfService,
          useValue: {
            generatePdf: jest.fn().mockResolvedValue('/tmp/test.pdf'),
          },
        },
      ],
    }).compile();

    service = module.get<OwnerPortalService>(OwnerPortalService);
  });

  // ─── Dashboard ─────────────────────────────────────────────────────────────

  describe('getDashboard', () => {
    it('debe retornar dashboard con ceros si el propietario no tiene propiedades', async () => {
      dataSource.query
        .mockResolvedValueOnce([{ count: '0' }]) // properties
        .mockResolvedValueOnce([{ count: '0' }]) // tenants
        .mockResolvedValueOnce([{ pending_balance: '0', currency: 'BOB' }]) // balance
        .mockResolvedValueOnce([{ count: '0' }]) // maintenance
        .mockResolvedValueOnce([{ count: '0' }]); // statements

      const result = await service.getDashboard(OWNER_ID);

      expect(result.property_count).toBe(0);
      expect(result.active_tenant_count).toBe(0);
      expect(result.pending_balance).toBe(0);
      expect(result.currency).toBe('BOB');
      expect(result.active_maintenance_count).toBe(0);
      expect(result.pending_statements).toBe(0);
    });

    it('debe retornar totales correctos con datos reales', async () => {
      dataSource.query
        .mockResolvedValueOnce([{ count: '3' }])
        .mockResolvedValueOnce([{ count: '2' }])
        .mockResolvedValueOnce([
          { pending_balance: '1500.00', currency: 'BOB' },
        ])
        .mockResolvedValueOnce([{ count: '1' }])
        .mockResolvedValueOnce([{ count: '2' }]);

      const result = await service.getDashboard(OWNER_ID);

      expect(result.property_count).toBe(3);
      expect(result.active_tenant_count).toBe(2);
      expect(result.pending_balance).toBe(1500);
      expect(result.active_maintenance_count).toBe(1);
      expect(result.pending_statements).toBe(2);
    });
  });

  // ─── Properties ───────────────────────────────────────────────────────────

  describe('getProperties', () => {
    it('debe retornar solo propiedades del propietario autenticado', async () => {
      const mockProperties = [
        {
          id: 1,
          title: 'Casa A',
          status: 'OCUPADO',
          monthly_rent: '3000',
          ownership_percentage: 100,
        },
        {
          id: 2,
          title: 'Depto B',
          status: 'DISPONIBLE',
          monthly_rent: '2000',
          ownership_percentage: 50,
        },
      ];
      dataSource.query.mockResolvedValue(mockProperties);

      const result = await service.getProperties(OWNER_ID);

      expect(result).toHaveLength(2);
      expect(dataSource.query).toHaveBeenCalledWith(
        expect.stringContaining('po.rental_owner_id = $1'),
        [OWNER_ID],
      );
    });

    it('debe retornar lista vacía si el propietario no tiene propiedades', async () => {
      dataSource.query.mockResolvedValue([]);
      const result = await service.getProperties(OWNER_ID);
      expect(result).toHaveLength(0);
    });
  });

  // ─── Statements ───────────────────────────────────────────────────────────

  describe('getStatements', () => {
    it('debe retornar liquidaciones con montos convertidos a number', async () => {
      dataSource.query.mockResolvedValue([
        {
          id: 10,
          property_id: 1,
          property_title: 'Casa A',
          period_month: 3,
          period_year: 2025,
          gross_rent: '3000.00',
          maintenance_deduction: '200.00',
          management_commission: '270.00',
          net_amount: '2530.00',
          currency: 'BOB',
          status: 'pending',
          transferred_at: null,
          generated_at: new Date(),
        },
      ]);

      const result = await service.getStatements(OWNER_ID);

      expect(result).toHaveLength(1);
      expect(result[0].gross_rent).toBe(3000);
      expect(result[0].net_amount).toBe(2530);
      expect(typeof result[0].gross_rent).toBe('number');
    });
  });

  // ─── Maintenance — list ────────────────────────────────────────────────────

  describe('getMaintenance', () => {
    it('debe retornar solicitudes activas de sus propiedades', async () => {
      const mockRows = [
        {
          id: 1,
          status: 'NEW',
          property_id: 1,
          property_title: 'Casa A',
          ticket_number: 'MR-001',
        },
        {
          id: 2,
          status: 'IN_PROGRESS',
          property_id: 2,
          property_title: 'Depto B',
          ticket_number: 'MR-002',
        },
      ];
      dataSource.query.mockResolvedValue(mockRows);

      const result = await service.getMaintenance(OWNER_ID);

      expect(result).toHaveLength(2);
      expect(dataSource.query).toHaveBeenCalledWith(
        expect.stringContaining('po.rental_owner_id = $1'),
        [OWNER_ID],
      );
    });

    it('debe retornar lista vacía si no hay solicitudes activas', async () => {
      dataSource.query.mockResolvedValue([]);
      const result = await service.getMaintenance(OWNER_ID);
      expect(result).toHaveLength(0);
    });
  });

  // ─── Maintenance — authorize ───────────────────────────────────────────────

  describe('authorizeMaintenance', () => {
    it('debe lanzar ForbiddenException si la solicitud no pertenece al propietario', async () => {
      dataSource.query.mockResolvedValue([]); // sin resultados — no es del propietario

      await expect(
        service.authorizeMaintenance(5, OTHER_OWNER_ID),
      ).rejects.toThrow(ForbiddenException);
    });

    it('debe autorizar correctamente si la solicitud pertenece al propietario y está en Bolivia', async () => {
      dataSource.query
        .mockResolvedValueOnce([{ id: 5 }]) // ownership + Bolivia check OK
        .mockResolvedValueOnce([]); // UPDATE

      await expect(
        service.authorizeMaintenance(5, OWNER_ID),
      ).resolves.not.toThrow();
      expect(dataSource.query).toHaveBeenCalledTimes(2);
      expect(dataSource.query).toHaveBeenCalledWith(
        expect.stringContaining("pa.country ILIKE 'Bolivia'"),
        [5, OWNER_ID],
      );
    });
  });

  // ─── Statement PDF — ownership check ──────────────────────────────────────

  describe('getStatementPdf', () => {
    it('debe lanzar ForbiddenException si la liquidación no pertenece al propietario', async () => {
      dataSource.query.mockResolvedValue([]); // assertStatementBelongsToOwner → vacío

      await expect(
        service.getStatementPdf(99, OTHER_OWNER_ID, 'es'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('debe retornar la ruta del PDF si el propietario es el dueño de la liquidación', async () => {
      dataSource.query
        .mockResolvedValueOnce([{ id: 10 }]) // ownership OK
        .mockResolvedValueOnce([
          {
            // datos para PDF
            id: 10,
            owner_name: 'John Doe',
            property_title: 'Casa A',
            property_address: 'Calle 1',
            property_city: 'La Paz',
            property_country: 'Bolivia',
            tenant_name: 'Jane Smith',
            period_year: 2025,
            period_month: 3,
            gross_rent: '3000',
            maintenance_deduction: '200',
            management_commission: '270',
            net_amount: '2530',
            currency: 'BOB',
          },
        ]);

      const result = await service.getStatementPdf(10, OWNER_ID, 'es');
      expect(result).toBe('/tmp/test.pdf');
    });
  });

  // ─── Contracts ────────────────────────────────────────────────────────────

  describe('getContracts', () => {
    it('debe retornar solo contratos firmados con PDF disponible', async () => {
      const mockContracts = [
        {
          id: 1,
          contract_number: 'CTR-2025-001',
          status: 'ACTIVO',
          is_signed: true,
          pdf_url: '/storage/contracts/ctr-001.pdf',
          monthly_rent: '3000',
        },
      ];
      dataSource.query.mockResolvedValue(mockContracts);

      const result = await service.getContracts(OWNER_ID);

      expect(result).toHaveLength(1);
      expect(dataSource.query).toHaveBeenCalledWith(
        expect.stringContaining('is_signed = true'),
        [OWNER_ID],
      );
    });
  });
});
