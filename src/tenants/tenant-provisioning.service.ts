import { BadRequestException, Injectable } from '@nestjs/common';
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
import { TenantMessagesProvisioningService } from './tenant-messages-provisioning.service';
import { TenantNotificationsProvisioningService } from './tenant-notifications-provisioning.service';
import { TenantPaymentsProvisioningService } from './tenant-payments-provisioning.service';
import { TenantPropertiesProvisioningService } from './tenant-properties-provisioning.service';
import { TenantSchemaService } from './tenant-schema.service';
import { TenantStartupUpgradeService } from './tenant-startup-upgrade.service';
import { TenantUnitsProvisioningService } from './tenant-units-provisioning.service';
import { TenantWebsiteProvisioningService } from './tenant-website-provisioning.service';

@Injectable()
export class TenantProvisioningService {
  constructor(
    private readonly tenantSchemaService: TenantSchemaService,
    private readonly tenantStartupUpgradeService: TenantStartupUpgradeService,
    private readonly tenantConfigProvisioningService: TenantConfigProvisioningService,
    private readonly tenantPaymentsProvisioningService: TenantPaymentsProvisioningService,
    private readonly tenantExpensesProvisioningService: TenantExpensesProvisioningService,
    private readonly tenantInspectionsProvisioningService: TenantInspectionsProvisioningService,
    private readonly tenantMaintenanceProvisioningService: TenantMaintenanceProvisioningService,
    private readonly tenantMessagesProvisioningService: TenantMessagesProvisioningService,
    private readonly tenantNotificationsProvisioningService: TenantNotificationsProvisioningService,
    private readonly tenantApplicationsProvisioningService: TenantApplicationsProvisioningService,
    private readonly tenantUnitsProvisioningService: TenantUnitsProvisioningService,
    private readonly tenantPropertiesProvisioningService: TenantPropertiesProvisioningService,
    private readonly tenantContractsProvisioningService: TenantContractsProvisioningService,
    private readonly tenantEmployeesProvisioningService: TenantEmployeesProvisioningService,
    private readonly tenantAuditComplianceProvisioningService: TenantAuditComplianceProvisioningService,
    private readonly tenantWebsiteProvisioningService: TenantWebsiteProvisioningService,
  ) {}

