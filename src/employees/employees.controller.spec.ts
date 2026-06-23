import { Test, TestingModule } from '@nestjs/testing';
import { EmployeesController } from './employees.controller';
import { EmployeesService } from './employees.service';

describe('EmployeesController', () => {
  let controller: EmployeesController;

  const mockEmployeesService = {
    findAll: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updatePermissions: jest.fn(),
    remove: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [EmployeesController],
      providers: [
        {
          provide: EmployeesService,
          useValue: mockEmployeesService,
        },
      ],
    }).compile();

    controller = module.get<EmployeesController>(EmployeesController);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('findAll', () => {
    it('should call service.findAll with tenant schema_name', async () => {
      const mockTenant = { schema_name: 'tenant_test', slug: 'test' };
      mockEmployeesService.findAll.mockResolvedValueOnce([]);

      await controller.findAll(mockTenant);

      expect(mockEmployeesService.findAll).toHaveBeenCalledWith('tenant_test');
    });
  });

  describe('remove', () => {
    it('should call service.remove with correct params', async () => {
      const mockTenant = { schema_name: 'tenant_test', slug: 'test' };
      mockEmployeesService.remove.mockResolvedValueOnce({
        message: 'Acceso del empleado con ID 1 desactivado correctamente',
      });

      const result = await controller.remove(1, mockTenant, {
        user: { userId: 0 },
      });

      expect(mockEmployeesService.remove).toHaveBeenCalledWith(
        'tenant_test',
        'test',
        1,
        0,
      );
      expect(result.message).toContain('desactivado correctamente');
    });
  });
});
