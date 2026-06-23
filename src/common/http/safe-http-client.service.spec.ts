import { BadRequestException } from '@nestjs/common';
import { SafeHttpClientService } from './safe-http-client.service';

describe('SafeHttpClientService', () => {
  const service = new SafeHttpClientService();

  beforeEach(() => jest.restoreAllMocks());

  it.each([
    'http://127.0.0.1/calendar.ics',
    'http://169.254.169.254/latest/meta-data',
    'http://10.0.0.4/calendar.ics',
    'http://[::1]/calendar.ics',
    'file:///etc/passwd',
    'https://user:secret@example.com/calendar.ics',
    'http://intranet/calendar.ics',
  ])('rechaza destinos no públicos: %s', async (url) => {
    await expect(service.getCalendarText(url)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('envía JSON con fetch nativo, timeout y sin redirecciones', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    await expect(
      service.post<{ ok: boolean }>('https://api.example.com/events', {
        event: 'test',
      }),
    ).resolves.toMatchObject({ data: { ok: true }, status: 200 });
    expect(fetchSpy).toHaveBeenCalledWith(
      new URL('https://api.example.com/events'),
      expect.objectContaining({ method: 'POST', redirect: 'error' }),
    );
  });
});