  async runStartupUpgrades(): Promise<void> {
    await this.tenantStartupUpgradeService.run((schemaName) => [
      [
        'ensurePropertyColumns',
        () =>
          this.tenantPropertiesProvisioningService.ensurePropertyColumns(
            schemaName,
          ),
      ],
      [
        'migrateImagesToJson',
        () =>
          this.tenantPropertiesProvisioningService.migrateImagesToJson(
            schemaName,
          ),
      ],
      [
        'ensurePayments',
        () => this.tenantPaymentsProvisioningService.ensurePayments(schemaName),
      ],
      [
        'ensureContractApplicationId',
        () =>
          this.tenantContractsProvisioningService.ensureApplicationId(
            schemaName,
          ),
      ],
      [
        'ensureContractNumberSequence',
        () =>
          this.tenantContractsProvisioningService.ensureContractNumberSequence(
            schemaName,
          ),
      ],
      [
        'ensureEmployees',
        () =>
          this.tenantEmployeesProvisioningService.ensureEmployees(schemaName),
      ],
      [
        'ensureTenantConfig',
        () =>
          this.tenantConfigProvisioningService.ensureTenantConfig(schemaName),
      ],
      [
        'ensurePropertyLeads',
        () =>
          this.tenantPropertiesProvisioningService.ensurePropertyLeads(
            schemaName,
          ),
      ],
      [
        'ensureUnits',
        () => this.tenantUnitsProvisioningService.ensureUnits(schemaName),
      ],
      [
        'ensureContractUnitId',
        () => this.tenantContractsProvisioningService.ensureUnitId(schemaName),
      ],
      [
        'ensureContractSignatureColumns',
        () =>
          this.tenantContractsProvisioningService.ensureSignatureColumns(
            schemaName,
          ),
      ],
      [
        'ensurePropertyOwnersUniqueness',
        () =>
          this.tenantPropertiesProvisioningService.ensurePropertyOwnersUniqueness(
            schemaName,
          ),
      ],
      [
        'ensureRentalOwnerBankFields',
        () =>
          this.tenantPropertiesProvisioningService.ensureRentalOwnerBankFields(
            schemaName,
          ),
      ],
      [
        'ensureApplicationScreeningFields',
        () =>
          this.tenantApplicationsProvisioningService.ensureScreeningFields(
            schemaName,
          ),
      ],
      [
        'ensureScreeningChecklist',
        () =>
          this.tenantApplicationsProvisioningService.ensureScreeningChecklist(
            schemaName,
          ),
      ],
      [
        'ensureMaintenanceStageFields',
        () =>
          this.tenantMaintenanceProvisioningService.ensureStageFields(
            schemaName,
          ),
      ],
      [
        'ensureMaintenanceStageHistory',
        () =>
          this.tenantMaintenanceProvisioningService.ensureStageHistory(
            schemaName,
          ),
      ],
      [
        'ensureOwnerStatements',
        () =>
          this.tenantPaymentsProvisioningService.ensureOwnerStatements(
            schemaName,
          ),
      ],
      [
        'ensureInspections',
        () =>
          this.tenantInspectionsProvisioningService.ensureInspections(
            schemaName,
          ),
      ],
      [
        'ensureMessages',
        () => this.tenantMessagesProvisioningService.ensureMessages(schemaName),
      ],
      [
        'upgradeExpenses',
        () =>
          this.tenantExpensesProvisioningService.upgradeExpenses(schemaName),
      ],
      [
        'ensureUserRolePropietario',
        () =>
          this.tenantSchemaService.ensureUserRole(schemaName, 'PROPIETARIO'),
      ],
      [
        'ensureUserRoleVendor',
        () => this.tenantSchemaService.ensureUserRole(schemaName, 'VENDOR'),
      ],
      [
        'ensureViolations',
        () =>
          this.tenantAuditComplianceProvisioningService.ensureViolations(
            schemaName,
          ),
      ],
      [
        'ensureVendors',
        () =>
          this.tenantMaintenanceProvisioningService.ensureVendors(schemaName),
      ],
      [
        'ensureMaintenanceVendorFields',
        () =>
          this.tenantMaintenanceProvisioningService.ensureVendorFields(
            schemaName,
          ),
      ],
      [
        'ensureUnitsShortTermFields',
        () =>
          this.tenantUnitsProvisioningService.ensureShortTermFields(schemaName),
      ],
      [
        'ensurePropertyAvailability',
        () =>
          this.tenantUnitsProvisioningService.ensurePropertyAvailability(
            schemaName,
          ),
      ],
      [
        'ensureReservations',
        () =>
          this.tenantUnitsProvisioningService.ensureReservations(schemaName),
      ],
      [
        'ensureLifecycleNotificationLog',
        () =>
          this.tenantNotificationsProvisioningService.ensureLifecycleNotificationLog(
            schemaName,
          ),
      ],
      [
        'upgradeNotificationEventTypes',
        () =>
          this.tenantNotificationsProvisioningService.upgradeNotificationEventTypes(
            schemaName,
          ),
      ],
      [
        'ensureContractTemplates',
        () =>
          this.tenantContractsProvisioningService.ensureContractTemplates(
            schemaName,
          ),
      ],
      [
        'ensureAuditLogs',
        () =>
          this.tenantAuditComplianceProvisioningService.ensureAuditLogs(
            schemaName,
          ),
      ],
      [
        'ensureTenantWebsite',
        () =>
          this.tenantWebsiteProvisioningService.ensureTenantWebsite(schemaName),
      ],
      [
        'ensureWebsiteContacts',
        () =>
          this.tenantWebsiteProvisioningService.ensureWebsiteContacts(
            schemaName,
          ),
      ],
      [
        'ensurePropertyCatalog',
        () =>
          this.tenantPropertiesProvisioningService.ensurePropertyCatalog(
            schemaName,
          ),
      ],
    ]);
  }

