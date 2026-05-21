# Maintenance, Inspections Y Vendors

## Responsabilidad

Gestionar solicitudes de mantenimiento, mensajes, adjuntos, etapas, tecnicos,
proveedores, inspecciones y PDFs.

## Componentes

- `MaintenanceService`: fachada.
- `MaintenanceCreationService`: creacion con archivos y notificacion.
- `MaintenanceUpdateService`: update de solicitud.
- `MaintenanceLookupService`: consultas.
- `MaintenanceMessagesService`: mensajes y adjuntos.
- `MaintenanceMessageNotificationsService`: notificaciones de mensajes.
- `MaintenanceStageService`: pipeline de etapas.
- `MaintenanceStatsService`: metricas.
- `MaintenanceVendorsService`: asignacion/calificacion de proveedores.
- `InspectionsService`: inspecciones.
- `InspectionPhotosService`: fotos.
- `InspectionPdfService`: PDFs.
- `VendorsService`: catalogo y tracking de proveedores.

## Endpoints Principales

- `/:slug/admin/maintenance`
- `/:slug/admin/maintenance/:id/messages`
- `/:slug/admin/maintenance/:id/stage`
- `/:slug/admin/maintenance/:id/assign-vendor`
- `/:slug/tenant/maintenance`
- `/:slug/tenant/maintenance/:id/upload`
- `/:slug/tecnico/maintenance`
- `/:slug/admin/inspections`
- `/:slug/admin/vendors`

## Reglas

- Adjuntos deben compensarse si falla DB.
- Mensajes respetan visibilidad por rol.
- Owner solo puede autorizar mantenimiento de sus propiedades.
- Tecnico solo trabaja sobre solicitudes asignadas.
- El flujo de etapas debe mantener historial.

