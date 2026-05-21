# Tenant Website Module

## Responsabilidad

Gestionar configuracion del sitio publico del tenant y formularios publicos.

## Archivos Clave

- `src/tenant-website/tenant-website.module.ts`
- `src/tenant-website/tenant-website.controller.ts`
- `src/tenant-website/public-website.controller.ts`
- `src/tenant-website/tenant-website.service.ts`
- `src/tenant-website/dto/`

## Endpoints

- `GET /:slug/admin/website`
- `PATCH /:slug/admin/website`
- `PATCH /:slug/admin/website/publish`
- `GET /public/:subdomain`
- `POST /public/:subdomain/contact`

## Reglas

- Publicar solo datos publicos.
- Validar subdominio.
- Contact forms deben tener rate limiting y validacion fuerte.

