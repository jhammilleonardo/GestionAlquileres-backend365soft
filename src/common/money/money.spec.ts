import fc from 'fast-check';
import { Money } from './money';
import { allocate } from './allocate';

describe('Money', () => {
  describe('exactitud (sin errores de float)', () => {
    it('0.10 + 0.20 === 0.30 exacto', () => {
      const result = Money.of('0.10', 'USD').add(Money.of('0.20', 'USD'));
      expect(result.toString()).toBe('0.30');
    });

    it('suma encadenada de centavos no acumula error', () => {
      let acc = Money.zero('USD');
      for (let i = 0; i < 1000; i++) {
        acc = acc.add(Money.of('0.01', 'USD'));
      }
      expect(acc.toString()).toBe('10.00');
    });

    it('0.1 * 3 === 0.30 (no 0.30000000000000004)', () => {
      expect(Money.of('0.1', 'USD').multiply(3).toString()).toBe('0.30');
    });
  });

  describe('round-trip y unidades mínimas', () => {
    it('fromMinorUnits ↔ toMinorUnits', () => {
      expect(Money.fromMinorUnits(123456, 'USD').toString()).toBe('1234.56');
      expect(Money.of('1234.56', 'USD').toMinorUnits()).toBe(123456);
    });

    it('respeta escala 0 (JPY) y 3 (KWD)', () => {
      expect(Money.of('1000', 'JPY').toMinorUnits()).toBe(1000);
      expect(Money.of('1.500', 'KWD').toMinorUnits()).toBe(1500);
      expect(Money.of('1000.4', 'JPY').toString()).toBe('1000');
    });

    it('fromDb maneja null/vacío como cero', () => {
      expect(Money.fromDb(null, 'USD').toString()).toBe('0.00');
      expect(Money.fromDb('', 'USD').toString()).toBe('0.00');
      expect(Money.fromDb('99.99', 'USD').toString()).toBe('99.99');
    });
  });

  describe('redondeo HALF_UP en la escala de la moneda', () => {
    it('0.005 → 0.01', () => {
      expect(Money.of('0.005', 'USD').toString()).toBe('0.01');
    });
    it('2.345 → 2.35', () => {
      expect(Money.of('2.345', 'USD').toString()).toBe('2.35');
    });
  });

  describe('porcentajes', () => {
    it('mora 2% de 1000.00 = 20.00', () => {
      expect(Money.of('1000.00', 'BOB').percentage(2).toString()).toBe('20.00');
    });
    it('comisión 8.5% de 1234.56 = 104.94 (105.0376 → HALF_UP)', () => {
      expect(
        Money.of('1234.56', 'USD').percentage('8.5').round().toString(),
      ).toBe('104.94');
    });
  });

  describe('guardas', () => {
    it('rechaza operar monedas distintas', () => {
      expect(() => Money.of('1', 'USD').add(Money.of('1', 'BOB'))).toThrow();
    });
    it('rechaza montos no finitos', () => {
      expect(() => Money.of('not-a-number', 'USD')).toThrow();
      expect(() => Money.of(Infinity, 'USD')).toThrow();
    });
  });

  describe('comparadores', () => {
    it('isNegative / isPositive / isZero', () => {
      expect(Money.of('-1', 'USD').isNegative()).toBe(true);
      expect(Money.of('1', 'USD').isPositive()).toBe(true);
      expect(Money.zero('USD').isZero()).toBe(true);
      expect(Money.of('0.00', 'USD').isNegative()).toBe(false);
    });
  });
});

describe('allocate (reparto de resto)', () => {
  it('reparte 100.00 en 3 partes iguales sin perder centavos', () => {
    const parts = allocate(Money.of('100.00', 'USD'), [1, 1, 1]);
    expect(parts.map((p) => p.toString())).toEqual(['33.34', '33.33', '33.33']);
    expect(Money.sum(parts).toString()).toBe('100.00');
  });

  it('reparte por porcentajes de propiedad (33.33/33.33/33.34)', () => {
    const parts = allocate(Money.of('1000.01', 'USD'), [33.33, 33.33, 33.34]);
    expect(Money.sum(parts).toString()).toBe('1000.01');
  });

  it('un solo beneficiario recibe todo', () => {
    const parts = allocate(Money.of('77.77', 'USD'), [1]);
    expect(parts[0].toString()).toBe('77.77');
  });

  it('maneja montos negativos (reembolsos) cuadrando exacto', () => {
    const parts = allocate(Money.of('-100.00', 'USD'), [1, 1, 1]);
    expect(Money.sum(parts).toString()).toBe('-100.00');
  });

  // ─── Property-based: las invariantes que un banco exige ──────────────────────

  it('PROP: la suma de las partes SIEMPRE es igual al total', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -10_000_000, max: 10_000_000 }), // total en centavos
        fc.array(fc.integer({ min: 1, max: 1000 }), {
          minLength: 1,
          maxLength: 12,
        }),
        (totalMinor, ratios) => {
          const total = Money.fromMinorUnits(totalMinor, 'USD');
          const parts = allocate(total, ratios);
          expect(parts.length).toBe(ratios.length);
          expect(Money.sum(parts).toMinorUnits()).toBe(totalMinor);
        },
      ),
      { numRuns: 2000 },
    );
  });

  it('PROP: ninguna parte difiere de su ideal por más de 1 centavo', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 10_000_000 }),
        fc.array(fc.integer({ min: 1, max: 1000 }), {
          minLength: 1,
          maxLength: 8,
        }),
        (totalMinor, ratios) => {
          const total = Money.fromMinorUnits(totalMinor, 'USD');
          const parts = allocate(total, ratios);
          const ratioSum = ratios.reduce((a, b) => a + b, 0);
          parts.forEach((part, i) => {
            const ideal = (totalMinor * ratios[i]) / ratioSum;
            const diff = Math.abs(part.toMinorUnits() - ideal);
            expect(diff).toBeLessThan(1 + 1e-9);
          });
        },
      ),
      { numRuns: 2000 },
    );
  });
});
