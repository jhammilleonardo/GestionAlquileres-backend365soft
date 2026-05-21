# Expenses Module

## Responsabilidad

Gestionar gastos por propiedad y resumen financiero.

## Archivos Clave

- `src/expenses/expenses.module.ts`
- `src/expenses/expenses.controller.ts`
- `src/expenses/expenses.service.ts`
- `src/expenses/entities/`
- `src/expenses/dto/`

## Endpoints

- `POST /:slug/admin/expenses`
- `GET /:slug/admin/expenses`
- `GET /:slug/admin/expenses/summary`
- `GET /:slug/admin/expenses/:id`
- `PATCH /:slug/admin/expenses/:id`
- `DELETE /:slug/admin/expenses/:id`

## Reglas

- Validar propiedad dentro del tenant.
- Resumen debe coincidir con P&L.
- Recurrencias no deben duplicarse accidentalmente.

