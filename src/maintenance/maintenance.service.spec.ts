import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { MaintenanceService } from './maintenance.service';
import { MaintenanceRequest } from './entities/maintenance-request.entity';
import { MaintenanceMessage } from './entities/maintenance-message.entity';
import { MaintenanceAttachment } from './entities/maintenance-attachment.entity';
import { Contract } from '../contracts/entities/contract.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { MaintenanceCreationService } from './maintenance-creation.service';
import { MaintenanceLookupService } from './maintenance-lookup.service';
import { MaintenanceMessagesService } from './maintenance-messages.service';
import { MaintenanceStageService } from './maintenance-stage.service';
import { MaintenanceStatsService } from './maintenance-stats.service';
import { MaintenanceUpdateService } from './maintenance-update.service';
import { MaintenanceVendorsService } from './maintenance-vendors.service';

const makeDataSource = (queryImpl?: jest.Mock): Partial<DataSource> => ({
  query: queryImpl ?? jest.fn(),
});

const makeModule = async (dataSourceQuery: jest.Mock) => {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      MaintenanceService,
      {
        provide: MaintenanceCreationService,
        useValue: { create: jest.fn() },
      },
      MaintenanceLookupService,
      MaintenanceStageService,
      {
        provide: MaintenanceMessagesService,
        useValue: { addMessage: jest.fn(), saveUploadedFiles: jest.fn() },
      },
      {
        provide: getRepositoryToken(MaintenanceRequest),
        useValue: { find: jest.fn(), findOne: jest.fn() },
      },
      {
        provide: getRepositoryToken(MaintenanceMessage),
        useValue: {},
      },
      {
        provide: getRepositoryToken(MaintenanceAttachment),
        useValue: {},
      },
      {
        provide: getRepositoryToken(Contract),
        useValue: {},
      },
      {
        provide: DataSource,
        useValue: makeDataSource(dataSourceQuery),
      },
      {
        provide: NotificationsService,
        useValue: { createForUser: jest.fn(), notifyAdmins: jest.fn() },
      },
      {
        provide: MaintenanceStatsService,
        useValue: { getAdminStats: jest.fn(), getTenantStats: jest.fn() },
      },
      {
        provide: MaintenanceUpdateService,
        useValue: { update: jest.fn() },
      },
      {
        provide: MaintenanceVendorsService,
        useValue: { assignVendor: jest.fn(), rateVendor: jest.fn() },
      },
    ],
  }).compile();

  return module.get<MaintenanceService>(MaintenanceService);
};

