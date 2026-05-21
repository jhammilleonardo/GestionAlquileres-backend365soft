# Properties Module

## Responsabilidad

Gestionar propiedades, direcciones, owners, imagenes, busqueda admin y catalogo
publico.

## Archivos Clave

- `src/properties/properties.module.ts`
- `src/properties/properties.controller.ts`
- `src/properties/public-catalog.controller.ts`
- `src/properties/properties.service.ts`
- `src/properties/property-*.service.ts`
- `src/properties/dto/`
- `src/properties/entities/`

## Endpoints

- `/:slug/admin/properties`
- `/:slug/admin/properties/:id`
- `/:slug/admin/properties/:id/images`
- `/:slug/admin/properties/:id/owners`
- `/:slug/catalog/properties`
- `/:slug/catalog/properties/:id`
- `/:slug/catalog/properties/:id/contact`
- `/:slug/tenant/properties`
- `/:slug/owner/properties/:propertyId/statements/:statementId/pdf`

## Reglas

- Crear/actualizar propiedades dentro de transaccion.
- Ownership maximo 100% y un owner primario.
- Catalogo publico no expone datos privados.
- Archivos deben compensarse si falla persistencia.

