# Owner Statements Module

## Responsabilidad

Crear, consultar, actualizar, transferir, eliminar y generar PDFs de
liquidaciones de propietarios.

## Archivos Clave

- `src/owner-statements/owner-statements.module.ts`
- `src/owner-statements/owner-statements.controller.ts`
- `src/owner-statements/owner-statements.service.ts`
- `src/owner-statements/owner-statement-pdf.service.ts`
- `src/owner-statements/dto/`
- `src/owner-statements/entities/`

## Endpoints

- `/:slug/admin/owner-statements`
- `/:slug/admin/owner-statements/:id`
- `/:slug/admin/owner-statements/:id/pdf`
- `/:slug/admin/owner-statements/:id/mark-transferred`

## Reglas

- PDFs deben validar tenant y ownership cuando se acceden desde owner portal.
- Liquidaciones transferidas no deben mutarse sin regla explicita.
- Calculos financieros deben ser reproducibles.

