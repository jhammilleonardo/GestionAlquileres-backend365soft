# Notifications Module

## Responsabilidad

Gestionar notificaciones in-app por tenant.

## Archivos Clave

- `src/notifications/notifications.module.ts`
- `src/notifications/notifications.controller.ts`
- `src/notifications/notifications.service.ts`
- `src/notifications/entities/`
- `src/notifications/dto/`

## Endpoints

- `GET /:slug/notifications`
- `GET /:slug/notifications/stats`
- `PATCH /:slug/notifications/read-all`
- `GET /:slug/notifications/:id`
- `PATCH /:slug/notifications/:id/read`
- `DELETE /:slug/notifications/:id`

## Reglas

- Notificaciones usan schema tenant.
- El usuario solo ve sus notificaciones.
- Notificaciones cross-service deben usar APIs con schema explicito.

