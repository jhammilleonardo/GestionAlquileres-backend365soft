import { BadRequestException } from '@nestjs/common';
import { TenantCountry } from './dto/create-tenant.dto';
import { Tenant } from './metadata/tenant.entity';
import { TenantApplicationsProvisioningService } from './tenant-applications-provisioning.service';
import { TenantAuditComplianceProvisioningService } from './tenant-audit-compliance-provisioning.service';
import { TenantConfigProvisioningService } from './tenant-config-provisioning.service';
import { TenantContractsProvisioningService } from './tenant-contracts-provisioning.service';
import { TenantEmployeesProvisioningService } from './tenant-employees-provisioning.service';
import { TenantExpensesProvisioningService } from './tenant-expenses-provisioning.service';
import { TenantInspectionsProvisioningService } from './tenant-inspections-provisioning.service';
import { TenantMaintenanceProvisioningService } from './tenant-maintenance-provisioning.service';
import { TenantNotificationsProvisioningService } from './tenant-notifications-provisioning.service';
import { TenantPaymentsProvisioningService } from './tenant-payments-provisioning.service';
import { TenantPropertiesProvisioningService } from './tenant-properties-provisioning.service';
import { TenantProvisioningService } from './tenant-provisioning.service';
import { TenantSchemaService } from './tenant-schema.service';
import {
  TenantStartupUpgradeService,
  TenantStartupUpgradeStepFactory,
} from './tenant-startup-upgrade.service';
import { TenantUnitsProvisioningService } from './tenant-units-provisioning.service';
import { TenantWebsiteProvisioningService } from './tenant-website-provisioning.service';

