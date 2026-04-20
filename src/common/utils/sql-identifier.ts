/**
 * Escapa un identificador SQL (nombre de schema, tabla, columna o tipo)
 * siguiendo las reglas de PostgreSQL: comillas dobles + duplicar las
 * comillas dobles que aparezcan dentro del literal.
 *
 * Equivalente a la función `quote_ident` de PostgreSQL.
 *
 * Uso:
 *   await dataSource.query(
 *     `CREATE SCHEMA IF NOT EXISTS ${quoteIdent(schemaName)}`,
 *   );
 *
 * Además valida que el identificador cumpla con el formato permitido
 * (`tenant_<slug>` en minúsculas, dígitos y guión bajo) como defensa en
 * profundidad por si la validación del DTO se pasara por alto.
 */
const SAFE_IDENT_REGEX = /^[a-z_][a-z0-9_]{0,62}$/;

export function quoteIdent(ident: string): string {
  if (typeof ident !== 'string' || !SAFE_IDENT_REGEX.test(ident)) {
    throw new Error(`Identificador SQL inválido: ${JSON.stringify(ident)}`);
  }
  // `SAFE_IDENT_REGEX` ya excluye comillas dobles; el doble-quoting es
  // defensivo para futuros cambios en la expresión.
  return `"${ident.replace(/"/g, '""')}"`;
}

/**
 * Deriva el `schema_name` canónico a partir de un slug ya validado.
 * No debe llamarse con un slug sin validar por `TENANT_SLUG_REGEX`.
 */
export function schemaNameFromSlug(slug: string): string {
  return `tenant_${slug.replace(/-/g, '_')}`;
}
