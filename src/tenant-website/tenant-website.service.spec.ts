import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { TenantWebsiteService } from './tenant-website.service';

const SCHEMA = 'tenant_acme';

function makeWebsite(overrides = {}) {
  return {
    id: 1,
    subdomain: 'acme',
    company_description: null,
    logo_url: null,
    primary_color: '#1976d2',
    secondary_color: '#424242',
    contact_email: null,
    contact_phone: null,
    social_links: {},
    meta_title: null,
    meta_description: null,
    is_published: false,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

describe('TenantWebsiteService', () => {
  let service: TenantWebsiteService;
  const mockDataSource = { query: jest.fn() };

  function getQuerySql(callIndex: number): string {
    const call = mockDataSource.query.mock.calls[callIndex] as unknown[];
    return String(call[0]);
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TenantWebsiteService,
        { provide: getDataSourceToken(), useValue: mockDataSource },
      ],
    }).compile();

    service = module.get<TenantWebsiteService>(TenantWebsiteService);
  });

  afterEach(() => jest.resetAllMocks());

  // ─── getOrCreate ──────────────────────────────────────────────────────────

  describe('getOrCreate', () => {
    it('retorna el registro existente si ya hay uno', async () => {
      const website = makeWebsite();
      mockDataSource.query.mockResolvedValueOnce([website]);

      const result = await service.getOrCreate(SCHEMA);
      expect(result.id).toBe(1);
      expect(mockDataSource.query).toHaveBeenCalledTimes(1);
    });

    it('inserta y retorna un nuevo registro si no existe ninguno', async () => {
      const website = makeWebsite();
      mockDataSource.query
        .mockResolvedValueOnce([]) // SELECT vacío
        .mockResolvedValueOnce([website]); // INSERT RETURNING

      const result = await service.getOrCreate(SCHEMA);
      expect(result.id).toBe(1);
      expect(getQuerySql(1)).toContain('INSERT INTO');
    });
  });

  // ─── update ───────────────────────────────────────────────────────────────

  describe('update', () => {
    it('actualiza los campos provistos y retorna el registro actualizado', async () => {
      const original = makeWebsite();
      const updated = makeWebsite({ contact_email: 'info@acme.com' });

      mockDataSource.query
        .mockResolvedValueOnce([original]) // getOrCreate SELECT
        .mockResolvedValueOnce([updated]); // UPDATE RETURNING

      const result = await service.update(SCHEMA, {
        contact_email: 'info@acme.com',
      });
      expect(result.contact_email).toBe('info@acme.com');
    });

    it('retorna el registro sin cambios si el DTO está vacío', async () => {
      const original = makeWebsite();
      mockDataSource.query.mockResolvedValueOnce([original]);

      const result = await service.update(SCHEMA, {});
      expect(result).toEqual(original);
      expect(mockDataSource.query).toHaveBeenCalledTimes(1);
    });
  });

  // ─── setPublished ─────────────────────────────────────────────────────────

  describe('setPublished', () => {
    it('fija el estado is_published al valor indicado (idempotente)', async () => {
      const website = makeWebsite({ is_published: false });
      const published = makeWebsite({ is_published: true });

      mockDataSource.query
        .mockResolvedValueOnce([website]) // getOrCreate
        .mockResolvedValueOnce([published]); // UPDATE is_published = $1

      const result = await service.setPublished(SCHEMA, true);
      expect(result.is_published).toBe(true);

      expect(getQuerySql(1)).toContain('is_published = $1');
    });

    it('alterna el estado actual si no se indica valor', async () => {
      const website = makeWebsite({ is_published: true });
      const toggled = makeWebsite({ is_published: false });

      mockDataSource.query
        .mockResolvedValueOnce([website]) // getOrCreate
        .mockResolvedValueOnce([toggled]); // UPDATE is_published = $1

      const result = await service.setPublished(SCHEMA);
      expect(result.is_published).toBe(false);
    });
  });

  // ─── getPublicWebsite ─────────────────────────────────────────────────────

  describe('getPublicWebsite', () => {
    it('lanza NotFoundException si el tenant no existe', async () => {
      mockDataSource.query.mockResolvedValueOnce([]);

      await expect(service.getPublicWebsite('noexiste')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('lanza NotFoundException si el sitio no está publicado', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([{ schema_name: SCHEMA }]) // tenant lookup
        .mockResolvedValueOnce([makeWebsite({ is_published: false })]); // website

      await expect(service.getPublicWebsite('acme')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('retorna website + propiedades disponibles cuando está publicado', async () => {
      const website = makeWebsite({ is_published: true });
      const properties = [
        { id: 1, title: 'Casa grande', status: 'DISPONIBLE' },
      ];

      mockDataSource.query
        .mockResolvedValueOnce([{ schema_name: SCHEMA }])
        .mockResolvedValueOnce([website])
        .mockResolvedValueOnce(properties);

      const result = await service.getPublicWebsite('acme');
      expect(result.is_published).toBe(true);
      expect(result.properties).toHaveLength(1);
    });
  });

  // ─── getBranding (gating de publicación) ───────────────────────────────────

  describe('getBranding', () => {
    it('retorna null si el tenant no existe', async () => {
      mockDataSource.query.mockResolvedValueOnce([]); // tenant lookup vacío

      const result = await service.getBranding('noexiste');
      expect(result).toBeNull();
    });

    it('retorna null para un sitio no publicado a un anónimo', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([{ schema_name: SCHEMA, company_name: 'Acme' }])
        .mockResolvedValueOnce([makeWebsite({ is_published: false })]);

      const result = await service.getBranding('acme');
      expect(result).toBeNull();
    });

    it('NO crea la fila (sin INSERT) en un GET anónimo', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([{ schema_name: SCHEMA, company_name: 'Acme' }])
        .mockResolvedValueOnce([]); // readWebsiteRow sin fila

      const result = await service.getBranding('acme');
      expect(result).toBeNull();
      expect(mockDataSource.query).toHaveBeenCalledTimes(2);
      expect(getQuerySql(1)).not.toContain('INSERT');
    });

    it('retorna el branding de un sitio no publicado al staff del tenant', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([{ schema_name: SCHEMA, company_name: 'Acme' }])
        .mockResolvedValueOnce([makeWebsite({ is_published: false })]);

      const result = await service.getBranding('acme', true);
      expect(result).not.toBeNull();
      expect(result?.company_name).toBe('Acme');
    });

    it('retorna el branding de un sitio publicado a anónimos', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([{ schema_name: SCHEMA, company_name: 'Acme' }])
        .mockResolvedValueOnce([makeWebsite({ is_published: true })]);

      const result = await service.getBranding('acme');
      expect(result?.is_published).toBe(true);
    });
  });

  // ─── isStaffOfTenant ───────────────────────────────────────────────────────

  describe('isStaffOfTenant', () => {
    it('true para ADMIN del mismo tenant', () => {
      expect(
        service.isStaffOfTenant({ role: 'ADMIN', tenantSlug: 'acme' }, 'acme'),
      ).toBe(true);
    });

    it('false para INQUILINO o tenant distinto o anónimo', () => {
      expect(
        service.isStaffOfTenant(
          { role: 'INQUILINO', tenantSlug: 'acme' },
          'acme',
        ),
      ).toBe(false);
      expect(
        service.isStaffOfTenant({ role: 'ADMIN', tenantSlug: 'otro' }, 'acme'),
      ).toBe(false);
      expect(service.isStaffOfTenant(undefined, 'acme')).toBe(false);
    });
  });

  // ─── submitContact ────────────────────────────────────────────────────────

  describe('submitContact', () => {
    const dto = {
      name: 'Juan Pérez',
      email: 'juan@mail.com',
      phone: '70000000',
      message: 'Me interesa la propiedad',
    };

    it('descarta el envío en silencio si el honeypot viene relleno', async () => {
      const result = await service.submitContact(
        'acme',
        { ...dto, website: 'http://spam.example' },
        '127.0.0.1',
      );
      expect(result.message).toBeDefined();
      // No debe tocar la base de datos (ni lookup ni INSERT).
      expect(mockDataSource.query).not.toHaveBeenCalled();
    });

    it('lanza NotFoundException si el tenant no existe', async () => {
      mockDataSource.query.mockResolvedValueOnce([]);

      await expect(
        service.submitContact('noexiste', dto, '127.0.0.1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('lanza BadRequestException si el sitio no está publicado', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([{ schema_name: SCHEMA }])
        .mockResolvedValueOnce([makeWebsite({ is_published: false })]);

      await expect(
        service.submitContact('acme', dto, '127.0.0.1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('inserta el contacto y retorna confirmación', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([{ schema_name: SCHEMA }])
        .mockResolvedValueOnce([makeWebsite({ is_published: true })])
        .mockResolvedValueOnce([{ id: 5 }]);

      const result = await service.submitContact('acme', dto, '127.0.0.1');
      expect(result.id).toBe(5);
      expect(result.message).toBeDefined();
    });
  });
});
