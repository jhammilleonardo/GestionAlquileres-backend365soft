import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PropertiesService } from './properties.service';
import {
  AdminPropertiesController,
  PublicPropertiesController,
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
  ],
  providers: [PropertiesService],
  controllers: [
    AdminPropertiesController,
    PublicPropertiesController,
    TenantPropertiesController,
    OwnerPropertiesPortalController,
    PublicCatalogController,
  ],
  exports: [PropertiesService],
})
export class PropertiesModule {}