describe('MaintenanceService — Stage Pipeline', () => {
  // ─── isValidStageTransition ────────────────────────────────────────────────

  describe('isValidStageTransition', () => {
    let service: MaintenanceService;

    beforeEach(async () => {
      service = await makeModule(jest.fn());
    });

    it('debe permitir REPORTED → ASSIGNED', () => {
      expect(service.isValidStageTransition('REPORTED', 'ASSIGNED')).toBe(true);
    });

    it('debe permitir ASSIGNED → SCHEDULED', () => {
      expect(service.isValidStageTransition('ASSIGNED', 'SCHEDULED')).toBe(
        true,
      );
    });

    it('debe permitir SCHEDULED → IN_PROGRESS', () => {
      expect(service.isValidStageTransition('SCHEDULED', 'IN_PROGRESS')).toBe(
        true,
      );
    });

    it('debe permitir IN_PROGRESS → COMPLETED', () => {
      expect(service.isValidStageTransition('IN_PROGRESS', 'COMPLETED')).toBe(
        true,
      );
    });

    it('debe permitir COMPLETED → REPORTED_TO_OWNER', () => {
      expect(
        service.isValidStageTransition('COMPLETED', 'REPORTED_TO_OWNER'),
      ).toBe(true);
    });

    it('debe rechazar REPORTED → IN_PROGRESS (saltar etapas)', () => {
      expect(service.isValidStageTransition('REPORTED', 'IN_PROGRESS')).toBe(
        false,
      );
    });

    it('debe rechazar REPORTED → COMPLETED (saltar etapas)', () => {
      expect(service.isValidStageTransition('REPORTED', 'COMPLETED')).toBe(
        false,
      );
    });

    it('debe rechazar IN_PROGRESS → ASSIGNED (retroceder)', () => {
      expect(service.isValidStageTransition('IN_PROGRESS', 'ASSIGNED')).toBe(
        false,
      );
    });

    it('debe rechazar COMPLETED → SCHEDULED (retroceder)', () => {
      expect(service.isValidStageTransition('COMPLETED', 'SCHEDULED')).toBe(
        false,
      );
    });

    it('debe rechazar etapa desconocida', () => {
      expect(service.isValidStageTransition('UNKNOWN', 'ASSIGNED')).toBe(false);
    });

    it('debe rechazar REPORTED_TO_OWNER → cualquier etapa (estado final)', () => {
      expect(
        service.isValidStageTransition('REPORTED_TO_OWNER', 'COMPLETED'),
      ).toBe(false);
    });
  });

  // ─── isTechnicianAllowedTarget ─────────────────────────────────────────────

  describe('isTechnicianAllowedTarget', () => {
    let service: MaintenanceService;

    beforeEach(async () => {
      service = await makeModule(jest.fn());
    });

    it('debe permitir IN_PROGRESS', () => {
      expect(service.isTechnicianAllowedTarget('IN_PROGRESS')).toBe(true);
    });

    it('debe permitir COMPLETED', () => {
      expect(service.isTechnicianAllowedTarget('COMPLETED')).toBe(true);
    });

    it('debe rechazar ASSIGNED (no es etapa de técnico)', () => {
      expect(service.isTechnicianAllowedTarget('ASSIGNED')).toBe(false);
    });

    it('debe rechazar REPORTED (solo admin)', () => {
      expect(service.isTechnicianAllowedTarget('REPORTED')).toBe(false);
    });

    it('debe rechazar REPORTED_TO_OWNER (solo admin)', () => {
      expect(service.isTechnicianAllowedTarget('REPORTED_TO_OWNER')).toBe(
        false,
      );
    });
  });

  // ─── changeStage ──────────────────────────────────────────────────────────

  describe('changeStage', () => {
    it('debe lanzar BadRequestException para transición inválida', async () => {
      const query = jest.fn().mockResolvedValue([
        {
          id: 1,
          current_stage: 'REPORTED',
          ticket_number: 'MNT-2025-AAA',
          owner_authorized: false,
        },
      ]);
      const service = await makeModule(query);

      await expect(
        service.changeStage(1, 'COMPLETED', 99, 'notas'),
      ).rejects.toThrow(BadRequestException);
    });

    it('debe lanzar BadRequestException en Bolivia sin autorización del propietario', async () => {
      const query = jest
        .fn()
        // findOne → SELECT maintenance_requests
        .mockResolvedValueOnce([
          {
            id: 1,
            current_stage: 'SCHEDULED',
            ticket_number: 'T',
            owner_authorized: false,
            property: {},
            contract: {},
            tenant: {},
          },
        ])
        // messages
        .mockResolvedValueOnce([])
        // attachments
        .mockResolvedValueOnce([])
        // validateBoliviaAuthorization → tenant_config
        .mockResolvedValueOnce([{ country: 'BO' }]);

      const service = await makeModule(query);

      await expect(service.changeStage(1, 'IN_PROGRESS', 99)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('debe avanzar etapa correctamente cuando la transición es válida', async () => {
      const updatedRequest = {
        id: 1,
        current_stage: 'ASSIGNED',
        ticket_number: 'T',
        owner_authorized: false,
        property: {},
        contract: {},
        tenant: {},
      };
      const query = jest
        .fn()
        // findOne (primera llamada — request actual)
        .mockResolvedValueOnce([
          {
            id: 1,
            current_stage: 'REPORTED',
            ticket_number: 'T',
            owner_authorized: false,
            property: {},
            contract: {},
            tenant: {},
          },
        ])
        .mockResolvedValueOnce([]) // messages
        .mockResolvedValueOnce([]) // attachments
        // UPDATE maintenance_requests
        .mockResolvedValueOnce([])
        // INSERT maintenance_stage_history
        .mockResolvedValueOnce([])
        // findOne (segunda llamada — resultado final)
        .mockResolvedValueOnce([updatedRequest])
        .mockResolvedValueOnce([]) // messages
        .mockResolvedValueOnce([]); // attachments

      const service = await makeModule(query);

      const result = await service.changeStage(1, 'ASSIGNED', 42, 'asignado');
      expect(result).toEqual(updatedRequest);
    });

    it('debe notificar a admins cuando la etapa es COMPLETED', async () => {
      const query = jest
        .fn()
        // findOne inicial
        .mockResolvedValueOnce([
          {
            id: 1,
            current_stage: 'IN_PROGRESS',
            ticket_number: 'T',
            owner_authorized: false,
            property: {},
            contract: {},
            tenant: {},
          },
        ])
        .mockResolvedValueOnce([]) // messages
        .mockResolvedValueOnce([]) // attachments
        // UPDATE maintenance_requests
        .mockResolvedValueOnce([])
        // INSERT maintenance_stage_history
        .mockResolvedValueOnce([])
        // notifyCompletedStage → stage history photos
        .mockResolvedValueOnce([{ photos: [] }])
        // admins
        .mockResolvedValueOnce([{ id: 10 }])
        // findOne final
        .mockResolvedValueOnce([
          {
            id: 1,
            current_stage: 'COMPLETED',
            ticket_number: 'T',
            owner_authorized: false,
            property: {},
            contract: {},
            tenant: {},
          },
        ])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          MaintenanceService,
          {
            provide: MaintenanceCreationService,
            useValue: { create: jest.fn() },
          },
          MaintenanceLookupService,
          MaintenanceStageService,
          {
            provide: MaintenanceMessagesService,
            useValue: { addMessage: jest.fn(), saveUploadedFiles: jest.fn() },
          },
          {
            provide: getRepositoryToken(MaintenanceRequest),
            useValue: {},
          },
          {
            provide: getRepositoryToken(MaintenanceMessage),
            useValue: {},
          },
          {
            provide: getRepositoryToken(MaintenanceAttachment),
            useValue: {},
          },
          {
            provide: getRepositoryToken(Contract),
            useValue: {},
          },
          { provide: DataSource, useValue: { query } },
          {
            provide: NotificationsService,
            useValue: {
              createForUser: jest.fn().mockResolvedValue({}),
              notifyAdmins: jest.fn(),
            },
          },
          {
            provide: MaintenanceStatsService,
            useValue: { getAdminStats: jest.fn(), getTenantStats: jest.fn() },
          },
          {
            provide: MaintenanceUpdateService,
            useValue: { update: jest.fn() },
          },
          {
            provide: MaintenanceVendorsService,
            useValue: { assignVendor: jest.fn(), rateVendor: jest.fn() },
          },
        ],
      }).compile();

      const service = module.get<MaintenanceService>(MaintenanceService);
      const notifService =
        module.get<NotificationsService>(NotificationsService);

      await service.changeStage(1, 'COMPLETED', 99);
      expect(notifService.createForUser).toHaveBeenCalledWith(
        10,
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.objectContaining({ ticket_number: 'T' }),
      );
    });
  });

  // ─── changeStageAsTechnician ───────────────────────────────────────────────

  describe('changeStageAsTechnician', () => {
    it('debe lanzar BadRequestException si el técnico intenta avanzar a ASSIGNED', async () => {
      const service = await makeModule(jest.fn());

      await expect(
        service.changeStageAsTechnician(1, 'ASSIGNED', 99),
      ).rejects.toThrow(BadRequestException);
    });

    it('debe lanzar BadRequestException si el técnico intenta avanzar a REPORTED_TO_OWNER', async () => {
      const service = await makeModule(jest.fn());

      await expect(
        service.changeStageAsTechnician(1, 'REPORTED_TO_OWNER', 99),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── authorizeWork ─────────────────────────────────────────────────────────

  describe('authorizeWork', () => {
    it('debe establecer owner_authorized = true en la solicitud', async () => {
      const query = jest
        .fn()
        // findOne
        .mockResolvedValueOnce([
          {
            id: 5,
            current_stage: 'SCHEDULED',
            ticket_number: 'T',
            property: {},
            contract: {},
            tenant: {},
          },
        ])
        .mockResolvedValueOnce([]) // messages
        .mockResolvedValueOnce([]) // attachments
        // UPDATE owner_authorized
        .mockResolvedValueOnce([]);

      const service = await makeModule(query);

      await expect(service.authorizeWork(5, 1)).resolves.toBeUndefined();

      const updateCall = query.mock.calls.find(
        (c: unknown[]) =>
          typeof c[0] === 'string' && c[0].includes('owner_authorized'),
      );
      expect(updateCall).toBeDefined();
    });

    it('debe lanzar NotFoundException si la solicitud no existe', async () => {
      const query = jest.fn().mockResolvedValue([]);
      const service = await makeModule(query);

      await expect(service.authorizeWork(999, 1)).rejects.toThrow();
    });
  });
});
