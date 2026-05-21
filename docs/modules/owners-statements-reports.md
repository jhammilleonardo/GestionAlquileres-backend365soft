# Owners, Statements Y Reports

## Responsabilidad

Gestionar propietarios, portal de propietarios, liquidaciones, PDFs y reportes
administrativos.

## Componentes

- `RentalOwnersService`: propietarios y cuentas.
- `OwnerPortalService`: dashboard owner, propiedades, contratos,
  mantenimiento y liquidaciones.
- `OwnerStatementsService`: liquidaciones.
- `OwnerStatementPdfService`: PDF de liquidacion.
- `ReportsService`: reportes.
- `ReportsExportService`: Excel/PDF.

## Endpoints Principales

- `/:slug/admin/rental-owners`
- `/:slug/admin/rental-owners/:id/properties`
- `/:slug/admin/owner-statements`
- `/:slug/admin/owner-statements/:id/pdf`
- `/:slug/owner/dashboard`
- `/:slug/owner/properties`
- `/:slug/owner/statements`
- `/:slug/owner/maintenance`
- `/:slug/admin/reports/rent-roll`
- `/:slug/admin/reports/vacancies`
- `/:slug/admin/reports/delinquency`
- `/:slug/admin/reports/pnl`
- `/:slug/admin/reports/kpis`

## Reglas

- Owner portal valida ownership en cada consulta sensible.
- Un owner no puede ver liquidaciones, PDFs ni mantenimiento de otro owner.
- Reportes usan datos del schema tenant activo.
- Exportaciones deben usar DTOs/schemas documentados.