describe('TenantProvisioningService', () => {
  const schemaName = 'tenant_alpha';
  let tenantSchemaService: Record<string, jest.Mock>;
  let tenantStartupUpgradeService: Record<string, jest.Mock>;
  let tenantConfigProvisioningService: Record<string, jest.Mock>;
  let tenantPaymentsProvisioningService: Record<string, jest.Mock>;
  let tenantExpensesProvisioningService: Record<string, jest.Mock>;
  let tenantInspectionsProvisioningService: Record<string, jest.Mock>;
  let tenantMaintenanceProvisioningService: Record<string, jest.Mock>;
  let tenantNotificationsProvisioningService: Record<string, jest.Mock>;
  let tenantApplicationsProvisioningService: Record<string, jest.Mock>;
  let tenantUnitsProvisioningService: Record<string, jest.Mock>;
  let tenantPropertiesProvisioningService: Record<string, jest.Mock>;
  let tenantContractsProvisioningService: Record<string, jest.Mock>;
  let tenantEmployeesProvisioningService: Record<string, jest.Mock>;
  let tenantAuditComplianceProvisioningService: Record<string, jest.Mock>;
  let tenantWebsiteProvisioningService: Record<string, jest.Mock>;
  let service: TenantProvisioningService;

  beforeEach(() => {
    tenantSchemaService = mockService([
      'createSchemaIfMissing',
      'createUserInfrastructure',
      'grantApplicationPermissions',
      'ensureUserRole',
    ]);
    tenantStartupUpgradeService = mockService(['run']);
    tenantConfigProvisioningService = mockService(['ensureTenantConfig']);
    tenantPaymentsProvisioningService = mockService([
      'ensurePayments',
      'ensureOwnerStatements',
    ]);
    tenantExpensesProvisioningService = mockService([
      'ensureExpenses',
      'upgradeExpenses',
    ]);
    tenantInspectionsProvisioningService = mockService(['ensureInspections']);
    tenantMaintenanceProvisioningService = mockService([
      'ensureMaintenance',
      'ensureStageFields',
      'ensureStageHistory',
      'ensureVendors',
      'ensureVendorFields',
    ]);
    tenantNotificationsProvisioningService = mockService([
      'ensureNotifications',
      'ensureLifecycleNotificationLog',
      'upgradeNotificationEventTypes',
    ]);
    tenantApplicationsProvisioningService = mockService([
      'ensureApplications',
      'ensureScreeningFields',
      'ensureScreeningChecklist',
    ]);
    tenantUnitsProvisioningService = mockService([
      'ensureUnits',
      'ensureShortTermFields',
      'ensurePropertyAvailability',
      'ensureReservations',
    ]);
    tenantPropertiesProvisioningService = mockService([
      'ensureProperties',
      'ensurePropertyColumns',
      'migrateImagesToJson',
      'ensurePropertyLeads',
      'ensurePropertyOwnersUniqueness',
      'ensureRentalOwnerBankFields',
      'ensurePropertyCatalog',
      'seedPropertyTypesAndSubtypes',
    ]);
    tenantContractsProvisioningService = mockService([
      'ensureContracts',
      'ensureApplicationId',
      'ensureContractNumberSequence',
      'ensureUnitId',
      'ensureContractTemplates',
    ]);
    tenantEmployeesProvisioningService = mockService([
      'ensureEmployees',
      'ensureEmployeePermissions',
    ]);
    tenantAuditComplianceProvisioningService = mockService([
      'ensureViolations',
      'ensureAuditLogs',
    ]);
    tenantWebsiteProvisioningService = mockService([
      'ensureTenantWebsite',
      'ensureWebsiteContacts',
    ]);

    service = new TenantProvisioningService(
      tenantSchemaService as unknown as TenantSchemaService,
      tenantStartupUpgradeService as unknown as TenantStartupUpgradeService,
      tenantConfigProvisioningService as unknown as TenantConfigProvisioningService,
      tenantPaymentsProvisioningService as unknown as TenantPaymentsProvisioningService,
      tenantExpensesProvisioningService as unknown as TenantExpensesProvisioningService,
      tenantInspectionsProvisioningService as unknown as TenantInspectionsProvisioningService,
      tenantMaintenanceProvisioningService as unknown as TenantMaintenanceProvisioningService,
      tenantNotificationsProvisioningService as unknown as TenantNotificationsProvisioningService,
      tenantApplicationsProvisioningService as unknown as TenantApplicationsProvisioningService,
      tenantUnitsProvisioningService as unknown as TenantUnitsProvisioningService,
      tenantPropertiesProvisioningService as unknown as TenantPropertiesProvisioningService,
      tenantContractsProvisioningService as unknown as TenantContractsProvisioningService,
      tenantEmployeesProvisioningService as unknown as TenantEmployeesProvisioningService,
      tenantAuditComplianceProvisioningService as unknown as TenantAuditComplianceProvisioningService,
      tenantWebsiteProvisioningService as unknown as TenantWebsiteProvisioningService,
    );
  });

  it('provisions a new tenant with the complete schema surface', async () => {
    const tenant = { schema_name: schemaName } as Tenant;

    await service.provisionNewTenant(tenant, TenantCountry.GT);

    expect(tenantSchemaService.createSchemaIfMissing).toHaveBeenCalledWith(
      schemaName,
    );
    expect(tenantSchemaService.createUserInfrastructure).toHaveBeenCalledWith(
      schemaName,
    );
    expect(
      tenantPropertiesProvisioningService.ensureProperties,
    ).toHaveBeenCalledWith(schemaName);
    expect(
      tenantApplicationsProvisioningService.ensureApplications,
    ).toHaveBeenCalledWith(schemaName);
    expect(
      tenantContractsProvisioningService.ensureContracts,
    ).toHaveBeenCalledWith(schemaName);
    expect(
      tenantContractsProvisioningService.ensureContractTemplates,
    ).toHaveBeenCalledWith(schemaName);
    expect(
      tenantMaintenanceProvisioningService.ensureMaintenance,
    ).toHaveBeenCalledWith(schemaName);
    expect(
      tenantMaintenanceProvisioningService.ensureVendors,
    ).toHaveBeenCalledWith(schemaName);
    expect(
      tenantNotificationsProvisioningService.ensureNotifications,
    ).toHaveBeenCalledWith(schemaName);
    expect(
      tenantPaymentsProvisioningService.ensurePayments,
    ).toHaveBeenCalledWith(schemaName);
    expect(
      tenantEmployeesProvisioningService.ensureEmployeePermissions,
    ).toHaveBeenCalledWith(schemaName);
    expect(
      tenantConfigProvisioningService.ensureTenantConfig,
    ).toHaveBeenCalledWith(schemaName, TenantCountry.GT);
    expect(
      tenantApplicationsProvisioningService.ensureScreeningChecklist,
    ).toHaveBeenCalledWith(schemaName);
    expect(tenantUnitsProvisioningService.ensureUnits).toHaveBeenCalledWith(
      schemaName,
    );
    expect(
      tenantPaymentsProvisioningService.ensureOwnerStatements,
    ).toHaveBeenCalledWith(schemaName);
    expect(
      tenantInspectionsProvisioningService.ensureInspections,
    ).toHaveBeenCalledWith(schemaName);
    expect(
      tenantExpensesProvisioningService.ensureExpenses,
    ).toHaveBeenCalledWith(schemaName);
    expect(
      tenantAuditComplianceProvisioningService.ensureAuditLogs,
    ).toHaveBeenCalledWith(schemaName);
    expect(
      tenantAuditComplianceProvisioningService.ensureViolations,
    ).toHaveBeenCalledWith(schemaName);
    expect(
      tenantWebsiteProvisioningService.ensureTenantWebsite,
    ).toHaveBeenCalledWith(schemaName);
    expect(
      tenantWebsiteProvisioningService.ensureWebsiteContacts,
    ).toHaveBeenCalledWith(schemaName);
    expect(
      tenantPropertiesProvisioningService.seedPropertyTypesAndSubtypes,
    ).toHaveBeenCalledWith(schemaName);
    expect(
      tenantSchemaService.grantApplicationPermissions,
    ).toHaveBeenCalledWith(schemaName);
  });

  it('wraps provisioning failures as BadRequestException', async () => {
    tenantSchemaService.createSchemaIfMissing.mockRejectedValue(
      new Error('database unavailable'),
    );

    await expect(
      service.provisionNewTenant({ schema_name: schemaName } as Tenant),
    ).rejects.toThrow(BadRequestException);
  });

  it('registers startup upgrade steps for existing tenant schemas', async () => {
    tenantStartupUpgradeService.run.mockImplementation(
      async (factory: TenantStartupUpgradeStepFactory) => {
        for (const [, run] of factory(schemaName)) {
          await run();
        }
      },
    );

    await service.runStartupUpgrades();

    expect(tenantStartupUpgradeService.run).toHaveBeenCalledTimes(1);
    expect(
      tenantPropertiesProvisioningService.ensurePropertyColumns,
    ).toHaveBeenCalledWith(schemaName);
    expect(
      tenantPropertiesProvisioningService.migrateImagesToJson,
    ).toHaveBeenCalledWith(schemaName);
    expect(
      tenantPaymentsProvisioningService.ensurePayments,
    ).toHaveBeenCalledWith(schemaName);
    expect(
      tenantContractsProvisioningService.ensureApplicationId,
    ).toHaveBeenCalledWith(schemaName);
    expect(
      tenantContractsProvisioningService.ensureUnitId,
    ).toHaveBeenCalledWith(schemaName);
    expect(tenantSchemaService.ensureUserRole).toHaveBeenCalledWith(
      schemaName,
      'PROPIETARIO',
    );
    expect(
      tenantAuditComplianceProvisioningService.ensureViolations,
    ).toHaveBeenCalledWith(schemaName);
    expect(
      tenantAuditComplianceProvisioningService.ensureAuditLogs,
    ).toHaveBeenCalledWith(schemaName);
    expect(
      tenantWebsiteProvisioningService.ensureTenantWebsite,
    ).toHaveBeenCalledWith(schemaName);
    expect(
      tenantWebsiteProvisioningService.ensureWebsiteContacts,
    ).toHaveBeenCalledWith(schemaName);
    expect(
      tenantPropertiesProvisioningService.ensurePropertyCatalog,
    ).toHaveBeenCalledWith(schemaName);
  });
});

function mockService(methods: string[]): Record<string, jest.Mock> {
  return Object.fromEntries(
    methods.map((method) => [method, jest.fn().mockResolvedValue(undefined)]),
  );
}
