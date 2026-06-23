import { resolveStayPricing, SeasonRule } from './season-pricing';

function season(overrides: Partial<SeasonRule>): SeasonRule {
  return {
    start_date: '2026-12-20',
    end_date: '2026-12-31',
    price_per_night: 150,
    min_nights: 3,
    ...overrides,
  };
}

describe('resolveStayPricing', () => {
  it('usa el precio base cuando no hay temporadas', () => {
    const stay = resolveStayPricing('2026-06-10', 3, 80, 2, []);
    expect(stay.nightlyPrices).toEqual([80, 80, 80]);
    expect(stay.effectiveMinNights).toBe(2);
  });

  it('aplica el precio de la temporada en las noches que caen dentro', () => {
    // estadía 2026-12-19 → 21 (3 noches: 19, 20, 21); temporada cubre 20–31
    const stay = resolveStayPricing('2026-12-19', 3, 80, 2, [season({})]);
    expect(stay.nightlyPrices).toEqual([80, 150, 150]);
  });

  it('las noches mínimas las dicta la temporada del check-in', () => {
    const stay = resolveStayPricing('2026-12-20', 4, 80, 2, [season({})]);
    expect(stay.effectiveMinNights).toBe(3);
  });

  it('si la temporada no fija precio, mantiene el base pero sí su min_nights', () => {
    const stay = resolveStayPricing('2026-12-20', 2, 80, 2, [
      season({ price_per_night: null, min_nights: 5 }),
    ]);
    expect(stay.nightlyPrices).toEqual([80, 80]);
    expect(stay.effectiveMinNights).toBe(5);
  });
});
