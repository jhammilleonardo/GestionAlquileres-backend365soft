# Inspections Module

## Responsabilidad

Gestionar inspecciones, items, fotos, comparaciones y PDFs.

## Archivos Clave

- `src/inspections/inspections.module.ts`
- `src/inspections/inspections.controller.ts`
- `src/inspections/inspections.service.ts`
- `src/inspections/inspection-photos.service.ts`
- `src/inspections/inspection-pdf.service.ts`
- `src/inspections/dto/`

## Endpoints

- `POST /:slug/admin/inspections`
- `GET /:slug/admin/inspections`
- `GET /:slug/admin/inspections/compare`
- `GET /:slug/admin/inspections/:id`
- `PATCH /:slug/admin/inspections/:id/items`
- `POST /:slug/admin/inspections/:id/photos`
- `GET /:slug/admin/inspections/:id/pdf`

## Reglas

- Validar propiedad/contrato dentro del tenant.
- Fotos por storage con compensacion.
- PDFs no deben exponer datos de otro tenant.

