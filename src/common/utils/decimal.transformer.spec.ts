import { describe, it, expect } from '@jest/globals';
import { decimalTransformer } from './decimal.transformer';

describe('decimalTransformer', () => {
  // ── from (PostgreSQL → TypeScript) ───────────────────────────────────────

  describe('from', () => {
    it('convierte string numérico a number', () => {
      expect(decimalTransformer.from('1500.50')).toBe(1500.5);
    });

    it('convierte string entero a number', () => {
      expect(decimalTransformer.from('1500')).toBe(1500);
    });

    it('retorna null para null', () => {
      expect(decimalTransformer.from(null)).toBeNull();
    });

    it('retorna null para undefined', () => {
      expect(decimalTransformer.from(undefined)).toBeNull();
    });

    it('retorna null para string no numérico', () => {
      expect(decimalTransformer.from('no-es-numero')).toBeNull();
    });

    it('convierte "0" a 0', () => {
      expect(decimalTransformer.from('0')).toBe(0);
    });

    it('preserva la precisión decimal', () => {
      expect(decimalTransformer.from('99.99')).toBe(99.99);
    });

    it('convierte valores negativos', () => {
      expect(decimalTransformer.from('-250.75')).toBe(-250.75);
    });
  });

  // ── to (TypeScript → PostgreSQL) ─────────────────────────────────────────

  describe('to', () => {
    it('pasa el número sin modificar', () => {
      expect(decimalTransformer.to(1500.5)).toBe(1500.5);
    });

    it('pasa null sin modificar', () => {
      expect(decimalTransformer.to(null)).toBeNull();
    });

    it('pasa undefined sin modificar', () => {
      expect(decimalTransformer.to(undefined)).toBeUndefined();
    });

    it('pasa cero sin modificar', () => {
      expect(decimalTransformer.to(0)).toBe(0);
    });
  });
});
