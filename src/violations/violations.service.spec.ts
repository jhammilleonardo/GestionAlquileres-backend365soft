import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { getDataSourceToken } from '@nestjs/typeorm';
import { ViolationsService } from './violations.service';
import { ViolationsPdfService } from './violations-pdf.service';
import { NotificationsService } from '../notifications/notifications.service';
import { StorageService } from '../common/storage/storage.service';
import { ViolationTypeEnum } from './enums/violation-type.enum';
import { ViolationStatusEnum } from './enums/violation-status.enum';
import {
  CreateViolationDto,
  UpdateViolationStatusDto,
  ViolationFiltersDto,
} from './dto';

const VIOLATION_ID = 1;
const USER_ID = 10;
const TENANT_ID = 5;

const mockViolationRow = {
  id: VIOLATION_ID,
  property_id: 1,
  unit_id: null,
  tenant_id: TENANT_ID,
  type: ViolationTypeEnum.NOISE,
  description: 'Música a alto volumen después de las 11pm',
  status: ViolationStatusEnum.OPEN,
  evidence_photos: [],
  created_at: new Date('2024-05-01'),
  resolved_at: null,
  resolved_notes: null,
  created_by: USER_ID,
  property_title: 'Edificio Central',
  tenant_name: 'Juan Pérez',
  tenant_email: 'juan@ejemplo.com',
  unit_number: '4B',
};

