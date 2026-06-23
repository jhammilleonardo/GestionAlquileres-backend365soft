import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { TenantsService } from './tenants.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Tenant } from './metadata/tenant.entity';
import { TenantMaintenanceService } from './tenant-maintenance.service';
import { TenantSchemaService } from './tenant-schema.service';
import { TenantProvisioningService } from './tenant-provisioning.service';
import { TenantCountry } from './dto/create-tenant.dto';

describe('TenantsService', () => {
  let service: TenantsService;
  let tenantRepository: {
    find: jest.Mock;
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
  };
  let tenantProvisioningService: {
    runStartupUpgrades: jest.Mock;
    provisionNewTenant: jest.Mock;
  };

  beforeEach(async () => {
    tenantRepository = {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    };
    tenantProvisioningService = {
      runStartupUpgrades: jest.fn().mockResolvedValue(undefined),
      provisionNewTenant: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TenantsService,
        {
          provide: getRepositoryToken(Tenant),
          useValue: tenantRepository,
        },
        {
          provide: TenantMaintenanceService,
          useValue: {
            deactivateOrphanedActiveTenants: jest
              .fn()
              .mockResolvedValue(undefined),
          },
        },
        {
          provide: TenantSchemaService,
          useValue: {
            createSchemaIfMissing: jest.fn().mockResolvedValue(undefined),
            createUserInfrastructure: jest.fn().mockResolvedValue(undefined),
            grantApplicationPermissions: jest.fn().mockResolvedValue(undefined),
            ensureUserRole: jest.fn().mockResolvedValue(undefined),
            dropSchema: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: TenantProvisioningService,
          useValue: tenantProvisioningService,
        },
      ],
    }).compile();

    service = module.get<TenantsService>(TenantsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('creates tenant metadata without persisting country as a tenant column', async () => {
    const savedTenant = {
      id: 1,
      slug: 'tenant-demo',
      schema_name: 'tenant_tenant_demo',
      company_name: 'Tenant Demo',
      is_active: false,
    } as Tenant;
    const activeTenant = { ...savedTenant, is_active: true } as Tenant;

    tenantRepository.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(activeTenant);
    tenantRepository.create.mockReturnValue(savedTenant);
    tenantRepository.save.mockResolvedValue(savedTenant);
    tenantRepository.update.mockResolvedValue({ affected: 1 });

    const result = await service.create({
      slug: 'tenant-demo',
      company_name: 'Tenant Demo',
      country: TenantCountry.BO,
      is_active: true,
    });

    expect(tenantRepository.create).toHaveBeenCalledWith({
      slug: 'tenant-demo',
      company_name: 'Tenant Demo',
      schema_name: 'tenant_tenant_demo',
      is_active: false,
    });
    expect(tenantProvisioningService.provisionNewTenant).toHaveBeenCalledWith(
      savedTenant,
      TenantCountry.BO,
      undefined,
    );
    expect(tenantRepository.update).toHaveBeenCalledWith(1, {
      is_active: true,
    });
    expect(result).toBe(activeTenant);
  });

  it('rejects slug changes after provisioning', async () => {
    tenantRepository.findOne.mockResolvedValue({
      id: 1,
      slug: 'tenant-demo',
      schema_name: 'tenant_tenant_demo',
    });

    await expect(service.update(1, { slug: 'tenant-renamed' })).rejects.toThrow(
      BadRequestException,
    );

    expect(tenantRepository.update).not.toHaveBeenCalled();
  });

  it('ignores update-only fields that are not tenant metadata columns', async () => {
    const tenant = {
      id: 1,
      slug: 'tenant-demo',
      schema_name: 'tenant_tenant_demo',
    } as Tenant;
    tenantRepository.findOne.mockResolvedValue(tenant);

    const result = await service.update(1, { country: TenantCountry.US });

    expect(result).toBe(tenant);
    expect(tenantRepository.update).not.toHaveBeenCalled();
  });
});
