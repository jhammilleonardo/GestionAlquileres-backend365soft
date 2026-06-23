/** Roles con acceso de staff dentro de un tenant. */
const STAFF_ROLES: ReadonlySet<string> = new Set([
  'SUPERADMIN',
  'ADMIN',
  'EMPLEADO',
]);

interface RequesterContext {
  role?: string;
  tenantSlug?: string;
}

/**
 * True si el usuario autenticado es staff (admin/empleado) del propio tenant del
 * `slug`. Se usa en endpoints públicos con auth opcional para mostrar contenido
 * no publicado únicamente a su dueño (p. ej. el preview del editor del sitio).
 */
export function isStaffOfTenant(
  user: RequesterContext | undefined,
  slug: string,
): boolean {
  return (
    !!user &&
    !!user.role &&
    STAFF_ROLES.has(user.role) &&
    user.tenantSlug === slug
  );
}
