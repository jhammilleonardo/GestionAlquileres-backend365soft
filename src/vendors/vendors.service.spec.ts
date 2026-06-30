import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { getDataSourceToken } from '@nestjs/typeorm';
import { VendorsService } from './vendors.service';
import { VendorSpecialty } from './enums/vendor-specialty.enum';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { AuthService } from '../auth/auth.service';

function mockVendor(
  overrides?: Partial<Record<string, unknown>>,
): Record<string, unknown> {
  return {
    id: 1,
    name: 'Instalaciones Rápidas S.R.L.',
    specialty: VendorSpecialty.PLUMBING,
    phone: '+591 76543210',
    email: 'contacto@instalaciones.bo',
    address: 'Av. Arce 1234, La Paz',
    rate_per_hour: '80.00',
    rate_flat: null,
    is_active: true,
    average_rating: null,
    notes: null,
    created_by: 1,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

describe('VendorsService', () => {
  let service: VendorsService;
  const mockDataSource = { query: jest.fn() };
  const mockAuthService = { createPasswordSetupLink: jest.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VendorsService,
        { provide: getDataSourceToken(), useValue: mockDataSource },
        { provide: AuditLogsService, useValue: { log: jest.fn() } },
        { provide: AuthService, useValue: mockAuthService },
      ],
    }).compile();

    service = module.get<VendorsService>(VendorsService);
    jest.resetAllMocks();
  });

  // ─── findAll ──────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('debe retornar lista de proveedores activos por defecto', async () => {
      const vendors = [
        mockVendor(),
        mockVendor({ id: 2, name: 'Eléctrica del Norte' }),
      ];
      mockDataSource.query.mockResolvedValueOnce(vendors);

      const result = await service.findAll({});

      expect(result).toHaveLength(2);
      expect(mockDataSource.query).toHaveBeenCalledTimes(1);
    });

    it('debe filtrar por specialty cuando se indica', async () => {
      mockDataSource.query.mockResolvedValueOnce([mockVendor()]);

      const result = await service.findAll({
        specialty: VendorSpecialty.PLUMBING,
      });

      expect(result).toHaveLength(1);
    });

    it('debe retornar lista vacía si no hay proveedores', async () => {
      mockDataSource.query.mockResolvedValueOnce([]);

      const result = await service.findAll({});

      expect(result).toHaveLength(0);
    });
  });

  // ─── findOne ──────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('debe retornar el proveedor con total_orders', async () => {
      mockDataSource.query.mockResolvedValueOnce([
        { ...mockVendor(), total_orders: '3' },
      ]);

      const result = await service.findOne(1);

      expect(result).toBeDefined();
      expect(result.id).toBe(1);
    });

    it('debe lanzar NotFoundException si el proveedor no existe', async () => {
      mockDataSource.query.mockResolvedValueOnce([]);

      await expect(service.findOne(999)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── create ───────────────────────────────────────────────────────────────

  describe('create', () => {
    it('debe crear un proveedor y retornarlo', async () => {
      const dto = {
        name: 'Instalaciones Rápidas S.R.L.',
        specialty: VendorSpecialty.PLUMBING,
        phone: '+591 76543210',
      };
      mockDataSource.query.mockResolvedValueOnce([mockVendor()]);

      const result = await service.create(dto, 1);

      expect(result.name).toBe(dto.name);
      expect(result.specialty).toBe(VendorSpecialty.PLUMBING);
    });

    it('persiste specialty_other solo cuando la especialidad es "other"', async () => {
      mockDataSource.query.mockResolvedValueOnce([mockVendor()]);

      await service.create(
        {
          name: 'Jardines SRL',
          specialty: VendorSpecialty.OTHER,
          specialty_other: 'Jardinería',
        },
        1,
      );

      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      const params = mockDataSource.query.mock.calls[0][1] as unknown[];
      expect(params[1]).toBe(VendorSpecialty.OTHER);
      expect(params[2]).toBe('Jardinería');
    });

    it('ignora specialty_other cuando la especialidad no es "other"', async () => {
      mockDataSource.query.mockResolvedValueOnce([mockVendor()]);

      await service.create(
        {
          name: 'Plomería Central',
          specialty: VendorSpecialty.PLUMBING,
          specialty_other: 'no debería guardarse',
        },
        1,
      );

      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      const params = mockDataSource.query.mock.calls[0][1] as unknown[];
      expect(params[2]).toBeNull();
    });
  });

  // ─── inviteVendor ───────────────────────────────────────────────────────────

  describe('inviteVendor', () => {
    it('crea la cuenta si no existe y devuelve el enlace de invitación', async () => {
      const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 48);
      mockDataSource.query
        .mockResolvedValueOnce([
          mockVendor({ email: 'prov@example.com', is_active: true }),
        ]) // findOne
        .mockResolvedValueOnce([]) // ensureVendorUser: no existe usuario
        .mockResolvedValueOnce(undefined); // INSERT user
      mockAuthService.createPasswordSetupLink.mockResolvedValueOnce({
        resetUrl: 'http://localhost:4200/reset-password?token=abc',
        expiresAt,
      });

      const result = await service.inviteVendor(1);

      expect(result).toEqual({
        email: 'prov@example.com',
        inviteUrl: 'http://localhost:4200/reset-password?token=abc',
        expiresAt,
        created: true,
      });
      expect(mockAuthService.createPasswordSetupLink).toHaveBeenCalledWith(
        'prov@example.com',
        1000 * 60 * 60 * 48,
      );
    });

    it('rechaza invitar a un proveedor sin correo', async () => {
      mockDataSource.query.mockResolvedValueOnce([
        mockVendor({ email: null, is_active: true }),
      ]); // findOne

      await expect(service.inviteVendor(1)).rejects.toThrow(
        'El proveedor necesita un correo',
      );
      expect(mockAuthService.createPasswordSetupLink).not.toHaveBeenCalled();
    });

    it('rechaza si el correo ya pertenece a otra cuenta no-VENDOR', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([
          mockVendor({ email: 'dup@example.com', is_active: true }),
        ]) // findOne
        .mockResolvedValueOnce([{ id: 9, role: 'ADMIN' }]); // ensureVendorUser: colisión

      await expect(service.inviteVendor(1)).rejects.toThrow(
        'Ya existe una cuenta de otro tipo',
      );
      expect(mockAuthService.createPasswordSetupLink).not.toHaveBeenCalled();
    });
  });

  // ─── update ───────────────────────────────────────────────────────────────

  describe('update', () => {
    it('debe actualizar un proveedor', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([{ id: 1 }]) // assertExists
        .mockResolvedValueOnce([mockVendor({ name: 'Nuevo Nombre' })]); // UPDATE

      const result = await service.update(1, { name: 'Nuevo Nombre' });

      expect(result.name).toBe('Nuevo Nombre');
    });

    it('debe lanzar NotFoundException si no existe', async () => {
      mockDataSource.query.mockResolvedValueOnce([]);

      await expect(service.update(999, { name: 'Otro' })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('debe retornar el proveedor sin modificar si no hay campos', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([{ id: 1 }]) // assertExists
        .mockResolvedValueOnce([mockVendor()]); // findOne (fallback cuando dto vacío)

      const result = await service.update(1, {});

      expect(result.id).toBe(1);
    });
  });

  // ─── deactivate ───────────────────────────────────────────────────────────

  describe('deactivate', () => {
    it('debe desactivar el proveedor', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([{ id: 1 }])
        .mockResolvedValueOnce(null);

      const result = await service.deactivate(1);

      expect(result.message).toContain('desactivado');
    });

    it('debe lanzar NotFoundException si no existe', async () => {
      mockDataSource.query.mockResolvedValueOnce([]);

      await expect(service.deactivate(999)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── getHistory ───────────────────────────────────────────────────────────

  describe('getHistory', () => {
    it('debe retornar el historial de órdenes del proveedor', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([{ id: 1 }]) // assertExists
        .mockResolvedValueOnce([
          // history query
          {
            id: 10,
            ticket_number: 'MNT-2026-ABCDEF',
            status: 'COMPLETED',
            vendor_rating: 4,
          },
          {
            id: 11,
            ticket_number: 'MNT-2026-GHIJKL',
            status: 'CLOSED',
            vendor_rating: null,
          },
        ]);

      const result = await service.getHistory(1);

      expect(result).toHaveLength(2);
      expect(result[0].ticket_number).toBe('MNT-2026-ABCDEF');
    });

    it('debe retornar lista vacía si no tiene órdenes', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([{ id: 1 }])
        .mockResolvedValueOnce([]);

      const result = await service.getHistory(1);

      expect(result).toHaveLength(0);
    });
  });

  // ─── recalculateAverageRating ─────────────────────────────────────────────

  describe('recalculateAverageRating', () => {
    it('debe ejecutar el UPDATE sin errores', async () => {
      mockDataSource.query.mockResolvedValueOnce(null);

      await expect(service.recalculateAverageRating(1)).resolves.not.toThrow();
      expect(mockDataSource.query).toHaveBeenCalledTimes(1);
    });
  });
});
