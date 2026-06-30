import { Test, TestingModule } from '@nestjs/testing';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { getDataSourceToken } from '@nestjs/typeorm';
import { ViolationsService } from './violations.service';
import { ViolationsPdfService } from './violations-pdf.service';
import { NotificationsService } from '../notifications/notifications.service';
import { StorageService } from '../common/storage/storage.service';
import { ViolationTypeEnum } from './enums/violation-type.enum';
import { ViolationStatusEnum } from './enums/violation-status.enum';
import { ViolationSeverityEnum } from './enums/violation-severity.enum';
import { ViolationFineStatusEnum } from './enums/violation-fine-status.enum';
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
  severity: ViolationSeverityEnum.MEDIUM,
  description: 'Música a alto volumen después de las 11pm',
  status: ViolationStatusEnum.OPEN,
  due_date: null,
  evidence_photos: [],
  fine_amount: null,
  fine_currency: null,
  fine_status: ViolationFineStatusEnum.NONE,
  fine_paid_at: null,
  notice_sent_at: null,
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
    dataSource = { query: jest.fn().mockResolvedValue([]) };
    notificationsService = { createForUser: jest.fn().mockResolvedValue({}) };
    pdfService = {
      generateNotificationLetter: jest
        .fn()
        .mockResolvedValue('/tmp/violation_1.pdf'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ViolationsService,
        { provide: AuditLogsService, useValue: { log: jest.fn() } },
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
        .mockResolvedValueOnce([]) // logEvent CREATED
        .mockResolvedValueOnce([mockViolationRow]); // findOne SELECT

      const result = await service.create(dto, USER_ID);

      expect(result.id).toBe(VIOLATION_ID);
      expect(result.property_title).toBe('Edificio Central');
      expect(dataSource.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO violations'),
        expect.arrayContaining([1, null, TENANT_ID, ViolationTypeEnum.NOISE]),
      );
    });

    it('debe registrar el evento de multa cuando se crea con fine_amount', async () => {
      const dto: CreateViolationDto = {
        property_id: 1,
        tenant_id: TENANT_ID,
        type: ViolationTypeEnum.DAMAGE,
        description: 'Daño a la pared',
        fine_amount: 150,
      };

      dataSource.query
        .mockResolvedValueOnce([{ currency: 'BOB' }]) // resolveCurrency
        .mockResolvedValueOnce([{ id: VIOLATION_ID }]) // INSERT
        .mockResolvedValueOnce([]) // logEvent CREATED
        .mockResolvedValueOnce([]) // logEvent FINE_CHARGED
        .mockResolvedValueOnce([
          { ...mockViolationRow, fine_amount: 150, fine_currency: 'BOB' },
        ]); // findOne

      const result = await service.create(dto, USER_ID);

      expect(result.fine_amount).toBe(150);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const fineEvent = dataSource.query.mock.calls.find(
        ([sql, params]) =>
          (sql as string).includes('INSERT INTO violation_events') &&
          Array.isArray(params) &&
          params.includes('fine_charged'),
      );
      expect(fineEvent).toBeDefined();
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

    it('debe filtrar por severidad', async () => {
      const filters: ViolationFiltersDto = {
        severity: ViolationSeverityEnum.HIGH,
      };

      dataSource.query
        .mockResolvedValueOnce([{ count: '1' }])
        .mockResolvedValueOnce([mockViolationRow]);

      await service.findAll(filters);

      expect(dataSource.query).toHaveBeenCalledWith(
        expect.stringContaining('v.severity = $'),
        expect.arrayContaining([ViolationSeverityEnum.HIGH]),
      );
    });

    it('debe filtrar solo vencidas cuando overdue=true', async () => {
      const filters: ViolationFiltersDto = { overdue: 'true' };

      dataSource.query
        .mockResolvedValueOnce([{ count: '1' }])
        .mockResolvedValueOnce([mockViolationRow]);

      await service.findAll(filters);

      expect(dataSource.query).toHaveBeenCalledWith(
        expect.stringContaining('v.due_date < CURRENT_DATE'),
        expect.any(Array),
      );
    });
  });

  // ─── findOne / findDetail ───────────────────────────────────────────────────

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

  describe('findDetail', () => {
    it('debe retornar la violación con su línea de tiempo', async () => {
      const events = [
        {
          id: 1,
          event_type: 'created',
          note: null,
          metadata: {},
          created_by: USER_ID,
          created_by_name: 'Admin',
          created_at: new Date(),
        },
      ];
      dataSource.query
        .mockResolvedValueOnce([mockViolationRow]) // findOne
        .mockResolvedValueOnce(events); // getEvents

      const result = await service.findDetail(VIOLATION_ID);

      expect(result.id).toBe(VIOLATION_ID);
      expect(result.events).toHaveLength(1);
      expect(result.events[0].event_type).toBe('created');
    });
  });

  // ─── updateStatus ─────────────────────────────────────────────────────────

  describe('updateStatus', () => {
    it('debe actualizar el estado y registrar el evento', async () => {
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
        .mockResolvedValueOnce([]) // logEvent STATUS_CHANGED
        .mockResolvedValueOnce([updated]); // findOne (resultado)

      const result = await service.updateStatus(VIOLATION_ID, dto, USER_ID);

      expect(result.status).toBe(ViolationStatusEnum.NOTIFIED);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const statusEvent = dataSource.query.mock.calls.find(
        ([sql, params]) =>
          (sql as string).includes('INSERT INTO violation_events') &&
          Array.isArray(params) &&
          params.includes('status_changed'),
      );
      expect(statusEvent).toBeDefined();
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
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([updated]);

      const result = await service.updateStatus(VIOLATION_ID, dto, USER_ID);

      expect(result.status).toBe(ViolationStatusEnum.RESOLVED);
      expect(dataSource.query).toHaveBeenCalledWith(
        expect.stringContaining('resolved_at    = NOW()'),
        expect.arrayContaining(['El inquilino corrigió la situación']),
      );
    });

    it('debe lanzar BadRequestException si se intenta reabrir una violación cerrada', async () => {
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

  // ─── fines ──────────────────────────────────────────────────────────────────

  describe('chargeFine', () => {
    it('debe aplicar la multa y notificar al inquilino', async () => {
      dataSource.query
        .mockResolvedValueOnce([mockViolationRow]) // findOne
        .mockResolvedValueOnce([{ currency: 'BOB' }]) // resolveCurrency
        .mockResolvedValueOnce([]) // UPDATE
        .mockResolvedValueOnce([]) // logEvent FINE_CHARGED
        .mockResolvedValueOnce([
          {
            ...mockViolationRow,
            fine_amount: 200,
            fine_status: ViolationFineStatusEnum.CHARGED,
          },
        ]); // findOne

      const result = await service.chargeFine(
        VIOLATION_ID,
        { amount: 200 },
        USER_ID,
      );

      expect(result.fine_status).toBe(ViolationFineStatusEnum.CHARGED);
      expect(notificationsService.createForUser).toHaveBeenCalled();
    });

    it('debe rechazar si la multa ya fue pagada', async () => {
      dataSource.query.mockResolvedValueOnce([
        { ...mockViolationRow, fine_status: ViolationFineStatusEnum.PAID },
      ]);

      await expect(
        service.chargeFine(VIOLATION_ID, { amount: 50 }, USER_ID),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('waiveFine', () => {
    it('debe condonar una multa pendiente', async () => {
      dataSource.query
        .mockResolvedValueOnce([
          { ...mockViolationRow, fine_status: ViolationFineStatusEnum.CHARGED },
        ]) // findOne
        .mockResolvedValueOnce([]) // UPDATE
        .mockResolvedValueOnce([]) // logEvent
        .mockResolvedValueOnce([
          { ...mockViolationRow, fine_status: ViolationFineStatusEnum.WAIVED },
        ]);

      const result = await service.waiveFine(VIOLATION_ID, USER_ID);

      expect(result.fine_status).toBe(ViolationFineStatusEnum.WAIVED);
    });

    it('debe rechazar si no hay multa pendiente', async () => {
      dataSource.query.mockResolvedValueOnce([mockViolationRow]);

      await expect(service.waiveFine(VIOLATION_ID, USER_ID)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('payFine', () => {
    it('debe marcar la multa como pagada', async () => {
      dataSource.query
        .mockResolvedValueOnce([
          { ...mockViolationRow, fine_status: ViolationFineStatusEnum.CHARGED },
        ]) // findOne
        .mockResolvedValueOnce([]) // UPDATE
        .mockResolvedValueOnce([]) // logEvent
        .mockResolvedValueOnce([
          {
            ...mockViolationRow,
            fine_status: ViolationFineStatusEnum.PAID,
            fine_paid_at: new Date(),
          },
        ]);

      const result = await service.payFine(VIOLATION_ID, USER_ID);

      expect(result.fine_status).toBe(ViolationFineStatusEnum.PAID);
      expect(dataSource.query).toHaveBeenCalledWith(
        expect.stringContaining("fine_status = 'paid'"),
        [VIOLATION_ID],
      );
    });
  });

  // ─── addNote ────────────────────────────────────────────────────────────────

  describe('addNote', () => {
    it('debe agregar una nota y devolver la línea de tiempo', async () => {
      dataSource.query
        .mockResolvedValueOnce([mockViolationRow]) // findOne
        .mockResolvedValueOnce([]) // logEvent NOTE
        .mockResolvedValueOnce([
          {
            id: 1,
            event_type: 'note',
            note: 'Llamé al inquilino',
            metadata: {},
            created_by: USER_ID,
            created_by_name: 'Admin',
            created_at: new Date(),
          },
        ]); // getEvents

      const events = await service.addNote(
        VIOLATION_ID,
        { note: 'Llamé al inquilino' },
        USER_ID,
      );

      expect(events).toHaveLength(1);
      expect(events[0].note).toBe('Llamé al inquilino');
    });
  });

  // ─── getStats ─────────────────────────────────────────────────────────────

  describe('getStats', () => {
    it('debe retornar métricas resumen', async () => {
      dataSource.query.mockResolvedValueOnce([
        {
          total: 12,
          open: 4,
          overdue: 2,
          escalated: 1,
          fines_outstanding: '450.00',
        },
      ]);

      const stats = await service.getStats();

      expect(stats.total).toBe(12);
      expect(stats.overdue).toBe(2);
      expect(stats.fines_outstanding).toBe(450);
    });
  });

  // ─── notifyTenant ─────────────────────────────────────────────────────────

  describe('notifyTenant', () => {
    it('debe enviar notificación, fijar notice_sent_at y pasar a notified', async () => {
      dataSource.query
        .mockResolvedValueOnce([mockViolationRow]) // findOne
        .mockResolvedValueOnce([]) // UPDATE status/notice_sent_at
        .mockResolvedValueOnce([]); // logEvent NOTIFIED

      await service.notifyTenant(VIOLATION_ID, USER_ID);

      expect(notificationsService.createForUser).toHaveBeenCalledWith(
        TENANT_ID,
        expect.any(String),
        expect.stringContaining('infracción'),
        expect.stringContaining('Edificio Central'),
        expect.objectContaining({ violation_id: VIOLATION_ID }),
      );
      expect(dataSource.query).toHaveBeenCalledWith(
        expect.stringContaining('notice_sent_at = NOW()'),
        [ViolationStatusEnum.NOTIFIED, VIOLATION_ID],
      );
    });

    it('debe lanzar NotFoundException si la violación no existe', async () => {
      dataSource.query.mockResolvedValueOnce([]);

      await expect(service.notifyTenant(999)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('mantiene el estado si ya estaba notificada', async () => {
      const notifiedViolation = {
        ...mockViolationRow,
        status: ViolationStatusEnum.NOTIFIED,
      };
      dataSource.query.mockResolvedValueOnce([notifiedViolation]);

      await service.notifyTenant(VIOLATION_ID, USER_ID);

      expect(dataSource.query).toHaveBeenCalledWith(
        expect.stringContaining('notice_sent_at = NOW()'),
        [ViolationStatusEnum.NOTIFIED, VIOLATION_ID],
      );
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
