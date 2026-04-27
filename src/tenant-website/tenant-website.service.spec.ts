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
      const insertSql: string = mockDataSource.query.mock.calls[1][0] as string;
      expect(insertSql).toContain('INSERT INTO');
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

      const result = await service.update(SCHEMA, { contact_email: 'info@acme.com' });
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

  // ─── togglePublish ────────────────────────────────────────────────────────

  describe('togglePublish', () => {
    it('invierte el estado is_published', async () => {
      const website = makeWebsite({ is_published: false });
      const toggled = makeWebsite({ is_published: true });

      mockDataSource.query
        .mockResolvedValueOnce([website]) // getOrCreate
        .mockResolvedValueOnce([toggled]); // UPDATE NOT is_published

      const result = await service.togglePublish(SCHEMA);
      expect(result.is_published).toBe(true);

      const sql: string = mockDataSource.query.mock.calls[1][0] as string;
      expect(sql).toContain('NOT is_published');
    });
  });

  // ─── getPublicWebsite ─────────────────────────────────────────────────────

  describe('getPublicWebsite', () => {
    it('lanza NotFoundException si el tenant no existe', async () => {
      mockDataSource.query.mockResolvedValueOnce([]);

      await expect(service.getPublicWebsite('noexiste')).rejects.toThrow(NotFoundException);
    });

    it('lanza NotFoundException si el sitio no está publicado', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([{ schema_name: SCHEMA }]) // tenant lookup
        .mockResolvedValueOnce([makeWebsite({ is_published: false })]); // website

      await expect(service.getPublicWebsite('acme')).rejects.toThrow(NotFoundException);
    });

    it('retorna website + propiedades disponibles cuando está publicado', async () => {
      const website = makeWebsite({ is_published: true });
      const properties = [{ id: 1, title: 'Casa grande', status: 'DISPONIBLE' }];

      mockDataSource.query
        .mockResolvedValueOnce([{ schema_name: SCHEMA }])
        .mockResolvedValueOnce([website])
        .mockResolvedValueOnce(properties);

      const result = await service.getPublicWebsite('acme');
      expect(result.is_published).toBe(true);
      expect(result.properties).toHaveLength(1);
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

    it('lanza NotFoundException si el tenant no existe', async () => {
      mockDataSource.query.mockResolvedValueOnce([]);

      await expect(service.submitContact('noexiste', dto, '127.0.0.1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('lanza BadRequestException si el sitio no está publicado', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([{ schema_name: SCHEMA }])
        .mockResolvedValueOnce([makeWebsite({ is_published: false })]);

      await expect(service.submitContact('acme', dto, '127.0.0.1')).rejects.toThrow(
        BadRequestException,
      );
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
