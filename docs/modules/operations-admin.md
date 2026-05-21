# Operaciones Administrativas

## Expenses

Responsabilidad: gastos por propiedad, resumen y P&L.

Endpoints:

- `/:slug/admin/expenses`
- `/:slug/admin/expenses/summary`

Reglas:

- Gastos pertenecen al tenant activo.
- Relacionar gasto con propiedad valida.
- Recurrencias deben mantenerse idempotentes.

## Blacklist

Responsabilidad: bloqueo y consulta de inquilinos vetados.

Endpoints:

- `/:slug/admin/blacklist`
- `/:slug/blacklist/check`

Reglas:

- La consulta publica no debe filtrar informacion sensible innecesaria.
- Cambios admin deben dejar audit log.

## Notifications

Responsabilidad: notificaciones in-app y lifecycle.

Endpoints:

- `/:slug/notifications`
- `/:slug/notifications/read-all`

Reglas:

- Notificaciones tenant usan schema calificado.
- Canales externos pasan por adapters.
- No inventar email/telefono si el usuario no tiene contacto.

## Tenant Config Y Website

Responsabilidad: configuracion operativa del tenant y sitio publico.

Endpoints:

- `/:slug/admin/config`
- `/:slug/admin/website`
- `/public/:subdomain`

Reglas:

- Configuracion sensible no debe exponerse completa al frontend.
- Public website solo expone informacion publica.

## Audit Logs

Responsabilidad: trazabilidad de acciones administrativas.

Endpoint:

- `/:slug/admin/audit-logs`

Reglas:

- Cambios sensibles deben registrar actor, accion, entidad y metadata minima.

## Violations

Responsabilidad: infracciones, notificacion y PDF.

Endpoint:

- `/:slug/admin/violations`

Reglas:

- PDFs se generan via servicio dedicado.
- Cambios de estado deben ser auditables.

