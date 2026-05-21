# Rental Owners Module

## Responsabilidad

Gestionar propietarios, relacion con propiedades, contratos, liquidaciones y
cuentas de acceso owner.

## Archivos Clave

- `src/rental-owners/rental-owners.module.ts`
- `src/rental-owners/rental-owners.controller.ts`
- `src/rental-owners/rental-owners.service.ts`
- `src/rental-owners/dto/`

## Endpoints

- `/:slug/admin/rental-owners`
- `/:slug/admin/rental-owners/:id`
- `/:slug/admin/rental-owners/:id/properties`
- `/:slug/admin/rental-owners/:id/statements`
- `/:slug/admin/rental-owners/:id/contracts`
- `/:slug/admin/rental-owners/:id/create-account`

## Reglas

- Ownership se valida en `PropertiesModule`.
- Crear cuenta owner debe evitar duplicados.
- No exponer datos de otros propietarios.

