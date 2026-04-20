/**
 * Reglas de validación de identificadores de tenant.
 *
 * El `slug` se usa para derivar `schema_name` en PostgreSQL (`tenant_<slug>`)
 * y se interpola en sentencias DDL/DML. Cualquier carácter fuera del
 * alfabeto permitido abre la puerta a inyección SQL.
 *
 * Mantener esta regex sincronizada con `quoteIdent()` en `sql-identifier.ts`.
 */
export const TENANT_SLUG_REGEX = /^[a-z][a-z0-9-]{2,49}$/;

/**
 * Palabras reservadas que no pueden usarse como slug porque colisionan
 * con rutas internas del backend o con schemas del sistema de PostgreSQL.
 */
export const RESERVED_TENANT_SLUGS: ReadonlySet<string> = new Set([
  'admin',
  'api',
  'assets',
  'auth',
  'docs',
  'health',
  'i18n',
  'login',
  'portal',
  'public',
  'publico',
  'register',
  'static',
  'storage',
  'uploads',
  'www',
]);

export function isValidTenantSlug(value: string): boolean {
  return TENANT_SLUG_REGEX.test(value) && !RESERVED_TENANT_SLUGS.has(value);
}
