# Seguridad

## Autenticacion

- JWT para admins, empleados, inquilinos y propietarios.
- Lockout por cuenta en `AuthSecurityService`.
- Eventos de seguridad en `public.auth_security_events`.
- Validacion de tenant en `TenantContextMiddleware`.

## Autorizacion

- `JwtAuthGuard` valida token.
- `RolesGuard` aplica roles.
- `PermissionsGuard` aplica permisos granulares.
- Owner portal valida ownership antes de exponer propiedades, contratos,
  mantenimiento o liquidaciones.

## Multi-Tenant

- No usar `SET search_path` en middleware.
- No usar conexiones compartidas con schema mutable.
- Usar `QueryRunner` por request.
- Usar schema calificado para operaciones cross-tenant.

## Inputs

- DTOs con `class-validator`.
- `ValidationPipe` global con whitelist y `forbidNonWhitelisted`.
- Identificadores dinamicos deben pasar por utilidades seguras como
  `quoteIdent`.

## HTTP

- Helmet activo.
- CORS por `FRONTEND_URLS`.
- Rate limiting global y estricto para endpoints sensibles.
- TLS debe terminar en proxy/plataforma en produccion.

## Archivos

- Storage local solo para desarrollo o excepcion controlada.
- Produccion debe usar S3 o equivalente.
- URLs privadas deben ser firmadas o servidas por controller con permisos.

## Secretos

- No commitear `.env`.
- Rotar JWT, DB, MC4, Stripe, PayPal, SendGrid/Twilio y AWS.
- Confirmar politica de rotacion antes de produccion.

