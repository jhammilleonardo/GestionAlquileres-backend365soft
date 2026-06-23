import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { getDataSourceToken } from '@nestjs/typeorm';
import { IcalService } from './ical.service';

describe('IcalService', () => {
  let service: IcalService;
  const mockDataSource = { query: jest.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IcalService,
        { provide: getDataSourceToken(), useValue: mockDataSource },
      ],
    }).compile();

    service = module.get(IcalService);
    jest.resetAllMocks();
  });

  it('genera el .ics con reservas y bloqueos de la unidad', async () => {
    mockDataSource.query
      .mockResolvedValueOnce([{ unit_number: 'A1' }]) // unidad existe
      .mockResolvedValueOnce([
        { id: 5, checkin: '2026-06-10', checkout: '2026-06-15' },
      ]) // reservas
      .mockResolvedValueOnce([{ start: '2026-07-01', end: '2026-07-02' }]); // bloqueos

    const ics = await service.buildUnitCalendar(7);

    expect(ics).toContain('UID:reservation-5@365soft');
    expect(ics).toContain('DTSTART;VALUE=DATE:20260610');
    expect(ics).toContain('DTEND;VALUE=DATE:20260615');
    expect(ics).toContain('UID:block-7-2026-07-01@365soft');
    expect(ics).toContain('SUMMARY:Blocked');
  });

  it('lanza NotFoundException si la unidad no existe', async () => {
    mockDataSource.query.mockResolvedValueOnce([]);

    await expect(service.buildUnitCalendar(999)).rejects.toThrow(
      NotFoundException,
    );
  });
});
