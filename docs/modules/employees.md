# Employees Module

## Responsabilidad

Gestionar empleados administrativos y permisos granulares.

## Archivos Clave

- `src/employees/employees.module.ts`
- `src/employees/employees.controller.ts`
- `src/employees/employees.service.ts`
- `src/employees/dto/`

## Endpoints

- `GET /:slug/admin/employees`
- `POST /:slug/admin/employees`
- `PATCH /:slug/admin/employees/:id`
- `PATCH /:slug/admin/employees/:id/permissions`
- `DELETE /:slug/admin/employees/:id`
- `GET /:slug/admin/employees/my-permissions`

## Reglas

- Cambios de permisos deben auditarse.
- No permitir escalacion de privilegios sin rol/permiso adecuado.
- Empleados desactivados no deben conservar acceso efectivo.

