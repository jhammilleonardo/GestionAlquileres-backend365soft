# Units Module

## Responsabilidad

Gestionar unidades dentro de propiedades y exponer unidades disponibles al
catalogo publico.

## Archivos Clave

- `src/units/units.module.ts`
- `src/units/units.controller.ts`
- `src/units/units.service.ts`
- `src/units/entities/`
- `src/units/dto/`

## Endpoints

- `GET /:slug/admin/properties/:propertyId/units`
- `POST /:slug/admin/properties/:propertyId/units`
- `PATCH /:slug/admin/properties/:propertyId/units/:unitId`
- `DELETE /:slug/admin/properties/:propertyId/units/:unitId`
- `GET /:slug/catalog/properties/:propertyId/units`

## Reglas

- Validar que la unidad pertenezca a la propiedad del tenant.
- No exponer unidades no publicables en catalogo.
- Mantener consistencia de estado con reservas y contratos.

