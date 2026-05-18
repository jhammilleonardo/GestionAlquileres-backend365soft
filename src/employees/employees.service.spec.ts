import { Test, TestingModule } from '@nestjs/testing';
import { EmployeesService } from './employees.service';
import { getDataSourceToken } from '@nestjs/typeorm';
import { NotificationsService } from '../notifications/notifications.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { AuthSecurityService } from '../auth/auth-security.service';

describe('EmployeesService', () => {
  let service: EmployeesService;

  const mockDataSource = {
    query: jest.fn(),
  };

  const mockNotificationsService = {
    createForUser: jest.fn(),
  };

  const mockAuthSecurityService = {
    recordPermissionsChanged: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmployeesService,
        {
          provide: getDataSourceToken(),
          useValue: mockDataSource,
        },
        {
          provide: NotificationsService,
          useValue: mockNotificationsService,
        },
        {
          provide: AuditLogsService,
          useValue: { log: jest.fn().mockResolvedValue(undefined) },
        },
        {
          provide: AuthSecurityService,
          useValue: mockAuthSecurityService,
        },
      ],
    }).compile();

    service = module.get<EmployeesService>(EmployeesService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it('should return list of employees', async () => {
      const mockEmployees = [
        {
          id: 1,
          email: 'emp@test.com',
          name: 'Employee One',
          role: 'EMPLEADO',
          is_active: true,
          last_connection: null,
          permissions: [],
        },
      ];
      mockDataSource.query.mockResolvedValueOnce(mockEmployees);

      const result = await service.findAll('tenant_test');

      expect(result).toEqual(mockEmployees);
      expect(mockDataSource.query).toHaveBeenCalledTimes(1);
    });
  });

  describe('findOne', () => {
    it('should throw NotFoundException when employee not found', async () => {
      mockDataSource.query.mockResolvedValueOnce([]);

      await expect(service.findOne('tenant_test', 99)).rejects.toThrow(
        'Empleado con ID 99 no encontrado',
      );
    });

    it('should return employee when found', async () => {
      const mockEmployee = {
        id: 1,
        email: 'emp@test.com',
        name: 'Employee One',
        role: 'EMPLEADO',
        is_active: true,
        permissions: [],
      };
      mockDataSource.query.mockResolvedValueOnce([mockEmployee]);

      const result = await service.findOne('tenant_test', 1);
      expect(result).toEqual(mockEmployee);
    });
  });

  describe('remove', () => {
    it('should soft-delete employee by setting is_active = false', async () => {
      const mockEmployee = {
        id: 1,
        email: 'emp@test.com',
        name: 'Employee One',
        role: 'EMPLEADO',
        is_active: true,
        permissions: [],
      };
      // findOne call
      mockDataSource.query.mockResolvedValueOnce([mockEmployee]);
      // UPDATE call
      mockDataSource.query.mockResolvedValueOnce([]);

      const result = await service.remove('tenant_test', 'test', 1);
      expect(result.message).toContain('desactivado correctamente');
      expect(
        mockAuthSecurityService.recordPermissionsChanged,
      ).toHaveBeenCalledWith({
        tenantSlug: 'test',
        targetUserId: 1,
        performedBy: 0,
        action: 'employee_disabled',
        metadata: { is_active: false },
      });
    });
  });
});
