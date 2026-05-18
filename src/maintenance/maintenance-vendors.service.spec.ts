import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { MaintenanceRequest } from './entities/maintenance-request.entity';
import { MaintenanceLookupService } from './maintenance-lookup.service';
import { MaintenanceVendorsService } from './maintenance-vendors.service';

describe('MaintenanceVendorsService', () => {
  let service: MaintenanceVendorsService;
  let query: jest.Mock;
  let update: jest.Mock;
  let lookupService: { findOne: jest.Mock };

  beforeEach(async () => {
    query = jest.fn();
    update = jest.fn();
    lookupService = { findOne: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MaintenanceVendorsService,
        {
          provide: getRepositoryToken(MaintenanceRequest),
          useValue: { update },
        },
        {
          provide: DataSource,
          useValue: { query },
        },
        {
          provide: MaintenanceLookupService,
          useValue: lookupService,
        },
      ],
    }).compile();

    service = module.get(MaintenanceVendorsService);
  });

  it('rechaza asignar proveedor externo y tecnico al mismo tiempo', async () => {
    lookupService.findOne.mockResolvedValueOnce({ id: 1, assigned_to: null });

    await expect(service.assignVendor(1, 2, 3)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('rechaza proveedor inexistente', async () => {
    lookupService.findOne.mockResolvedValueOnce({ id: 1, assigned_to: null });
    query.mockResolvedValueOnce([]);

    await expect(service.assignVendor(1, 2, null)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('actualiza rating de proveedor solo cuando la orden esta cerrada o completada', async () => {
    lookupService.findOne
      .mockResolvedValueOnce({
        id: 1,
        vendor_id: 7,
        vendor_rated_at: null,
        status: 'COMPLETED',
      })
      .mockResolvedValueOnce({ id: 1, vendor_rating: 5 });
    update.mockResolvedValueOnce({});
    query.mockResolvedValueOnce([]);

    await expect(service.rateVendor(1, 5, 'bien', 99)).resolves.toEqual({
      id: 1,
      vendor_rating: 5,
    });
    expect(update).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        vendor_rating: 5,
        vendor_rating_comment: 'bien',
        vendor_rated_by: 99,
      }),
    );
  });
});
