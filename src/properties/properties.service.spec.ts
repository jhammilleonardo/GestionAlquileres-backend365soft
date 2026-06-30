import { PropertiesService } from './properties.service';
import { DataSource } from 'typeorm';
import { PropertySearchService } from './property-search.service';
import { PropertyOwnersService } from './property-owners.service';
import { PropertyLeadsService } from './property-leads.service';
import { PropertyDetailsService } from './property-details.service';
import { PropertyStatsService } from './property-stats.service';
import { PropertyLookupService } from './property-lookup.service';
import { PropertyCatalogService } from './property-catalog.service';
import { PropertyCreationService } from './property-creation.service';
import { PropertyUpdateService } from './property-update.service';
import { PropertyPublicCatalogService } from './property-public-catalog.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';

describe('PropertiesService', () => {
  let service: PropertiesService;
  let dataSource: {
    query: jest.Mock;
    createQueryRunner: jest.Mock;
    getRepository: jest.Mock;
  };
  let propertyDetailsService: {
    updateDetails: jest.Mock;
  };
  let propertyStatsService: {
    getStats: jest.Mock;
  };
  let propertyLookupService: {
    findOne: jest.Mock;
  };
  let propertyCatalogService: {
    getPropertyTypes: jest.Mock;
    getPropertySubtypes: jest.Mock;
  };
  let propertyCreationService: {
    create: jest.Mock;
  };
  let propertyUpdateService: {
    update: jest.Mock;
  };
  let propertyPublicCatalogService: {
    findCatalogProperties: jest.Mock;
    findCatalogPropertyDetail: jest.Mock;
    recordPropertyView: jest.Mock;
  };

  beforeEach(() => {
    dataSource = {
      query: jest.fn(),
      createQueryRunner: jest.fn(),
      getRepository: jest.fn(),
    };
    propertyDetailsService = {
      updateDetails: jest.fn().mockResolvedValue(undefined),
    };
    propertyStatsService = {
      getStats: jest.fn().mockResolvedValue({
        total: 0,
        available: 0,
        occupied: 0,
        maintenance: 0,
        reserved: 0,
        inactive: 0,
      }),
    };
    propertyLookupService = {
      findOne: jest.fn(),
    };
    propertyCatalogService = {
      getPropertyTypes: jest.fn(),
      getPropertySubtypes: jest.fn(),
    };
    propertyCreationService = {
      create: jest.fn(),
    };
    propertyUpdateService = {
      update: jest.fn(),
    };
    propertyPublicCatalogService = {
      findCatalogProperties: jest.fn(),
      findCatalogPropertyDetail: jest.fn(),
      recordPropertyView: jest.fn(),
    };

    service = new PropertiesService(
      dataSource as unknown as DataSource,
      {} as PropertySearchService,
      {} as PropertyOwnersService,
      {} as PropertyLeadsService,
      propertyDetailsService as unknown as PropertyDetailsService,
      propertyStatsService as unknown as PropertyStatsService,
      propertyLookupService as unknown as PropertyLookupService,
      propertyCatalogService as unknown as PropertyCatalogService,
      propertyCreationService as unknown as PropertyCreationService,
      propertyUpdateService as unknown as PropertyUpdateService,
      propertyPublicCatalogService as unknown as PropertyPublicCatalogService,
      { log: jest.fn() } as unknown as AuditLogsService,
    );
  });

  it('delegates update to PropertyUpdateService', async () => {
    propertyUpdateService.update.mockResolvedValue({ id: 10 });

    await expect(
      service.update(10, { status: 'DISPONIBLE' }, 'acme'),
    ).resolves.toEqual({ id: 10 });

    expect(propertyUpdateService.update).toHaveBeenCalledWith(
      10,
      { status: 'DISPONIBLE' },
      'acme',
    );
  });

  it('finds a property using schema-qualified queries without mutating search_path', async () => {
    propertyLookupService.findOne.mockResolvedValue({
      id: 10,
      title: 'Casa Central',
      property_type: {
        id: 1,
        name: 'Casa',
      },
    });

    await expect(service.findOne(10, 'acme')).resolves.toMatchObject({
      id: 10,
      title: 'Casa Central',
      property_type: {
        id: 1,
        name: 'Casa',
      },
    });

    expect(propertyLookupService.findOne).toHaveBeenCalledWith(10, 'acme');
  });
});