describe('ViolationsService', () => {
  let service: ViolationsService;
  let dataSource: { query: jest.Mock };
  let notificationsService: { createForUser: jest.Mock };
  let pdfService: { generateNotificationLetter: jest.Mock };

  beforeEach(async () => {
    dataSource = { query: jest.fn() };
    notificationsService = { createForUser: jest.fn().mockResolvedValue({}) };
    pdfService = {
      generateNotificationLetter: jest
        .fn()
        .mockResolvedValue('/tmp/violation_1.pdf'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ViolationsService,
        { provide: getDataSourceToken(), useValue: dataSource },
        { provide: NotificationsService, useValue: notificationsService },
        { provide: ViolationsPdfService, useValue: pdfService },
        {
          provide: StorageService,
          useValue: {
            buildStoragePath: (...s: string[]) => s.join('/'),
            persistUploadedFile: jest.fn().mockResolvedValue('path'),
            toRoutePath: (p: string) => `/${p}`,
          },
        },
      ],
    }).compile();

    service = module.get<ViolationsService>(ViolationsService);
  });

  // ─── create ───────────────────────────────────────────────────────────────

  describe('create', () => {
    it('debe registrar una violación y retornar el registro enriquecido', async () => {
      const dto: CreateViolationDto = {
        property_id: 1,
        tenant_id: TENANT_ID,
        type: ViolationTypeEnum.NOISE,
        description: 'Música a alto volumen después de las 11pm',
      };

      dataSource.query
        .mockResolvedValueOnce([{ id: VIOLATION_ID }]) // INSERT
        .mockResolvedValueOnce([mockViolationRow]); // findOne SELECT

      const result = await service.create(dto, USER_ID);

      expect(result.id).toBe(VIOLATION_ID);
      expect(result.property_title).toBe('Edificio Central');
      expect(dataSource.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO violations'),
        expect.arrayContaining([1, null, TENANT_ID, ViolationTypeEnum.NOISE]),
      );
    });
  });

  // ─── findAll ──────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('debe retornar lista paginada de violaciones', async () => {
      const filters: ViolationFiltersDto = {
        property_id: 1,
        page: 1,
        limit: 20,
      };

      dataSource.query
        .mockResolvedValueOnce([{ count: '2' }])
        .mockResolvedValueOnce([
          mockViolationRow,
          { ...mockViolationRow, id: 2 },
        ]);

      const result = await service.findAll(filters);

      expect(result.total).toBe(2);
      expect(result.data).toHaveLength(2);
    });

    it('debe filtrar por estado', async () => {
      const filters: ViolationFiltersDto = { status: ViolationStatusEnum.OPEN };

      dataSource.query
        .mockResolvedValueOnce([{ count: '1' }])
        .mockResolvedValueOnce([mockViolationRow]);

      await service.findAll(filters);

      expect(dataSource.query).toHaveBeenCalledWith(
        expect.stringContaining('v.status = $'),
        expect.arrayContaining([ViolationStatusEnum.OPEN]),
      );
    });

    it('debe filtrar por tipo', async () => {
      const filters: ViolationFiltersDto = { type: ViolationTypeEnum.DAMAGE };

      dataSource.query
        .mockResolvedValueOnce([{ count: '0' }])
        .mockResolvedValueOnce([]);

      await service.findAll(filters);

      expect(dataSource.query).toHaveBeenCalledWith(
        expect.stringContaining('v.type = $'),
        expect.arrayContaining([ViolationTypeEnum.DAMAGE]),
      );
    });

    it('debe filtrar por inquilino', async () => {
      const filters: ViolationFiltersDto = { tenant_id: TENANT_ID };

      dataSource.query
        .mockResolvedValueOnce([{ count: '3' }])
        .mockResolvedValueOnce([mockViolationRow]);

      await service.findAll(filters);

      expect(dataSource.query).toHaveBeenCalledWith(
        expect.stringContaining('v.tenant_id = $'),
        expect.arrayContaining([TENANT_ID]),
      );
    });
  });

  // ─── findOne ──────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('debe retornar la violación si existe', async () => {
      dataSource.query.mockResolvedValueOnce([mockViolationRow]);

      const result = await service.findOne(VIOLATION_ID);

      expect(result.id).toBe(VIOLATION_ID);
      expect(result.tenant_name).toBe('Juan Pérez');
    });

    it('debe lanzar NotFoundException si no existe', async () => {
      dataSource.query.mockResolvedValueOnce([]);

      await expect(service.findOne(999)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── updateStatus ─────────────────────────────────────────────────────────

  describe('updateStatus', () => {
    it('debe actualizar el estado correctamente', async () => {
      const dto: UpdateViolationStatusDto = {
        status: ViolationStatusEnum.NOTIFIED,
      };
      const updated = {
        ...mockViolationRow,
        status: ViolationStatusEnum.NOTIFIED,
      };

      dataSource.query
        .mockResolvedValueOnce([mockViolationRow]) // findOne (validación)
        .mockResolvedValueOnce([]) // UPDATE
        .mockResolvedValueOnce([updated]); // findOne (resultado)

      const result = await service.updateStatus(VIOLATION_ID, dto, USER_ID);

      expect(result.status).toBe(ViolationStatusEnum.NOTIFIED);
      expect(dataSource.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE violations'),
        expect.arrayContaining([ViolationStatusEnum.NOTIFIED]),
      );
    });

    it('debe marcar resolved_at cuando el estado es resolved', async () => {
      const dto: UpdateViolationStatusDto = {
        status: ViolationStatusEnum.RESOLVED,
        resolved_notes: 'El inquilino corrigió la situación',
      };
      const updated = {
        ...mockViolationRow,
        status: ViolationStatusEnum.RESOLVED,
        resolved_at: new Date(),
      };

      dataSource.query
        .mockResolvedValueOnce([mockViolationRow])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([updated]);

      const result = await service.updateStatus(VIOLATION_ID, dto, USER_ID);

      expect(result.status).toBe(ViolationStatusEnum.RESOLVED);
      expect(dataSource.query).toHaveBeenCalledWith(
        expect.stringContaining('resolved_at    = NOW()'),
        expect.arrayContaining(['El inquilino corrigió la situación']),
      );
    });

    it('debe lanzar BadRequestException si se intenta reabrir una violación resuelta', async () => {
      const resolvedViolation = {
        ...mockViolationRow,
        status: ViolationStatusEnum.RESOLVED,
      };
      dataSource.query.mockResolvedValueOnce([resolvedViolation]);

      await expect(
        service.updateStatus(
          VIOLATION_ID,
          { status: ViolationStatusEnum.OPEN },
          USER_ID,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── notifyTenant ─────────────────────────────────────────────────────────

  describe('notifyTenant', () => {
    it('debe enviar notificación y cambiar estado a notified', async () => {
      dataSource.query
        .mockResolvedValueOnce([mockViolationRow]) // findOne
        .mockResolvedValueOnce([]); // UPDATE status → notified

      await service.notifyTenant(VIOLATION_ID);

      expect(notificationsService.createForUser).toHaveBeenCalledWith(
        TENANT_ID,
        expect.any(String),
        expect.stringContaining('infracción'),
        expect.stringContaining('Edificio Central'),
        expect.objectContaining({ violation_id: VIOLATION_ID }),
      );
      expect(dataSource.query).toHaveBeenCalledWith(
        expect.stringContaining("status = 'notified'"),
        [VIOLATION_ID],
      );
    });

    it('debe lanzar NotFoundException si la violación no existe', async () => {
      dataSource.query.mockResolvedValueOnce([]);

      await expect(service.notifyTenant(999)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('no debe cambiar estado si ya estaba notified', async () => {
      const notifiedViolation = {
        ...mockViolationRow,
        status: ViolationStatusEnum.NOTIFIED,
      };
      dataSource.query.mockResolvedValueOnce([notifiedViolation]);

      await service.notifyTenant(VIOLATION_ID);

      const updateCalls = dataSource.query.mock.calls.filter(([sql]) =>
        (sql as string).includes("status = 'notified'"),
      );
      expect(updateCalls).toHaveLength(0);
    });
  });

  // ─── getViolationCount ────────────────────────────────────────────────────

  describe('getViolationCount', () => {
    it('debe retornar el contador de violaciones del inquilino', async () => {
      dataSource.query.mockResolvedValueOnce([{ count: '4' }]);

      const count = await service.getViolationCount(TENANT_ID);

      expect(count).toBe(4);
      expect(dataSource.query).toHaveBeenCalledWith(
        expect.stringContaining('tenant_id = $1'),
        [TENANT_ID],
      );
    });

    it('debe retornar 0 si el inquilino no tiene violaciones', async () => {
      dataSource.query.mockResolvedValueOnce([{ count: '0' }]);

      const count = await service.getViolationCount(TENANT_ID);

      expect(count).toBe(0);
    });
  });

  // ─── getViolationHistory ──────────────────────────────────────────────────

  describe('getViolationHistory', () => {
    it('debe retornar historial de violaciones del inquilino para screening', async () => {
      dataSource.query.mockResolvedValueOnce([mockViolationRow]);

      const history = await service.getViolationHistory(TENANT_ID);

      expect(history).toHaveLength(1);
      expect(dataSource.query).toHaveBeenCalledWith(
        expect.stringContaining('tenant_id = $1'),
        [TENANT_ID],
      );
    });

    it('debe retornar lista vacía si no hay historial', async () => {
      dataSource.query.mockResolvedValueOnce([]);

      const history = await service.getViolationHistory(TENANT_ID);

      expect(history).toHaveLength(0);
    });
  });
});
