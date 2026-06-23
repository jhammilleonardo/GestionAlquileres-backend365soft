import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { getDataSourceToken } from '@nestjs/typeorm';
import { CalendarSyncService } from './calendar-sync.service';
import { SafeHttpClientService } from '../../common/http/safe-http-client.service';

const ICS = [
  'BEGIN:VEVENT',
  'DTSTART;VALUE=DATE:20260610',
  'DTEND;VALUE=DATE:20260615',
  'END:VEVENT',
].join('\r\n');

describe('CalendarSyncService', () => {
  let service: CalendarSyncService;
  const mockDataSource = { query: jest.fn() };
  const mockSafeHttp = { getCalendarText: jest.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CalendarSyncService,
        { provide: getDataSourceToken(), useValue: mockDataSource },
        { provide: SafeHttpClientService, useValue: mockSafeHttp },
      ],
    }).compile();

    service = module.get(CalendarSyncService);
    jest.resetAllMocks();
  });

  it('sincroniza: descarga, parsea y bloquea las noches ocupadas', async () => {
    mockDataSource.query
      .mockResolvedValueOnce([
        {
          id: 1,
          unit_id: 7,
          url: 'https://calendar.example.com/c.ics',
          property_id: 3,
        },
      ]) // findSource
      .mockResolvedValueOnce(undefined) // releaseBlocks
      .mockResolvedValueOnce(
        [
          '2026-06-10',
          '2026-06-11',
          '2026-06-12',
          '2026-06-13',
          '2026-06-14',
        ].map((date) => ({ date })),
      ) // INSERT generate_series → 5 noches
      .mockResolvedValueOnce(undefined); // markSynced
    mockSafeHttp.getCalendarText.mockResolvedValue(ICS);

    const blocked = await service.syncSource('tenant_acme', 1);

    expect(blocked).toBe(5);
    // No pisa reservas: el upsert sólo bloquea fechas 'available'.
    const insert = mockDataSource.query.mock.calls[2] as [string, unknown[]];
    expect(insert[0]).toContain("status = 'available'");
  });

  it('lanza NotFound si la fuente no existe', async () => {
    mockDataSource.query.mockResolvedValueOnce([]); // findSource vacío

    await expect(service.syncSource('tenant_acme', 999)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('al eliminar libera los bloqueos importados antes de borrar', async () => {
    mockDataSource.query
      .mockResolvedValueOnce(undefined) // releaseBlocks
      .mockResolvedValueOnce([{ id: 5 }]); // DELETE RETURNING

    await service.removeSource('tenant_acme', 7, 5);

    const release = mockDataSource.query.mock.calls[0] as [string, unknown[]];
    expect(release[0]).toContain('sync_source_id = $1');
  });

  it('lanza NotFound al eliminar una fuente inexistente', async () => {
    mockDataSource.query
      .mockResolvedValueOnce(undefined) // releaseBlocks
      .mockResolvedValueOnce([]); // DELETE sin filas

    await expect(service.removeSource('tenant_acme', 7, 999)).rejects.toThrow(
      NotFoundException,
    );
  });
});
