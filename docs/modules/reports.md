# Reports Module

## Responsabilidad

Generar reportes administrativos y exportaciones.

## Archivos Clave

- `src/reports/reports.module.ts`
- `src/reports/reports.controller.ts`
- `src/reports/reports.service.ts`
- `src/reports/reports-export.service.ts`
- `src/reports/dto/`

## Endpoints

- `GET /:slug/admin/reports/rent-roll`
- `GET /:slug/admin/reports/vacancies`
- `GET /:slug/admin/reports/delinquency`
- `GET /:slug/admin/reports/pnl`
- `GET /:slug/admin/reports/kpis`

## Reglas

- Reportes siempre usan schema del tenant.
- Filtros deben estar tipados.
- Exportaciones deben mantener formato estable para frontend/operacion.

