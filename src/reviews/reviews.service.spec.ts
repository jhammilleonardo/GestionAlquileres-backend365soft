import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { getDataSourceToken } from '@nestjs/typeorm';
import { ReviewsService } from './reviews.service';

describe('ReviewsService', () => {
  let service: ReviewsService;
  const mockDataSource = { query: jest.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReviewsService,
        { provide: getDataSourceToken(), useValue: mockDataSource },
      ],
    }).compile();

    service = module.get(ReviewsService);
    jest.resetAllMocks();
  });

  const completedReservation = {
    tenant_id: 42,
    status: 'completed',
    property_id: 3,
    unit_id: 7,
  };

  it('crea una reseña para una reserva completada propia', async () => {
    mockDataSource.query
      .mockResolvedValueOnce([completedReservation]) // findReservationForReview
      .mockResolvedValueOnce([{ id: 1, rating: 5 }]); // INSERT

    const result = await service.createForReservation(9, 42, {
      rating: 5,
      comment: 'Genial',
    });

    expect(result.rating).toBe(5);
    // El INSERT toma property_id/unit_id de la reserva, no del cliente.
    const insertCall = mockDataSource.query.mock.calls[1] as [
      string,
      unknown[],
    ];
    expect(insertCall[1][2]).toBe(3); // property_id
    expect(insertCall[1][3]).toBe(7); // unit_id
  });

  it('rechaza si la reserva no es del huésped', async () => {
    mockDataSource.query.mockResolvedValueOnce([
      { ...completedReservation, tenant_id: 99 },
    ]);

    await expect(
      service.createForReservation(9, 42, { rating: 5 }),
    ).rejects.toThrow(NotFoundException);
  });

  it('rechaza si la reserva no está completada', async () => {
    mockDataSource.query.mockResolvedValueOnce([
      { ...completedReservation, status: 'confirmed' },
    ]);

    await expect(
      service.createForReservation(9, 42, { rating: 5 }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rechaza una segunda reseña (unique violation) con Conflict', async () => {
    mockDataSource.query
      .mockResolvedValueOnce([completedReservation])
      .mockRejectedValueOnce({ code: '23505' });

    await expect(
      service.createForReservation(9, 42, { rating: 4 }),
    ).rejects.toThrow(ConflictException);
  });

  it('calcula el rating agregado de una propiedad', async () => {
    mockDataSource.query.mockResolvedValueOnce([{ average: 4.5, count: 8 }]);

    const result = await service.getPropertyRating(3);

    expect(result).toEqual({ average: 4.5, count: 8 });
  });

  it('devuelve rating 0 si la propiedad no tiene reseñas', async () => {
    mockDataSource.query.mockResolvedValueOnce([{ average: 0, count: 0 }]);

    const result = await service.getPropertyRating(3);

    expect(result).toEqual({ average: 0, count: 0 });
  });
});