  async provisionNewTenant(
    tenant: Tenant,
    country: TenantCountry = TenantCountry.BO,
  ): Promise<void> {
    try {
      await this.tenantSchemaService.createSchemaIfMissing(tenant.schema_name);
      await this.tenantSchemaService.createUserInfrastructure(
        tenant.schema_name,
      );

      await this.tenantPropertiesProvisioningService.ensureProperties(
        tenant.schema_name,
      );
      await this.tenantApplicationsProvisioningService.ensureApplications(
        tenant.schema_name,
      );
      await this.tenantContractsProvisioningService.ensureContracts(
        tenant.schema_name,
      );
      await this.tenantContractsProvisioningService.ensureContractTemplates(
        tenant.schema_name,
      );
      await this.tenantMaintenanceProvisioningService.ensureMaintenance(
        tenant.schema_name,
      );
      await this.tenantMaintenanceProvisioningService.ensureVendors(
        tenant.schema_name,
      );
      await this.tenantMaintenanceProvisioningService.ensureVendorFields(
        tenant.schema_name,
      );
      await this.tenantNotificationsProvisioningService.ensureNotifications(
        tenant.schema_name,
      );
      await this.tenantPaymentsProvisioningService.ensurePayments(
        tenant.schema_name,
      );
      await this.tenantEmployeesProvisioningService.ensureEmployeePermissions(
        tenant.schema_name,
      );
      await this.tenantConfigProvisioningService.ensureTenantConfig(
        tenant.schema_name,
        country,
      );
      await this.tenantPropertiesProvisioningService.ensurePropertyLeads(
        tenant.schema_name,
      );
      await this.tenantApplicationsProvisioningService.ensureScreeningChecklist(
        tenant.schema_name,
      );
      await this.tenantUnitsProvisioningService.ensureUnits(tenant.schema_name);
      await this.tenantContractsProvisioningService.ensureUnitId(
        tenant.schema_name,
      );
      await this.tenantUnitsProvisioningService.ensureShortTermFields(
        tenant.schema_name,
      );
      await this.tenantUnitsProvisioningService.ensurePropertyAvailability(
        tenant.schema_name,
      );
      await this.tenantUnitsProvisioningService.ensureReservations(
        tenant.schema_name,
      );
      await this.tenantPaymentsProvisioningService.ensureOwnerStatements(
        tenant.schema_name,
      );
      await this.tenantInspectionsProvisioningService.ensureInspections(
        tenant.schema_name,
      );
      await this.tenantExpensesProvisioningService.ensureExpenses(
        tenant.schema_name,
      );
      await this.tenantMessagesProvisioningService.ensureMessages(
        tenant.schema_name,
      );
      await this.tenantAuditComplianceProvisioningService.ensureAuditLogs(
        tenant.schema_name,
      );
      await this.tenantAuditComplianceProvisioningService.ensureViolations(
        tenant.schema_name,
      );
      await this.tenantNotificationsProvisioningService.ensureLifecycleNotificationLog(
        tenant.schema_name,
      );
      await this.tenantWebsiteProvisioningService.ensureTenantWebsite(
        tenant.schema_name,
      );
      await this.tenantWebsiteProvisioningService.ensureWebsiteContacts(
        tenant.schema_name,
      );
      await this.tenantPropertiesProvisioningService.seedPropertyTypesAndSubtypes(
        tenant.schema_name,
      );
      await this.tenantSchemaService.grantApplicationPermissions(
        tenant.schema_name,
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      throw new BadRequestException(`Failed to create schema: ${message}`);
    }
  }
}
