# App Module

## Responsabilidad

Modulo raiz de NestJS. Ensambla modulos de negocio, health, config,
provisioning, guards globales y middleware de tenant.

## Archivos Clave

- `src/app.module.ts`
- `src/app.controller.ts`
- `src/app.service.ts`
- `src/main.ts`

## Reglas

- Registrar modulos aqui solo cuando sean parte del backend principal.
- Mantener `ThrottlerGuard` como guard global.
- `TenantContextMiddleware` se aplica globalmente con exclusiones explicitas.
- No servir storage privado como assets estaticos.

