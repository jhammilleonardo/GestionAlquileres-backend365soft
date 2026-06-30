import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { Logger } from '@nestjs/common';
import { AuditLogsService } from './audit-logs.service';
import { AuditAction } from './enums/audit-action.enum';
import { QueryAuditLogsDto } from './dto/query-audit-logs.dto';
import { tenantConnectionStore } from '../common/tenant/tenant-connection.store';

type QueryCall = [string, unknown[]];
function queryParams(mock: jest.Mock, callIndex: number): unknown[] {
  return (mock.mock.calls[callIndex] as QueryCall)[1];
}
function querySql(mock: jest.Mock, callIndex: number): string {
  return (mock.mock.calls[callIndex] as QueryCall)[0];
}

describe('AuditLogsService', () => {
  let service: AuditLogsService;
  let mockQuery: jest.Mock;
  let loggerErrorSpy: jest.SpyInstance;

  beforeEach(async () => {
    loggerErrorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    mockQuery = jest.fn();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditLogsService,
        {
          provide: getDataSourceToken(),
          useValue: { query: mockQuery },
        },
      ],
    }).compile();

    service = module.get(AuditLogsService);
  });

  afterEach(() => {
    loggerErrorSpy.mockRestore();
    jest.clearAllMocks();
  });

  describe('log()', () => {
    it('debe insertar en audit_logs con los parámetros correctos', async () => {
      mockQuery.mockResolvedValueOnce([]);

      await service.log({
        userId: 1,
        action: AuditAction.CREATED,
        entityType: 'contract',
        entityId: 42,
        newValues: { status: 'BORRADOR' },
        ipAddress: '127.0.0.1',
      });

      expect(mockQuery).toHaveBeenCalledTimes(1);
      const params = queryParams(mockQuery, 0);
      expect(params[0]).toBe(1);
      expect(params[1]).toBe(AuditAction.CREATED);
      expect(params[2]).toBe('contract');
      expect(params[3]).toBe(42);
      expect(params[4]).toBeNull(); // old_values
      expect(params[5]).toBe(JSON.stringify({ status: 'BORRADOR' }));
      expect(params[6]).toBe('127.0.0.1');
    });

    it('debe incluir old_values como JSON cuando se proporciona', async () => {
      mockQuery.mockResolvedValueOnce([]);

      await service.log({
        userId: 2,
        action: AuditAction.STATUS_CHANGED,
        entityType: 'contract',
        entityId: 5,
        oldValues: { status: 'ACTIVO' },
        newValues: { status: 'FINALIZADO' },
      });

      const params = queryParams(mockQuery, 0);
      expect(params[4]).toBe(JSON.stringify({ status: 'ACTIVO' }));
      expect(params[5]).toBe(JSON.stringify({ status: 'FINALIZADO' }));
    });

    it('no debe propagar errores — falla silenciosamente con log', async () => {
      mockQuery.mockRejectedValueOnce(new Error('DB error'));

      await expect(
        service.log({
          userId: 1,
          action: AuditAction.CREATED,
          entityType: 'contract',
          entityId: 1,
        }),
      ).resolves.toBeUndefined();
    });

    it('debe guardar user_agent cuando se proporciona', async () => {
      mockQuery.mockResolvedValueOnce([]);

      await service.log({
        userId: 3,
        action: AuditAction.APPROVED,
        entityType: 'payment',
        entityId: 10,
        userAgent: 'Mozilla/5.0',
      });

      const params = queryParams(mockQuery, 0);
      expect(params[7]).toBe('Mozilla/5.0');
    });

    it('debe resolver autor, ip y user-agent del contexto de request cuando se omiten', async () => {
      mockQuery.mockResolvedValueOnce([]);
      jest.spyOn(tenantConnectionStore, 'getStore').mockReturnValue({
        queryRunner: null,
        schemaName: 'tenant_acme',
        actor: { userId: 99, ip: '10.0.0.5', userAgent: 'Edge/120' },
      });

      await service.log({
        action: AuditAction.UPDATED,
        entityType: 'property',
        entityId: 7,
      });

      const params = queryParams(mockQuery, 0);
      expect(params[0]).toBe(99); // user_id desde el actor
      expect(params[6]).toBe('10.0.0.5'); // ip_address desde el actor
      expect(params[7]).toBe('Edge/120'); // user_agent desde el actor
    });

    it('debe priorizar los params explícitos sobre el contexto de request', async () => {
      mockQuery.mockResolvedValueOnce([]);
      jest.spyOn(tenantConnectionStore, 'getStore').mockReturnValue({
        queryRunner: null,
        schemaName: 'tenant_acme',
        actor: { userId: 99, ip: '10.0.0.5', userAgent: 'Edge/120' },
      });

      await service.log({
        userId: 1,
        action: AuditAction.LOGGED_IN,
        entityType: 'auth',
        entityId: 1,
        ipAddress: '203.0.113.9',
      });

      const params = queryParams(mockQuery, 0);
      expect(params[0]).toBe(1);
      expect(params[6]).toBe('203.0.113.9');
    });

    it('no debe insertar cuando no hay autor resoluble', async () => {
      jest.spyOn(tenantConnectionStore, 'getStore').mockReturnValue({
        queryRunner: null,
        schemaName: 'tenant_acme',
        actor: null,
      });

      await service.log({
        action: AuditAction.UPDATED,
        entityType: 'property',
        entityId: 7,
      });

      expect(mockQuery).not.toHaveBeenCalled();
    });
  });

  describe('findAll()', () => {
    it('debe retornar datos paginados con total', async () => {
      const fakeLogs = [
        { id: 1, action: AuditAction.CREATED, entity_type: 'contract' },
      ];
      mockQuery
        .mockResolvedValueOnce([{ total: '1' }])
        .mockResolvedValueOnce(fakeLogs);

      const result = await service.findAll({} as QueryAuditLogsDto);

      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
      expect(result.data).toEqual(fakeLogs);
    });

    it('debe filtrar por entity_type cuando se proporciona', async () => {
      mockQuery
        .mockResolvedValueOnce([{ total: '0' }])
        .mockResolvedValueOnce([]);

      await service.findAll({ entity_type: 'payment' } as QueryAuditLogsDto);

      const countSql = querySql(mockQuery, 0);
      expect(countSql).toContain('entity_type = $');
      const countParams = queryParams(mockQuery, 0);
      expect(countParams).toContain('payment');
    });

    it('debe filtrar por action cuando se proporciona', async () => {
      mockQuery
        .mockResolvedValueOnce([{ total: '0' }])
        .mockResolvedValueOnce([]);

      await service.findAll({
        action: AuditAction.APPROVED,
      } as QueryAuditLogsDto);

      const countSql = querySql(mockQuery, 0);
      expect(countSql).toContain('action = $');
    });

    it('debe filtrar por rango de fechas from/to', async () => {
      mockQuery
        .mockResolvedValueOnce([{ total: '0' }])
        .mockResolvedValueOnce([]);

      await service.findAll({
        from: '2024-01-01',
        to: '2024-12-31',
      } as QueryAuditLogsDto);

      const countSql = querySql(mockQuery, 0);
      expect(countSql).toContain('timestamp >=');
      expect(countSql).toContain('timestamp <=');
    });

    it('debe aplicar paginación correcta con page=2 y limit=5', async () => {
      mockQuery
        .mockResolvedValueOnce([{ total: '10' }])
        .mockResolvedValueOnce([]);

      const result = await service.findAll({
        page: '2',
        limit: '5',
      } as QueryAuditLogsDto);

      expect(result.page).toBe(2);
      expect(result.limit).toBe(5);
      const dataSql = querySql(mockQuery, 1);
      expect(dataSql).toContain('LIMIT');
      expect(dataSql).toContain('OFFSET');
    });

    it('debe limitar el máximo de results a 100', async () => {
      mockQuery
        .mockResolvedValueOnce([{ total: '0' }])
        .mockResolvedValueOnce([]);

      const result = await service.findAll({
        limit: '999',
      } as QueryAuditLogsDto);

      expect(result.limit).toBe(100);
    });

    it('debe filtrar por user_id cuando se proporciona', async () => {
      mockQuery
        .mockResolvedValueOnce([{ total: '0' }])
        .mockResolvedValueOnce([]);

      await service.findAll({ user_id: '7' } as QueryAuditLogsDto);

      const countSql = querySql(mockQuery, 0);
      expect(countSql).toContain('user_id = $');
      const countParams = queryParams(mockQuery, 0);
      expect(countParams).toContain(7);
    });

    it('debe resolver etiqueta legible para las nuevas entidades', async () => {
      mockQuery
        .mockResolvedValueOnce([{ total: '0' }])
        .mockResolvedValueOnce([]);

      await service.findAll({ entity_type: 'property' } as QueryAuditLogsDto);

      const dataSql = querySql(mockQuery, 1);
      expect(dataSql).toContain("WHEN 'property'");
      expect(dataSql).toContain("WHEN 'vendor'");
      expect(dataSql).toContain("WHEN 'auth'");
      expect(dataSql).toContain("WHEN 'expense'");
    });
  });

  describe('exportCsv()', () => {
    it('debe generar CSV con encabezados y filas escapadas', async () => {
      mockQuery.mockResolvedValueOnce([
        {
          timestamp: new Date('2026-01-02T03:04:05.000Z'),
          user_name: 'Ana, "la jefa"',
          user_email: 'ana@acme.com',
          user_role: 'ADMIN',
          action: 'created',
          entity_type: 'property',
          entity_id: 7,
          entity_label: 'Casa Central',
          ip_address: '10.0.0.5',
          user_agent: 'Edge/120',
        },
      ]);

      const csv = await service.exportCsv({} as QueryAuditLogsDto);
      const lines = csv.split('\r\n');

      expect(lines[0]).toContain('timestamp,user_name');
      // Comillas internas escapadas como dobles comillas.
      expect(lines[1]).toContain('"Ana, ""la jefa"""');
      expect(lines[1]).toContain('"10.0.0.5"');
      // Aplica LIMIT de exportación (sin paginar).
      const dataSql = querySql(mockQuery, 0);
      expect(dataSql).toContain('LIMIT');
      expect(dataSql).not.toContain('OFFSET');
    });
  });
});
