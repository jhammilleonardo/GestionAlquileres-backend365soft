# Contracts Module

## Responsabilidad

Crear, consultar, actualizar, renovar, firmar y generar PDFs de contratos.

## Archivos Clave

- `src/contracts/contracts.module.ts`
- `src/contracts/contracts.controller.ts`
- `src/contracts/contracts.service.ts`
- `src/contracts/contract-*.service.ts`
- `src/contracts/dto/`
- `src/contracts/entities/`

## Endpoints

- `/:slug/admin/contracts`
- `/:slug/admin/contracts/:id`
- `/:slug/admin/contracts/:id/status`
- `/:slug/admin/contracts/:id/renew`
- `/:slug/admin/contracts/:id/pdf`
- `/:slug/admin/contracts/:id/history`
- `/:slug/tenant/contracts/current`
- `/:slug/tenant/contracts/:id/sign`
- `/:slug/tenant/contracts/:id/pdf`

## Reglas

- Validar inquilino, solicitud aprobada y disponibilidad.
- Bloquear contrato con `FOR UPDATE` en cambios criticos.
- Historial dentro de transaccion.
- Audit y notificaciones post-commit.
- PDFs via `ContractPdfService` y `StorageService`.

