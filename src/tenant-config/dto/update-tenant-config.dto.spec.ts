import { validate } from 'class-validator';
import { UpdateTenantConfigDto } from './update-tenant-config.dto';

describe('UpdateTenantConfigDto', () => {
  it.each([
    'America/New_York',
    'America/Denver',
    'America/Phoenix',
    'America/Anchorage',
    'Pacific/Honolulu',
    'Pacific/Guam',
  ])('acepta la zona IANA %s', async (timezone) => {
    const dto = Object.assign(new UpdateTenantConfigDto(), { timezone });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('rechaza una zona horaria arbitraria', async () => {
    const dto = Object.assign(new UpdateTenantConfigDto(), {
      timezone: 'Estados Unidos / Hora central',
    });

    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'timezone')).toBe(true);
  });
});
