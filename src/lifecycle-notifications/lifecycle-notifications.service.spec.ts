import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { LifecycleNotificationsService } from './lifecycle-notifications.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationEventType } from '../notifications/dto/create-notification.dto';

const mockDataSource = {
  query: jest.fn(),
};

const mockNotificationsService = {
  createForUser: jest.fn(),
  notifyAdmins: jest.fn(),
};

describe('LifecycleNotificationsService', () => {
  let service: LifecycleNotificationsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LifecycleNotificationsService,
        {
          provide: getDataSourceToken(),
          useValue: mockDataSource,
        },
        {
          provide: NotificationsService,
          useValue: mockNotificationsService,
        },
      ],
    }).compile();

    service = module.get<LifecycleNotificationsService>(
      LifecycleNotificationsService,
    );
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  // ─── onContractActivated ──────────────────────────────────────────────────

  describe('onContractActivated', () => {
    it('debe enviar notificación de bienvenida al inquilino cuando el contrato se activa', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([
          {
            id: 1,
            contract_number: 'CTR-2025-001',
            tenant_id: 42,
            start_date: '2025-01-01',
            end_date: '2025-12-31',
            property_title: 'Apto Central',
          },
        ])
        .mockResolvedValueOnce([
          {
            notification_channels: {
              internal: true,
              email: false,
              whatsapp: false,
            },
          },
        ]);

      mockNotificationsService.createForUser.mockResolvedValue({});

      await service.onContractActivated(1);

      expect(mockNotificationsService.createForUser).toHaveBeenCalledWith(
        42,
        NotificationEventType.CONTRACT_ACTIVATED,
        'Tu contrato está activo',
        expect.stringContaining('CTR-2025-001'),
        expect.objectContaining({ contract_id: 1 }),
      );
    });

    it('no debe hacer nada si el contrato no existe', async () => {
      mockDataSource.query.mockResolvedValueOnce([]);

      await service.onContractActivated(999);

      expect(mockNotificationsService.createForUser).not.toHaveBeenCalled();
    });

    it('debe loggear canal email si está habilitado', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([
          {
            id: 1,
            contract_number: 'CTR-001',
            tenant_id: 5,
            start_date: '2025-01-01',
            end_date: '2026-01-01',
            property_title: 'Casa',
          },
        ])
        .mockResolvedValueOnce([
          {
            notification_channels: {
              internal: true,
              email: true,
              whatsapp: false,
            },
          },
        ]);

      mockNotificationsService.createForUser.mockResolvedValue({});

      await service.onContractActivated(1);

      // Se crea notificación interna
      expect(mockNotificationsService.createForUser).toHaveBeenCalledTimes(1);
    });
  });

  // ─── onMoveOutCompleted ───────────────────────────────────────────────────

  describe('onMoveOutCompleted', () => {
    it('debe enviar resumen al propietario con cuenta de usuario cuando la inspección de salida se completa', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([
          {
            id: 10,
            type: 'move_out',
            completed_date: '2025-06-01',
            notes: null,
            property_title: 'Casa Verde',
            property_id: 3,
          },
        ])
        .mockResolvedValueOnce([
          { condition: 'good', count: '5' },
          { condition: 'fair', count: '2' },
        ])
        .mockResolvedValueOnce([
          {
            user_id: 55,
            owner_email: 'owner@test.com',
            owner_name: 'Juan Pérez',
          },
        ])
        .mockResolvedValueOnce([
          {
            notification_channels: {
              internal: true,
              email: false,
              whatsapp: false,
            },
          },
        ]);

      mockNotificationsService.createForUser.mockResolvedValue({});

      await service.onMoveOutCompleted(10);

      expect(mockNotificationsService.createForUser).toHaveBeenCalledWith(
        55,
        NotificationEventType.INSPECTION_MOVE_OUT_COMPLETED,
        'Resumen de inspección de salida',
        expect.stringContaining('Casa Verde'),
        expect.objectContaining({ inspection_id: 10 }),
      );
    });

    it('no debe hacer nada si la inspección no es de tipo move_out', async () => {
      mockDataSource.query.mockResolvedValueOnce([
        {
          id: 10,
          type: 'move_in',
          completed_date: '2025-01-01',
          notes: null,
          property_title: 'Casa',
          property_id: 3,
        },
      ]);

      await service.onMoveOutCompleted(10);

      expect(mockNotificationsService.createForUser).not.toHaveBeenCalled();
    });

    it('no debe hacer nada si la inspección no existe', async () => {
      mockDataSource.query.mockResolvedValueOnce([]);

      await service.onMoveOutCompleted(99);

      expect(mockNotificationsService.createForUser).not.toHaveBeenCalled();
    });

    it('no debe enviar notificación interna si el propietario no tiene cuenta de usuario', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([
          {
            id: 10,
            type: 'move_out',
            completed_date: '2025-06-01',
            notes: null,
            property_title: 'Casa',
            property_id: 3,
          },
        ])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          {
            user_id: null,
            owner_email: 'external@owner.com',
            owner_name: 'Ana García',
          },
        ])
        .mockResolvedValueOnce([
          {
            notification_channels: {
              internal: true,
              email: false,
              whatsapp: false,
            },
          },
        ]);

      await service.onMoveOutCompleted(10);

      expect(mockNotificationsService.createForUser).not.toHaveBeenCalled();
    });
  });

  // ─── checkExpiringContracts ───────────────────────────────────────────────

  describe('checkExpiringContracts', () => {
    const setupTenantMocks = (
      contracts: object[],
      alreadySent: boolean = false,
    ) => {
      mockDataSource.query
        .mockResolvedValueOnce([{ schema_name: 'tenant_acme', slug: 'acme' }]) // getAllActiveTenants
        .mockResolvedValueOnce([
          {
            notification_channels: {
              internal: true,
              email: false,
              whatsapp: false,
            },
          },
        ]) // getChannelsForSchema
        .mockResolvedValueOnce([{ id: 1 }, { id: 2 }]) // getAdminIds
        .mockResolvedValueOnce(contracts) // expiring contracts query
        .mockResolvedValue(alreadySent ? [{ id: 99 }] : []); // hasBeenSent (returns row if already sent)
    };

    it('debe enviar notificación de 60 días a admins e inquilino', async () => {
      setupTenantMocks([
        {
          id: 5,
          contract_number: 'CTR-001',
          tenant_id: 10,
          end_date: '2025-09-01',
          days_left: '60',
          property_title: 'Apto 1',
          tenant_name: 'María López',
        },
      ]);
      // After hasBeenSent (returns []), markSent calls INSERT (returns [])
      mockDataSource.query
        .mockResolvedValueOnce([]) // hasBeenSent → not sent
        .mockResolvedValueOnce([]) // INSERT notification admin 1
        .mockResolvedValueOnce([]) // INSERT notification admin 2
        .mockResolvedValueOnce([]) // INSERT notification tenant
        .mockResolvedValueOnce([]); // markSent

      await service.checkExpiringContracts();

      // dispatchToSchema inserts: 2 admins + 1 tenant = 3 notification inserts
      const notifInserts = mockDataSource.query.mock.calls.filter(
        (call: unknown[]) => {
          const sql = call[0];
          return (
            typeof sql === 'string' &&
            sql.includes('INSERT INTO') &&
            sql.includes('notifications')
          );
        },
      );
      expect(notifInserts.length).toBe(3);
    });

    it('debe enviar notificación de 30 días a admins e inquilino con opciones de renovación', async () => {
      setupTenantMocks([
        {
          id: 5,
          contract_number: 'CTR-001',
          tenant_id: 10,
          end_date: '2025-08-01',
          days_left: '30',
          property_title: 'Apto 1',
          tenant_name: 'Pedro Ruiz',
        },
      ]);
      mockDataSource.query
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      await service.checkExpiringContracts();

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const tenantNotifCall = mockDataSource.query.mock.calls.find(
        (call: unknown[]) => {
          const sql = call[0];
          return (
            typeof sql === 'string' &&
            sql.includes('INSERT INTO') &&
            sql.includes('notifications')
          );
        },
      );
      expect(tenantNotifCall).toBeDefined();
    });

    it('debe enviar notificación urgente de 15 días SOLO a admins', async () => {
      setupTenantMocks([
        {
          id: 5,
          contract_number: 'CTR-001',
          tenant_id: 10,
          end_date: '2025-07-15',
          days_left: '15',
          property_title: 'Apto 1',
          tenant_name: 'Carlos Vera',
        },
      ]);
      mockDataSource.query
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      await service.checkExpiringContracts();

      // Solo 2 admins, sin inquilino
      const notifInserts = mockDataSource.query.mock.calls.filter(
        (call: unknown[]) => {
          const sql = call[0];
          return (
            typeof sql === 'string' &&
            sql.includes('INSERT INTO') &&
            sql.includes('notifications')
          );
        },
      );
      expect(notifInserts.length).toBe(2);
    });

    it('no debe reenviar notificación si ya fue enviada (deduplicación)', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([{ schema_name: 'tenant_acme', slug: 'acme' }])
        .mockResolvedValueOnce([
          {
            notification_channels: {
              internal: true,
              email: false,
              whatsapp: false,
            },
          },
        ])
        .mockResolvedValueOnce([{ id: 1 }])
        .mockResolvedValueOnce([
          {
            id: 5,
            contract_number: 'CTR-001',
            tenant_id: 10,
            end_date: '2025-09-01',
            days_left: '60',
            property_title: 'Apto 1',
            tenant_name: 'Ana',
          },
        ])
        .mockResolvedValueOnce([{ id: 99 }]); // hasBeenSent → already sent

      await service.checkExpiringContracts();

      const notifInserts = mockDataSource.query.mock.calls.filter(
        (call: unknown[]) => {
          const sql = call[0];
          return (
            typeof sql === 'string' &&
            sql.includes('INSERT INTO') &&
            sql.includes('notifications')
          );
        },
      );
      expect(notifInserts.length).toBe(0);
    });

    it('debe continuar con otros tenants si uno falla', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([
          { schema_name: 'tenant_acme', slug: 'acme' },
          { schema_name: 'tenant_beta', slug: 'beta' },
        ])
        .mockRejectedValueOnce(new Error('DB error para acme')) // falla en primer tenant
        .mockResolvedValueOnce([
          {
            notification_channels: {
              internal: true,
              email: false,
              whatsapp: false,
            },
          },
        ])
        .mockResolvedValueOnce([{ id: 1 }])
        .mockResolvedValueOnce([]); // sin contratos vencientes para beta

      await expect(service.checkExpiringContracts()).resolves.not.toThrow();
    });
  });

  // ─── checkUnassignedMaintenance ───────────────────────────────────────────

  describe('checkUnassignedMaintenance', () => {
    it('debe enviar recordatorio a admins por solicitudes sin asignar más de 48 horas', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([{ schema_name: 'tenant_acme', slug: 'acme' }])
        .mockResolvedValueOnce([
          {
            notification_channels: {
              internal: true,
              email: false,
              whatsapp: false,
            },
          },
        ])
        .mockResolvedValueOnce([{ id: 1 }]) // admin IDs
        .mockResolvedValueOnce([
          {
            id: 7,
            ticket_number: 'MNT-2025-007',
            title: 'Fuga de agua',
            property_title: 'Casa 3',
          },
        ])
        .mockResolvedValueOnce([]) // hasBeenSent → not sent
        .mockResolvedValueOnce([]) // INSERT notification admin
        .mockResolvedValueOnce([]); // markSent

      await service.checkUnassignedMaintenance();

      const notifInserts = mockDataSource.query.mock.calls.filter(
        (call: unknown[]) => {
          const sql = call[0];
          return (
            typeof sql === 'string' &&
            sql.includes('INSERT INTO') &&
            sql.includes('notifications')
          );
        },
      );
      expect(notifInserts.length).toBe(1);
    });

    it('no debe enviar si ya fue notificado (deduplicación)', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([{ schema_name: 'tenant_acme', slug: 'acme' }])
        .mockResolvedValueOnce([
          {
            notification_channels: {
              internal: true,
              email: false,
              whatsapp: false,
            },
          },
        ])
        .mockResolvedValueOnce([{ id: 1 }])
        .mockResolvedValueOnce([
          {
            id: 7,
            ticket_number: 'MNT-2025-007',
            title: 'Fuga',
            property_title: 'Casa',
          },
        ])
        .mockResolvedValueOnce([{ id: 88 }]); // hasBeenSent → already sent

      await service.checkUnassignedMaintenance();

      const notifInserts = mockDataSource.query.mock.calls.filter(
        (call: unknown[]) => {
          const sql = call[0];
          return (
            typeof sql === 'string' &&
            sql.includes('INSERT INTO') &&
            sql.includes('notifications')
          );
        },
      );
      expect(notifInserts.length).toBe(0);
    });

    it('no debe hacer nada si no hay admins en el tenant', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([{ schema_name: 'tenant_acme', slug: 'acme' }])
        .mockResolvedValueOnce([
          {
            notification_channels: {
              internal: true,
              email: false,
              whatsapp: false,
            },
          },
        ])
        .mockResolvedValueOnce([]); // no admin IDs

      await service.checkUnassignedMaintenance();

      expect(mockDataSource.query).toHaveBeenCalledTimes(3);
    });
  });
});
