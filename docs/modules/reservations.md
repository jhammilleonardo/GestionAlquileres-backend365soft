# Reservations Module

## Responsabilidad

Gestionar disponibilidad publica, bloqueo de fechas y reservas de unidades.

## Archivos Clave

- `src/reservations/reservations.module.ts`
- `src/reservations/reservations.controller.ts`
- `src/reservations/reservations.service.ts`
- `src/reservations/dto/`

## Endpoints

- `GET /:slug/catalog/properties/:id/availability`
- `POST /:slug/admin/properties/:id/units/:unitId/block-dates`
- `POST /:slug/tenant/reservations`

## Reglas

- Evitar reservas solapadas.
- Validar propiedad/unidad dentro del tenant.
- Bloqueos admin deben reflejarse en disponibilidad publica.

