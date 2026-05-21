import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PropertiesService } from './properties.service';
import { PropertySearchService } from './property-search.service';
import { PropertyOwnersService } from './property-owners.service';
import { PropertyLeadsService } from './property-leads.service';
import { PropertyNotificationsService } from './property-notifications.service';
import { PropertyDetailsService } from './property-details.service';
import { PropertyStatsService } from './property-stats.service';
import { PropertyAddressesService } from './property-addresses.service';
import { PropertyLookupService } from './property-lookup.service';
import { PropertyCatalogService } from './property-catalog.service';
import { PropertyCreationService } from './property-creation.service';
import { PropertyUpdateService } from './property-update.service';
import { PropertyPublicCatalogService } from './property-public-catalog.service';
import { PropertyPublicCatalogQueryService } from './property-public-catalog-query.service';
import { PropertyOwnershipValidationService } from './property-ownership-validation.service';
import {
  AdminPropertiesController,
  TenantPropertiesController,
  OwnerPropertiesPortalController,
} from './properties.controller';
import { PublicCatalogController } from './public-catalog.controller';
import { Property } from './entities/property.entity';
import { PropertyType } from './entities/property-type.entity';
import { PropertySubtype } from './entities/property-subtype.entity';
import { PropertyAddress } from './entities/property-address.entity';
import { RentalOwner } from './entities/rental-owner.entity';
import { PropertyOwner } from './entities/property-owner.entity';
import { NotificationsModule } from '../notifications/notifications.module';
import { OwnerStatementsModule } from '../owner-statements/owner-statements.module';
import { StorageModule } from '../common/storage/storage.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Property,
      PropertyType,
      PropertySubtype,
      PropertyAddress,
      RentalOwner,
      PropertyOwner,
    ]),
    NotificationsModule,
    OwnerStatementsModule,
    StorageModule,
  ],
  providers: [
    PropertiesService,
    PropertySearchService,
    PropertyOwnersService,
    PropertyLeadsService,
    PropertyNotificationsService,
    PropertyDetailsService,
    PropertyStatsService,
    PropertyAddressesService,
    PropertyLookupService,
    PropertyCatalogService,
    PropertyCreationService,
    PropertyUpdateService,
    PropertyPublicCatalogService,
    PropertyPublicCatalogQueryService,
    PropertyOwnershipValidationService,
  ],
  controllers: [
    AdminPropertiesController,
    TenantPropertiesController,
    OwnerPropertiesPortalController,
    PublicCatalogController,
  ],
  exports: [PropertiesService],
})
export class PropertiesModule {}
