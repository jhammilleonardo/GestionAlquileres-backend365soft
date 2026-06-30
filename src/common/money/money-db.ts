import { normalizeCurrency } from './currency';

/** Firma mínima de un ejecutor de queries (DataSource o QueryRunner). */
export type Querier = <T = unknown>(
  sql: string,
  params?: unknown[],
) => Promise<T>;

/** Moneda de respaldo cuando el tenant aún no tiene config (no debería pasar). */
const FALLBACK_CURRENCY = 'USD';

/**
 * Resuelve la moneda configurada del tenant (`tenant_config.currency`). Punto
 * único para que todo cálculo monetario construya `Money` con la moneda correcta
 * en vez de asumir una. `schemaQualified=false` cuando el search_path ya apunta
 * al schema del tenant (caso normal dentro de un request).
 */
export async function resolveTenantCurrency(
  query: Querier,
  schemaQualifiedTable = 'tenant_config',
): Promise<string> {
  const rows = await query<Array<{ currency: string | null }>>(
    `SELECT currency FROM ${schemaQualifiedTable} LIMIT 1`,
  );
  const currency = rows[0]?.currency;
  return currency ? normalizeCurrency(currency) : FALLBACK_CURRENCY;
}
