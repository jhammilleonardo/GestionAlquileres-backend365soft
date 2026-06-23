# ADR-005: Ledger Contable Por Tenant

| Campo | Valor |
| --- | --- |
| Fecha | 2026-06-12 |
| Estado | Aceptado |

## Contexto

365Soft ya registra pagos, gastos, liquidaciones de propietarios y reportes
financieros operativos. Ese modelo es suficiente para flujos CRUD, pero no es
una base contable confiable para reportes como P&L, cash flow, owner ledger o
budget vs actual.

El sistema usa un schema PostgreSQL por tenant. Cualquier capa contable debe
respetar ese aislamiento y debe provisionarse igual que el resto de modulos:
DDL idempotente por schema, sin migraciones globales de TypeORM para tablas de
tenant.

## Decision

Se implementa un ledger contable por tenant con partida doble:

- `chart_of_accounts` como plan de cuentas base por tenant.
- `journal_entries` y `journal_lines` como fuente financiera canonica.
- `accounting_outbox` para publicar eventos contables desde pagos, gastos,
  moras y liquidaciones sin acoplar el flujo operativo al asiento.
- `accounting_schema_version` para versionar upgrades contables por tenant.

Los reportes financieros finales deben leer del ledger, no directamente de
`payments`, `expenses` u `owner_statements`.

La base inicial sera `cash basis`. El modelo guarda el campo `basis` para
permitir `accrual basis` despues sin redisenar las tablas.

## Consecuencias

Ventajas:

- Reportes financieros auditables y consistentes.
- Separacion clara entre operacion y contabilidad.
- Outbox permite reintentos si falla el asiento contable.
- El modelo escala a owner statements, cash flow, budget vs actual y cierres.

Costos:

- Cada evento financiero necesita handler contable.
- Habra estados intermedios como `PENDING_POSTING` o `POSTING_FAILED`.
- Se deben escribir tests de balance: debitos = creditos.
- El equipo debe mantener versionado contable por tenant.

## Estado Actual

Aceptado. El primer paso es provisionar las tablas, seed del plan base y
columnas de enlace contable en pagos, gastos y owner statements.
