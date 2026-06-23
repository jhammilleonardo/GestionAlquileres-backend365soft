import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TenantsService } from './tenants.service';
import { TenantsController } from './tenants.controller';
import { Tenant } from './metadata/tenant.entity';
import { TenantAccountingProvisioningService } from './tenant-accounting-provisioning.service';
import { TenantPublicSchemaService } from './tenant-public-schema.service';
import { TenantAdminIndexService } from './tenant-admin-index.service';
import { TenantMaintenanceService } from './tenant-maintenance.service';
import { TenantSchemaService } from './tenant-schema.service';
import { TenantStartupUpgradeService } from './tenant-startup-upgrade.service';
import { TenantConfigProvisioningService } from './tenant-config-provisioning.service';
import { TenantPaymentsProvisioningService } from './tenant-payments-provisioning.service';
import { TenantExpensesProvisioningService } from './tenant-expenses-provisioning.service';
import { TenantInspectionsProvisioningService } from './tenant-inspections-provisioning.service';
import { TenantMaintenanceProvisioningService } from './tenant-maintenance-provisioning.service';
import { TenantMessagesProvisioningService } from './tenant-messages-provisioning.service';
import { TenantNotificationsProvisioningService } from './tenant-notifications-provisioning.service';
import { TenantApplicationsProvisioningService } from './tenant-applications-provisioning.service';
import { TenantUnitsProvisioningService } from './tenant-units-provisioning.service';
import { TenantPropertiesProvisioningService } from './tenant-properties-provisioning.service';
import { TenantContractsProvisioningService } from './tenant-contracts-provisioning.service';
import { TenantEmployeesProvisioningService } from './tenant-employees-provisioning.service';
import { TenantAuditComplianceProvisioningService } from './tenant-audit-compliance-provisioning.service';
import { TenantWebsiteProvisioningService } from './tenant-website-provisioning.service';
import { TenantProvisioningService } from './tenant-provisioning.service';

@Module({
  imports: [TypeOrmModule.forFeature([Tenant])],
  providers: [
    TenantsService,
    TenantPublicSchemaService,
    TenantAdminIndexService,
    TenantMaintenanceService,
    TenantSchemaService,
    TenantStartupUpgradeService,
    TenantConfigProvisioningService,
    TenantPaymentsProvisioningService,
    TenantExpensesProvisioningService,
    TenantInspectionsProvisioningService,
    TenantMaintenanceProvisioningService,
    TenantMessagesProvisioningService,
    TenantNotificationsProvisioningService,
    TenantApplicationsProvisioningService,
    TenantUnitsProvisioningService,
    TenantPropertiesProvisioningService,
    TenantContractsProvisioningService,
    TenantEmployeesProvisioningService,
    TenantAuditComplianceProvisioningService,
    TenantWebsiteProvisioningService,
    TenantAccountingProvisioningService,
    TenantProvisioningService,
  ],
  controllers: [TenantsController],
  exports: [TenantsService, TenantAdminIndexService],
})
export class TenantsModule {}
