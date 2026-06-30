import { Test, TestingModule } from '@nestjs/testing';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import {
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { getDataSourceToken } from '@nestjs/typeorm';
import { RentalOwnersService } from './rental-owners.service';
import { AuthService } from '../auth/auth.service';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const mockOwnerRow = (overrides = {}) => ({
  id: 1,
  name: 'Carlos Mamani',
  company_name: null,
  is_company: false,
  primary_email: 'carlos@test.com',
  phone_number: '+591 70000000',
  secondary_email: null,
  secondary_phone: null,
  notes: '',
  is_active: true,
  bank_name: 'BNB',
  account_number: '1234567890',
  account_type: 'savings',
  account_holder_name: 'Carlos Mamani',
  cbu_iban: null,
  property_count: 2,
  pending_balance: '1500.00',
  created_at: new Date('2025-01-01'),
  updated_at: new Date('2025-01-01'),
  ...overrides,
});

describe('RentalOwnersService', () => {
  let service: RentalOwnersService;

  const mockDataSource = {
    query: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RentalOwnersService,
        { provide: AuditLogsService, useValue: { log: jest.fn() } },
        { provide: getDataSourceToken(), useValue: mockDataSource },
        {
          provide: AuthService,
          useValue: {
            createPasswordSetupLink: jest.fn().mockResolvedValue({
              resetUrl: 'https://app.test/setup-token',
              expiresAt: new Date('2026-01-01T00:00:00.000Z'),
            }),
          },
        },
      ],
    }).compile();

    service = module.get<RentalOwnersService>(RentalOwnersService);
    jest.clearAllMocks();
  });

  // ─── findAll ───────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('debe retornar lista de propietarios con saldo y cantidad de propiedades', async () => {
      const rows = [
        mockOwnerRow(),
        mockOwnerRow({ id: 2, name: 'Ana Quispe', pending_balance: '0' }),
      ];
      mockDataSource.query.mockResolvedValueOnce(rows);

      const result = await service.findAll();

      expect(result).toHaveLength(2);
      expect(result[0].pending_balance).toBe(1500);
      expect(result[1].pending_balance).toBe(0);
    });

    it('debe retornar array vacío si no hay propietarios', async () => {
      mockDataSource.query.mockResolvedValueOnce([]);

      const result = await service.findAll();

      expect(result).toEqual([]);
    });
  });

  // ─── findOne ───────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('debe retornar el propietario si existe', async () => {
      const row = mockOwnerRow();
      mockDataSource.query.mockResolvedValueOnce([row]);

      const result = await service.findOne(1);

      expect(result.id).toBe(1);
      expect(result.name).toBe('Carlos Mamani');
    });

    it('debe lanzar NotFoundException si el propietario no existe', async () => {
      mockDataSource.query.mockResolvedValueOnce([]);

      await expect(service.findOne(999)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── create ────────────────────────────────────────────────────────────────

  describe('create', () => {
    const createDto = {
      name: 'Nuevo Propietario',
      primary_email: 'nuevo@test.com',
      phone_number: '+591 70000001',
      bank_details: {
        bank_name: 'Banco Mercantil',
        account_number: '9876543210',
        account_type: 'corriente' as const,
        account_holder_name: 'Nuevo Propietario',
      },
    };

    it('debe crear el propietario con datos bancarios', async () => {
      const saved = mockOwnerRow({
        name: 'Nuevo Propietario',
        primary_email: 'nuevo@test.com',
      });
      mockDataSource.query
        .mockResolvedValueOnce([]) // assertEmailUnique → sin duplicado
        .mockResolvedValueOnce([saved]); // INSERT RETURNING

      const result = await service.create(createDto);

      expect(result.name).toBe('Nuevo Propietario');
      expect(mockDataSource.query).toHaveBeenCalledTimes(2);
    });

    it('debe lanzar ConflictException si el email ya existe', async () => {
      mockDataSource.query.mockResolvedValueOnce([{ id: 5 }]); // email duplicado

      await expect(service.create(createDto)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  // ─── update ────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('debe actualizar los campos enviados', async () => {
      const updated = mockOwnerRow({ name: 'Nombre Actualizado' });
      mockDataSource.query
        .mockResolvedValueOnce([mockOwnerRow()]) // findOne (existencia)
        .mockResolvedValueOnce(undefined) // UPDATE
        .mockResolvedValueOnce([updated]); // findOne (retorno)

      const result = await service.update(1, { name: 'Nombre Actualizado' });

      expect(result.name).toBe('Nombre Actualizado');
    });

    it('debe retornar el propietario sin cambios si el DTO está vacío', async () => {
      const row = mockOwnerRow();
      mockDataSource.query
        .mockResolvedValueOnce([row]) // findOne (existencia)
        .mockResolvedValueOnce([row]); // findOne (sin UPDATE porque fields=0)

      const result = await service.update(1, {});

      // Sin datos → solo dos queries (findOne inicial + findOne final)
      expect(result.id).toBe(1);
    });

    it('debe lanzar ConflictException si el nuevo email ya pertenece a otro propietario', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([mockOwnerRow()]) // findOne
        .mockResolvedValueOnce([{ id: 99 }]); // assertEmailUnique → duplicado

      await expect(
        service.update(1, { primary_email: 'otro@test.com' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  // ─── deactivate ────────────────────────────────────────────────────────────

  describe('deactivate', () => {
    it('debe desactivar el propietario si no tiene propiedades activas', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([mockOwnerRow()]) // findOne
        .mockResolvedValueOnce([]) // assertNoActiveProperties → ninguna
        .mockResolvedValueOnce(undefined); // UPDATE is_active = false

      const result = await service.deactivate(1);

      expect(result.message).toContain('desactivado correctamente');
    });

    it('debe retornar mensaje si ya estaba inactivo', async () => {
      mockDataSource.query.mockResolvedValueOnce([
        mockOwnerRow({ is_active: false }),
      ]);

      const result = await service.deactivate(1);

      expect(result.message).toContain('ya estaba inactivo');
    });

    it('debe lanzar BadRequestException si tiene propiedades activas', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([mockOwnerRow()]) // findOne
        .mockResolvedValueOnce([{ property_id: 10 }]); // propiedad activa

      await expect(service.deactivate(1)).rejects.toThrow(BadRequestException);
    });
  });

  // ─── getProperties ─────────────────────────────────────────────────────────

  describe('getProperties', () => {
    it('debe retornar las propiedades del propietario', async () => {
      const properties = [
        {
          id: 10,
          title: 'Depto 2A',
          status: 'OCUPADO',
          monthly_rent: '500',
          currency: 'BOB',
          ownership_percentage: 100,
          is_primary: true,
          street_address: 'Calle 1',
          city: 'La Paz',
          country: 'Bolivia',
        },
      ];
      mockDataSource.query
        .mockResolvedValueOnce([mockOwnerRow()]) // findOne
        .mockResolvedValueOnce(properties); // SELECT propiedades

      const result = await service.getProperties(1);

      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('Depto 2A');
    });
  });

  // ─── getStatements ─────────────────────────────────────────────────────────

  describe('getStatements', () => {
    it('debe leer las liquidaciones de la tabla dedicada owner_statements', async () => {
      const statements = [
        {
          id: 7,
          period_month: 1,
          period_year: 2025,
          property_id: 10,
          property_title: 'Depto 2A',
          gross_rent: '500',
          maintenance_deduction: '20',
          management_commission: '50',
          net_amount: '430',
          currency: 'BOB',
          status: 'pending',
        },
      ];
      mockDataSource.query
        .mockResolvedValueOnce([mockOwnerRow()]) // findOne
        .mockResolvedValueOnce(statements); // SELECT owner_statements

      const result = await service.getStatements(1);

      expect(result).toHaveLength(1);
      expect(result[0].net_amount).toBe('430');
      // Debe consultar la tabla dedicada, no agregar pagos.
      expect(mockDataSource.query).toHaveBeenLastCalledWith(
        expect.stringContaining('owner_statements'),
        [1],
      );
    });

    it('debe lanzar NotFoundException si el propietario no existe', async () => {
      mockDataSource.query.mockResolvedValueOnce([]);

      await expect(service.getStatements(999)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
