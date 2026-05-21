# Properties, Catalogo, Unidades Y Reservas

## Responsabilidad

Administrar propiedades, owners, direcciones, imagenes, catalogo publico,
unidades y disponibilidad.

## Componentes

- `PropertiesService`: fachada.
- `PropertyCreationService`: creacion transaccional.
- `PropertyUpdateService`: actualizacion transaccional.
- `PropertySearchService`: listado admin optimizado.
- `PropertyLookupService`: detalle.
- `PropertyDetailsService`: detalles e imagenes.
- `PropertyOwnersService`: asignacion de owners.
- `PropertyOwnershipValidationService`: reglas de ownership.
- `PropertyPublicCatalogService`: catalogo publico.
- `PropertyPublicCatalogQueryService`: filtros y ordenamiento publico.
- `UnitsService`: unidades.
- `ReservationsService`: disponibilidad y reservas.

## Endpoints Principales

- `/:slug/admin/properties`
- `/:slug/admin/properties/:id`
- `/:slug/admin/properties/:id/images`
- `/:slug/admin/properties/:id/owners`
- `/:slug/catalog/properties`
- `/:slug/catalog/properties/:id`
- `/:slug/catalog/properties/:id/contact`
- `/:slug/admin/properties/:propertyId/units`
- `/:slug/catalog/properties/:propertyId/units`
- `/:slug/tenant/reservations`

## Reglas

- Alta y update de propiedad son transaccionales.
- Ownership no puede superar 100%.
- Solo puede existir un owner primario por propiedad.
- Catalogo publico expone DTOs controlados, no entities.
- Storage de imagenes debe compensar archivos si falla DB.

