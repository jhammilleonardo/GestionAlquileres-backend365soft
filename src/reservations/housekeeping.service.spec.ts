import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { getDataSourceToken } from '@nestjs/typeorm';
import { HousekeepingService } from './housekeeping.service';
import { QueryRunner } from 'typeorm';

describe('HousekeepingService', () => {
  let service: HousekeepingService;
  const mockDataSource = { query: jest.fn() };
  const runnerQuery = jest.fn();
  const queryRunner = { query: runnerQuery } as unknown as QueryRunner;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HousekeepingService,
        { provide: getDataSourceToken(), useValue: mockDataSource },
      ],
    }).compile();

    service = module.get(HousekeepingService);
    jest.resetAllMocks();
  });

  describe('createForReservation', () => {
    const reservation = {
      id: 5,
      property_id: 3,
      unit_id: 7,
      checkout_date: '2026-06-15',
    };

    it('inserta una tarea programada para el check-out', async () => {
      runnerQuery
        .mockResolvedValueOnce([]) // no existe
        .mockResolvedValueOnce(undefined); // INSERT

      await service.createForReservation(queryRunner, reservation);

      const insert = runnerQuery.mock.calls[1] as [string, unknown[]];
      expect(insert[0]).toContain('INSERT INTO housekeeping_tasks');
      expect(insert[1]).toEqual([3, 7, 5, '2026-06-15']);
    });

    it('es idempotente: no duplica si ya hay tarea para la reserva', async () => {
      runnerQuery.mockResolvedValueOnce([{ id: 1 }]); // ya existe

      await service.createForReservation(queryRunner, reservation);

      expect(runnerQuery).toHaveBeenCalledTimes(1); // sólo el SELECT
    });
  });

  describe('list', () => {
    it('arma el WHERE con los filtros provistos', async () => {
      mockDataSource.query.mockResolvedValueOnce([]);

      await service.list({ status: 'pending', from: '2026-06-01' });

      const [sql, params] = mockDataSource.query.mock.calls[0] as [
        string,
        unknown[],
      ];
      expect(sql).toContain('h.status = $1');
      expect(sql).toContain('h.scheduled_date >= $2');
      expect(params).toEqual(['pending', '2026-06-01']);
    });
  });

  describe('update', () => {
    it('actualiza el estado y devuelve la tarea', async () => {
      mockDataSource.query.mockResolvedValueOnce([{ id: 1, status: 'done' }]);

      const result = (await service.update(1, { status: 'done' })) as {
        status: string;
      };

      expect(result.status).toBe('done');
    });

    it('lanza NotFound si la tarea no existe', async () => {
      mockDataSource.query.mockResolvedValueOnce([]);

      await expect(service.update(999, { status: 'done' })).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
