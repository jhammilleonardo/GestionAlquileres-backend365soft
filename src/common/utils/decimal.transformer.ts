import { ValueTransformer } from 'typeorm';

/**
 * PostgreSQL devuelve columnas DECIMAL/NUMERIC como strings.
 * Este transformer las convierte a number al leer de la BD.
 */
export const decimalTransformer: ValueTransformer = {
  to: (value: number | null | undefined) => value,
  from: (value: string | null | undefined): number | null => {
    if (value === null || value === undefined) return null;
    const parsed = parseFloat(value);
    return isNaN(parsed) ? null : parsed;
  },
};
