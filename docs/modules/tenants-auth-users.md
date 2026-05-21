# Tenants, Auth Y Usuarios

## Responsabilidad

Gestionar tenants, autenticacion, usuarios, empleados, permisos y contexto
multi-tenant.

## Componentes

- `TenantsService`: metadata y ciclo de vida del tenant.
- `TenantProvisioningService`: orquestacion de provisioning.
- `TenantStartupUpgradeService`: upgrades idempotentes al iniciar.
- `TenantContextMiddleware`: resolucion y validacion de tenant por request.
- `TenantConnectionInterceptor`: `search_path` seguro por request.
- `AuthService`: login, registro, owner login y `me`.
- `AuthSecurityService`: lockout y eventos de autenticacion.
- `UsersService`: consultas de usuarios.
- `EmployeesService`: empleados y permisos.

## Endpoints Principales

- `POST /auth/register-admin`
- `POST /auth/login-admin`
- `POST /auth/:slug/login`
- `POST /auth/:slug/register`
- `POST /auth/:slug/owner/login`
- `GET /auth/me`
- `GET /tenants`
- `GET /:slug/users`
- `GET /:slug/admin/employees`

## Reglas

- El token debe coincidir con el tenant de la URL.
- `register-admin` crea tenant, schema, admin y configuracion base.
- Empleados usan permisos granulares ademas del rol.
- Cambios sensibles generan audit/security events.

