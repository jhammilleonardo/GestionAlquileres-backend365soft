# Blacklist Module

## Responsabilidad

Registrar y consultar inquilinos bloqueados, incluyendo auditoria.

## Archivos Clave

- `src/blacklist/blacklist.module.ts`
- `src/blacklist/blacklist.controller.ts`
- `src/blacklist/blacklist.service.ts`
- `src/blacklist/entities/`
- `src/blacklist/dto/`

## Endpoints

- `POST /:slug/admin/blacklist`
- `GET /:slug/admin/blacklist`
- `DELETE /:slug/admin/blacklist/:id`
- `GET /:slug/admin/blacklist/audit/log`
- `GET /:slug/blacklist/check`
- `POST /:slug/blacklist/check`

## Reglas

- No exponer mas datos de los necesarios en checks publicos.
- Cambios admin deben quedar auditados.
- Validar documento/email de forma normalizada.

