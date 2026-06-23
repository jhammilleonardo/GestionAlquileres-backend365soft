import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { getDataSourceToken } from '@nestjs/typeorm';
import { SeasonRulesService } from './season-rules.service';

const dto = {
  name: 'Alta',
  start_date: '2026-12-20',
  end_date: '2026-12-31',
  price_per_night: 150,
  min_nights: 3,
};

describe('SeasonRulesService', () => {
  let service: SeasonRulesService;
  const mockDataSource = { query: jest.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SeasonRulesService,
        { provide: getDataSourceToken(), useValue: mockDataSource },
      ],
    }).compile();

    service = module.get(SeasonRulesService);
    jest.resetAllMocks();
  });

  it('crea una temporada sin solape', async () => {
    mockDataSource.query
      .mockResolvedValueOnce([]) // assertNoOverlap: sin solape
      .mockResolvedValueOnce([{ id: 1, ...dto }]); // INSERT

    const result = await service.create(7, dto);
    expect(result.id).toBe(1);
  });

  it('rechaza una temporada que se solapa', async () => {
    mockDataSource.query.mockResolvedValueOnce([{ id: 9 }]); // solape

    await expect(service.create(7, dto)).rejects.toThrow(ConflictException);
  });

  it('rechaza fin anterior al inicio', async () => {
    await expect(
      service.create(7, {
        ...dto,
        start_date: '2026-12-31',
        end_date: '2026-12-20',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('elimina una temporada propia de la unidad', async () => {
    mockDataSource.query.mockResolvedValueOnce([{ id: 5 }]); // DELETE RETURNING

    await expect(service.remove(7, 5)).resolves.toBeUndefined();
  });

  it('lanza NotFound al borrar una temporada inexistente', async () => {
    mockDataSource.query.mockResolvedValueOnce([]); // nada borrado

    await expect(service.remove(7, 999)).rejects.toThrow(NotFoundException);
  });
});
