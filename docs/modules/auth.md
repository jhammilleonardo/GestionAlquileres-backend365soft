# Auth Module

## Responsabilidad

Autenticacion de admins, empleados, inquilinos y propietarios.

## Archivos Clave

- `src/auth/auth.module.ts`
- `src/auth/auth.controller.ts`
- `src/auth/auth.service.ts`
- `src/auth/auth-security.service.ts`
- `src/auth/strategies/`
- `src/auth/dto/`

## Endpoints

- `POST /auth/register-admin`
- `POST /auth/login-admin`
- `POST /auth/:slug/login`
- `POST /auth/:slug/register`
- `POST /auth/:slug/owner/login`
- `GET /auth/me`

## Reglas

- Validar tenant del JWT contra slug de URL.
- Registrar eventos de auth relevantes.
- Aplicar lockout por cuenta/contexto.
- Nunca devolver password hash.

