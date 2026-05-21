# Vendors Module

## Responsabilidad

Gestionar proveedores de mantenimiento y su historial.

## Archivos Clave

- `src/vendors/vendors.module.ts`
- `src/vendors/vendors.controller.ts`
- `src/vendors/vendors.service.ts`
- `src/vendors/dto/`

## Endpoints

- `GET /:slug/admin/vendors`
- `GET /:slug/admin/vendors/:id`
- `POST /:slug/admin/vendors`
- `PATCH /:slug/admin/vendors/:id`
- `DELETE /:slug/admin/vendors/:id`
- `GET /:slug/admin/vendors/:id/history`

## Reglas

- Proveedores pertenecen al tenant.
- No eliminar si rompe historial critico sin regla explicita.
- Rating/historial deben provenir de mantenimiento real.

