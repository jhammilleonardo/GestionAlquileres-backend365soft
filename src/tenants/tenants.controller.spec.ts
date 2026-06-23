import { Test, TestingModule } from '@nestjs/testing';
import { TenantsController } from './tenants.controller';
import { TenantsService } from './tenants.service';

describe('TenantsController', () => {
  let controller: TenantsController;
  let service: {
    findAll: jest.Mock;
    findOne: jest.Mock;
    findActiveBySlug: jest.Mock;
    update: jest.Mock;
    remove: jest.Mock;
  };

  beforeEach(async () => {
    service = {
      findAll: jest.fn(),
      findOne: jest.fn(),
      findActiveBySlug: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TenantsController],
      providers: [
        {
          provide: TenantsService,
          useValue: service,
        },
      ],
    }).compile();

    controller = module.get<TenantsController>(TenantsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('returns only public tenant fields by slug', async () => {
    service.findActiveBySlug.mockResolvedValueOnce({
      id: 1,
      slug: 'demo',
      schema_name: 'tenant_demo',
      company_name: 'Demo',
      currency: 'BOB',
      locale: 'es-BO',
      is_active: true,
    });

    const result = await controller.findBySlug('demo');

    expect(service.findActiveBySlug).toHaveBeenCalledWith('demo');
    expect(result).not.toHaveProperty('schema_name');
    expect(result).toMatchObject({ slug: 'demo', company_name: 'Demo' });
  });

  it('passes parsed numeric IDs to service methods', async () => {
    service.findOne.mockResolvedValueOnce({ id: 7 });
    service.update.mockResolvedValueOnce({ id: 7 });
    service.remove.mockResolvedValueOnce(undefined);

    await controller.findOne(7);
    await controller.update(7, { company_name: 'Nueva Empresa' });
    await controller.remove(7);

    expect(service.findOne).toHaveBeenCalledWith(7);
    expect(service.update).toHaveBeenCalledWith(7, {
      company_name: 'Nueva Empresa',
    });
    expect(service.remove).toHaveBeenCalledWith(7);
  });
});
