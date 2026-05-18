import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { MaintenanceLookupService } from './maintenance-lookup.service';

describe('MaintenanceLookupService', () => {
  let service: MaintenanceLookupService;
  let query: jest.Mock;

  beforeEach(async () => {
    query = jest.fn();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MaintenanceLookupService,
        {
          provide: DataSource,
          useValue: { query },
        },
      ],
    }).compile();

    service = module.get(MaintenanceLookupService);
  });

  it('aplica filtros permitidos en findAll', async () => {
    query.mockResolvedValueOnce([]);

    await service.findAll({
      status: 'NEW',
      priority: 'HIGH',
      property_id: 7,
    });

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('mr.status = $1'),
      ['NEW', 'HIGH', 7],
    );
  });

  it('lanza NotFoundException cuando no encuentra solicitud', async () => {
    query.mockResolvedValueOnce([]);

    await expect(service.findOne(99)).rejects.toThrow(NotFoundException);
  });

  it('carga detalle con mensajes y adjuntos directos', async () => {
    query
      .mockResolvedValueOnce([{ id: 1, tenant_id: 10 }])
      .mockResolvedValueOnce([{ id: 20, send_to_resident: true }])
      .mockResolvedValueOnce([{ id: 30, file_url: '/x.pdf' }]);

    await expect(service.findOne(1)).resolves.toMatchObject({
      id: 1,
      messages: [{ id: 20, send_to_resident: true }],
      attachments: [{ id: 30, file_url: '/x.pdf' }],
    });
  });
});
