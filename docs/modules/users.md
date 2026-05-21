# Users Module

## Responsabilidad

Consultar usuarios del tenant y datos relacionados para administracion.

## Archivos Clave

- `src/users/users.controller.ts`
- `src/users/users.service.ts`
- `src/users/user.entity.ts`
- `src/users/dto/`

## Endpoints

- `GET /:slug/users`
- `GET /:slug/users/tenants`
- `GET /:slug/users/tenants/:id`

## Reglas

- Toda consulta usa tenant activo.
- No exponer campos sensibles.
- Mantener respuestas tipadas con DTOs cuando se agreguen endpoints.

