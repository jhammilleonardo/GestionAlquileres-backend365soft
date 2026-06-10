import { quoteIdent } from '../common/utils/sql-identifier';
import { PaymentStatus } from './enums';

export interface PaymentStatusRow {
  id: number;
  tenant_id: number;
  property_id: number;
  amount: string | number;
  currency: string;
  payment_date: string | Date;
  status: PaymentStatus;
  admin_notes?: string | null;
  rejection_reason?: string | null;
}

export function paymentTable(schemaName?: string): string {
  return `${quoteIdent(schemaName || 'public')}.payments`;
}

/**
 * Extrae la primera fila de un resultado de `query(... RETURNING *)`.
 *
 * Según la sentencia, TypeORM puede devolver las filas planas (`[row, ...]`)
 * o un resultado estructurado (`[rows, affectedCount]`). Sin esta
 * normalización, `result[0]` puede ser el array de filas en vez del objeto,
 * lo que hacía que aprobar/rechazar un pago devolviera `[{...}]` en lugar de
 * `{...}` y la UI no reflejara el cambio de estado.
 */
export function firstReturnedRow<T>(result: unknown): T | undefined {
  if (!Array.isArray(result)) return undefined;
  const first: unknown = result[0];
  return (Array.isArray(first) ? first[0] : first) as T | undefined;
}
