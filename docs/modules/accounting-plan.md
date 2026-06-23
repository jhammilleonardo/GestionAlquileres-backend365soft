# Plan: Módulo de Contabilidad (Accounting) — 365Soft

> **Estado:** En implementación. ADR-005, provisioning contable y motor base de
> asientos ya creados.
> **Contexto:** Brecha #1 frente a Buildium. Buildium es, en esencia, software contable
> para property management. Hoy 365Soft tiene `payments`, `expenses`, `owner-statements`
> y `reports` como tablas operativas sueltas; **falta el libro mayor de doble partida**
> del que deberían derivar todos los reportes financieros.
>
> Este documento es la fuente de verdad del diseño. La decisión arquitectónica
> quedó registrada en **ADR-005**.

---

## 1. Decisión arquitectónica central

> **El Libro Mayor (General Ledger) es la única fuente de verdad financiera.**
> Todo movimiento de dinero del sistema (pagos, gastos, mora, liquidaciones a
> propietarios) genera un asiento de doble partida. Los reportes financieros se
> calculan DESDE el ledger, no desde tablas operativas.

Esto invierte el flujo actual: hoy `payments`/`expenses` son fuente de reportes.
Con esto, **siguen capturando la operación**, pero además **emiten un asiento contable**.

**Patrón:** Evento de dominio → posteo en el ledger (desacoplado, idempotente).

### 3 invariantes no negociables

| Invariante | Regla | Por qué |
|---|---|---|
| **Doble partida** | `SUM(debe) = SUM(haber)` en cada asiento. Se valida antes de persistir. | Integridad contable GAAP |
| **Inmutabilidad** | Un asiento *posteado* nunca se edita ni borra. Se corrige con un **asiento de reversa**. | Auditoría / cumplimiento EE.UU. |
| **Idempotencia** | Cada asiento referencia su origen (`source_type` + `source_id`). No se duplica. | Reintentos seguros, sin doble contabilización |

### Decisiones adicionales obligatorias

| Decisión | Regla |
|---|---|
| **Consistencia operacional-contable** | Un pago/gasto puede existir como operación, pero no debe alimentar reportes financieros finales hasta tener asiento `POSTED`. |
| **Outbox contable** | Todo evento financiero crítico se registra en una cola/outbox transaccional para reintentos seguros. |
| **Versionado contable por tenant** | Cada schema tenant debe saber qué versión del módulo contable tiene aplicada. |
| **Base contable inicial** | La primera versión de 365Soft usará **cash basis** para reportes financieros operativos. Se deja preparado el modelo para agregar **accrual basis** después. |
| **Reportes derivados** | P&L, balance, owner statements, cash flow y trial balance se calculan desde `journal_entries`/`journal_lines`, no desde `payments` ni `expenses`. |

> **Nota sobre cash vs accrual:**
> - `cash basis`: el ingreso se reconoce cuando el dinero se cobra.
> - `accrual basis`: el ingreso se reconoce cuando la renta se devenga, aunque no se haya cobrado.
>
> Para arrancar, `cash basis` reduce complejidad y encaja con el flujo actual de pagos manuales/QR.
> La arquitectura debe permitir agregar `accrual basis` sin romper el ledger.

---

## 2. Modelo de datos (tablas en el schema del tenant)

```
tenant_<slug>
├── chart_of_accounts        ← plan de cuentas (jerárquico)
├── journal_entries          ← cabecera del asiento (fecha, glosa, origen, estado)
├── journal_lines            ← líneas debe/haber (≥2 por asiento)
├── bank_accounts            ← cuentas bancarias del tenant (operativa / fiduciaria)
├── bank_transactions        ← transacciones importadas del banco
├── bank_reconciliations     ← cabecera de conciliación por periodo
├── accounting_periods       ← periodos contables (abierto/cerrado) — evita postear a meses cerrados
├── accounting_outbox        ← eventos financieros pendientes/reintentables
└── accounting_schema_version ← versionado del provisioning contable por tenant
```

### 2.1 `chart_of_accounts` — Plan de cuentas

| Campo | Tipo | Notas |
|---|---|---|
| `id` | SERIAL PK | |
| `code` | VARCHAR(20) UNIQUE | Ej. `1000`, `1100`, `4000` |
| `name` | VARCHAR(120) | "Caja", "Bancos", "Ingresos por renta" |
| `type` | ENUM | `ASSET, LIABILITY, EQUITY, INCOME, EXPENSE` |
| `subtype` | VARCHAR(40) NULL | `bank, accounts_receivable, security_deposit...` |
| `parent_id` | INT NULL FK self | Jerarquía |
| `is_system` | BOOLEAN | Cuentas base no borrables (sembradas en provisioning) |
| `is_active` | BOOLEAN | Soft-disable |
| `normal_balance` | ENUM(`DEBIT,CREDIT`) | Lado natural de la cuenta |
| `country_scope` | VARCHAR(2) NULL | Permite cuentas específicas por país (`US`, `BO`, `GT`, `HN`) |

> **Naturaleza contable:** ASSET/EXPENSE → saldo normal `DEBIT`;
> LIABILITY/EQUITY/INCOME → `CREDIT`. Se siembra automáticamente.

### 2.1.1 Plan de cuentas base obligatorio

| Código | Cuenta | Tipo | Subtipo | Uso |
|---|---|---|---|---|
| `1000` | Activos | ASSET | group | Cuenta padre |
| `1100` | Bancos / Caja operativa | ASSET | bank | Cobros y pagos operativos |
| `1110` | Cuenta fiduciaria / Trust Account | ASSET | trust_bank | Fondos de propietarios/inquilinos, requerido para EE.UU. |
| `1200` | Cuentas por cobrar | ASSET | accounts_receivable | Base futura para accrual |
| `1300` | Pagos anticipados de inquilinos | ASSET | tenant_prepayments | Reservas/pagos antes del devengo |
| `2000` | Pasivos | LIABILITY | group | Cuenta padre |
| `2100` | Por pagar a propietarios | LIABILITY | owner_payable | Saldo que corresponde transferir al owner |
| `2200` | Depósitos en garantía | LIABILITY | security_deposit | Depósitos reembolsables |
| `2300` | Por pagar a proveedores | LIABILITY | vendor_payable | Base para vendors/gastos no pagados |
| `3000` | Patrimonio | EQUITY | group | Cuenta padre |
| `4000` | Ingresos por renta | INCOME | rent_income | Renta mensual/noche |
| `4100` | Ingresos por mora | INCOME | late_fee_income | Late fees |
| `4200` | Comisión de administración | INCOME | management_fee_income | Comisión de la empresa |
| `4300` | Otros ingresos | INCOME | other_income | Penalidades, limpieza, extras |
| `5000` | Gastos | EXPENSE | group | Cuenta padre |
| `5200` | Gastos de mantenimiento | EXPENSE | maintenance | Mantenimiento propio/vendor |
| `5300` | Gastos de limpieza | EXPENSE | cleaning | Short-term rental |
| `5400` | Impuestos y seguros | EXPENSE | tax_insurance | Propiedad |
| `5900` | Cuenta puente / Suspense | LIABILITY | suspense | Solo para casos pendientes de clasificar |

> La cuenta `5900 Suspense` debe usarse lo mínimo posible y aparecer en reportes de excepción.
> Ningún cierre mensual debe permitirse si hay saldo pendiente en suspense.

### 2.2 `journal_entries` — Cabecera del asiento

| Campo | Tipo | Notas |
|---|---|---|
| `id` | SERIAL PK | |
| `entry_number` | VARCHAR(30) UNIQUE | Secuencia `JE-2026-000123` (reusar patrón de `contract-number.service.ts`) |
| `date` | DATE | Fecha contable (no `created_at`) |
| `memo` | TEXT | Glosa |
| `source_type` | ENUM | `PAYMENT, EXPENSE, LATE_FEE, OWNER_PAYOUT, MANUAL, REVERSAL` |
| `source_id` | INT NULL | FK lógico al registro origen (payment.id, expense.id…) |
| `status` | ENUM(`DRAFT, POSTED, VOID`) | Solo `POSTED` afecta saldos |
| `reversed_by_id` | INT NULL | Asiento que lo reversa |
| `property_id` / `unit_id` | INT NULL | Dimensión para reportes por propiedad |
| `basis` | ENUM(`CASH, ACCRUAL`) | En F1-F4 se usará `CASH`; queda preparado para futuro |
| `created_by` | INT | |
| `posted_at` | TIMESTAMP NULL | Fecha/hora real de posteo |

> **UNIQUE parcial de idempotencia:**
> `UNIQUE (source_type, source_id) WHERE source_type <> 'MANUAL'`
> → garantiza un asiento por evento operativo.

### 2.3 `journal_lines` — Líneas (corazón de la doble partida)

| Campo | Tipo |
|---|---|
| `id` | SERIAL PK |
| `journal_entry_id` | INT FK ON DELETE CASCADE |
| `account_id` | INT FK → chart_of_accounts |
| `debit` | DECIMAL(12,2) DEFAULT 0 CHECK (debit >= 0) |
| `credit` | DECIMAL(12,2) DEFAULT 0 CHECK (credit >= 0) |
| `property_id` / `unit_id` | INT NULL (dimensiones) |
| `owner_id` | INT NULL |
| `tenant_user_id` | INT NULL |
| `vendor_id` | INT NULL |
| `contract_id` | INT NULL |
| `payment_id` | INT NULL |
| `expense_id` | INT NULL |
| `memo` | TEXT NULL |

> **CHECK a nivel línea:** `(debit > 0 AND credit = 0) OR (credit > 0 AND debit = 0)`
> — una línea es debe *o* haber, nunca ambos.
> **Validación a nivel asiento (en servicio):** `SUM(debit) = SUM(credit)`.

> **Dimensiones:** Las FK opcionales en `journal_lines` no son la fuente de verdad operativa.
> Son dimensiones de análisis para reportes por propiedad, unidad, owner, inquilino, vendor y contrato.

### 2.4 `accounting_outbox` — Cola transaccional contable

| Campo | Tipo | Notas |
|---|---|---|
| `id` | SERIAL PK | |
| `event_type` | ENUM | `PAYMENT_APPROVED, EXPENSE_APPROVED, LATE_FEE_APPLIED, OWNER_PAYOUT_MARKED` |
| `source_type` | ENUM | Igual al ledger |
| `source_id` | INT | Registro origen |
| `payload` | JSONB | Snapshot mínimo para posteo |
| `status` | ENUM(`PENDING, PROCESSING, POSTED, FAILED`) | Estado de procesamiento |
| `attempts` | INT | Reintentos |
| `last_error` | TEXT NULL | Diagnóstico |
| `next_retry_at` | TIMESTAMP NULL | Backoff |
| `created_at` / `processed_at` | TIMESTAMP | |

Reglas:

- Se crea dentro de la misma transacción del evento operativo.
- El posteo debe ser idempotente por `source_type + source_id`.
- Si falla, el evento queda `FAILED`/`PENDING` y se reintenta por cron.
- Reportes financieros definitivos ignoran eventos no posteados.

### 2.5 `accounting_schema_version`

| Campo | Tipo | Notas |
|---|---|---|
| `id` | SERIAL PK | |
| `version` | VARCHAR(20) UNIQUE | Ej. `accounting-f1`, `accounting-f2` |
| `checksum` | VARCHAR(80) | Hash del SQL aplicado |
| `status` | ENUM(`APPLIED, FAILED`) | |
| `applied_at` | TIMESTAMP | |
| `error` | TEXT NULL | |

Esta tabla es obligatoria porque el proyecto usa provisioning por tenant. Sin versionado no se puede saber qué tenants tienen el módulo contable actualizado.

### 2.6 `bank_accounts`, `bank_transactions`, `bank_reconciliations`

- `bank_accounts`: vincula una cuenta del COA (`gl_account_id`) con datos bancarios
  reales + flag `is_trust` (cuenta fiduciaria de propietarios — requisito EE.UU.).
- `bank_transactions`: import CSV/OFX; `matched_journal_line_id` NULL hasta conciliar.
- `bank_reconciliations`: cabecera por periodo con `statement_balance`, `book_balance`, `status`.

### 2.7 Ejemplos de asientos automáticos

**Inquilino paga renta $500 (registrado en `payments`):**
```
DEBE   1100 Bancos                 500
  HABER  4000 Ingresos por renta        500
source_type=PAYMENT, source_id=<payment.id>, property_id=X
```

**Gasto de mantenimiento $120 (registrado en `expenses`):**
```
DEBE   5200 Gastos mantenimiento   120
  HABER  1100 Bancos                     120
source_type=EXPENSE, source_id=<expense.id>
```

**Liquidación al propietario $450 (owner-statement):**
```
DEBE   2100 Por pagar a propietarios 450
  HABER  1100 Bancos                       450
source_type=OWNER_PAYOUT
```

**Depósito en garantía $500:**
```
DEBE   1110 Cuenta fiduciaria / Trust   500
  HABER  2200 Depósitos en garantía         500
source_type=PAYMENT, source_id=<payment.id>
```

**Comisión de administración 10% sobre renta $500:**
```
DEBE   2100 Por pagar a propietarios       50
  HABER  4200 Comisión de administración      50
source_type=OWNER_PAYOUT
```

---

## 3. Estructura de carpetas — Backend (siguiendo el patrón del repo)

```
src/accounting/
├── accounting.module.ts
├── accounting.controller.ts              # /:slug/admin/accounting/*
├── entities/
│   ├── chart-of-account.entity.ts
│   ├── journal-entry.entity.ts
│   ├── journal-line.entity.ts
│   ├── bank-account.entity.ts
│   ├── bank-transaction.entity.ts
│   ├── bank-reconciliation.entity.ts
│   └── accounting-period.entity.ts
├── enums/
│   ├── account-type.enum.ts
│   ├── normal-balance.enum.ts
│   ├── journal-source-type.enum.ts
│   └── journal-status.enum.ts
├── dto/
│   ├── create-account.dto.ts
│   ├── create-manual-journal.dto.ts
│   ├── import-bank-transactions.dto.ts
│   └── reconcile.dto.ts
├── ledger/                                # ── núcleo, SRP estricto ──
│   ├── journal-posting.service.ts        # crea + valida + postea asientos (pieza más crítica)
│   ├── journal-posting.service.spec.ts
│   ├── journal-validation.service.ts     # invariante debe=haber, periodo abierto, cuentas activas
│   ├── journal-reversal.service.ts       # genera asientos de reversa (inmutabilidad)
│   └── journal-number.service.ts         # secuencia JE-YYYY-NNNNNN (clonar contract-number.service)
├── outbox/
│   ├── accounting-outbox.service.ts       # registra y procesa eventos financieros
│   ├── accounting-outbox.processor.ts     # cron de reintentos
│   └── accounting-outbox.service.spec.ts
├── chart/
│   ├── chart-of-accounts.service.ts      # CRUD plan de cuentas
│   └── chart-of-accounts.service.spec.ts
├── ledger-queries/
│   ├── ledger-balance.service.ts         # saldos por cuenta, trial balance
│   └── general-ledger.service.ts         # libro mayor detallado por cuenta/rango
├── bank/
│   ├── bank-accounts.service.ts
│   ├── bank-import.service.ts            # parse CSV/OFX → bank_transactions
│   └── bank-reconciliation.service.ts    # matching + cierre de conciliación
├── posting-handlers/                      # ── integración desacoplada ──
│   ├── payment-posting.handler.ts        # escucha pagos aprobados → postea asiento
│   ├── expense-posting.handler.ts
│   ├── late-fee-posting.handler.ts
│   └── owner-payout-posting.handler.ts
└── financial-statements/
    ├── balance-sheet.service.ts          # Balance General desde ledger
    ├── income-statement.service.ts       # Estado de Resultados (P&L real)
    └── trial-balance.service.ts
```

### Provisioning (patrón obligatorio del repo)
```
src/tenants/
└── tenant-accounting-provisioning.service.ts   # ensureAccounting() + seedChartOfAccounts() + upgradeAccounting()
```
Registrado en `tenant-provisioning.service.ts` como un paso más del array,
**después** de payments/expenses (depende de properties/units).

---

## 4. Integración con módulos existentes (desacoplada, sin romper nada)

**Patrón: operación de dominio → outbox contable → handler/posting idempotente.**
Respeta Open/Closed: no se mezcla la lógica operativa con la lógica contable.

```
PaymentApprovalService (existente)
   └── aprueba pago dentro de transacción
          └── AccountingOutboxService.enqueue(PAYMENT_APPROVED)
                 └── AccountingOutboxProcessor
                        └── PaymentPostingHandler
                               └── JournalPostingService.post({ source: PAYMENT, ... })
```

Bus de eventos (elegir según lo que ya exista):
- Si hay mecanismo de eventos tipo `LifecycleNotificationsService` → reusarlo.
- Si no → `@nestjs/event-emitter` (`EventEmitter2`), in-process, cero infra nueva.

> **Clave:** si el posteo falla, el pago no se duplica ni se pierde, pero queda con
> estado financiero pendiente. El dashboard/admin debe mostrarlo como
> `PENDING_ACCOUNTING_POSTING` hasta que el asiento quede `POSTED`.

### Estados financieros en módulos operativos

Agregar a `payments`, `expenses` y `owner_statements` un estado derivado o campo:

| Campo | Valores |
|---|---|
| `accounting_status` | `NOT_REQUIRED, PENDING, POSTED, FAILED` |
| `journal_entry_id` | ID del asiento posteado, cuando exista |

Esto permite que operaciones y contabilidad convivan sin mentir en reportes.

---

## 5. Estructura — Frontend (Angular, patrón `features/`)

```
src/app/features/accounting/
├── accounting.routes.ts
├── chart-of-accounts/          # tabla jerárquica del plan de cuentas
├── journal/                    # lista de asientos + detalle + asiento manual
├── general-ledger/             # libro mayor por cuenta (drill-down)
├── bank-reconciliation/        # wizard de conciliación (UX por pasos)
├── financial-statements/       # Balance General + Estado de Resultados
├── owner-ledger/               # saldos y movimientos por propietario
├── posting-errors/             # bandeja de eventos contables fallidos
└── shared/
    ├── account-picker/         # selector de cuenta reutilizable
    └── money-display/          # formato moneda según tenant_config (DRY)
```
- Scope Transloco `accounting` en `public/i18n/` (ES/EN).
- Permisos: `@RequirePermission('accounting', 'view'|'create'|'edit')` + entrada en sidebar dinámico.

### Integración con Owner Portal

El owner portal debe consumir la contabilidad, no solo `owner_statements`.

Vistas necesarias:

- P&L por propiedad.
- Ledger del owner.
- Owner statement mensual.
- Transferencias realizadas.
- Gastos y deducciones del periodo.
- PDFs/Excel generados desde el ledger.
- Historial de mantenimiento con impacto financiero.

---

## 6. Plan por fases (incremental, cada fase entrega valor usable)

| Fase | Entregable | Dependencias |
|---|---|---|
| **F1 — Cimientos** | `chart_of_accounts` + provisioning + seed del plan base por país + CRUD plan de cuentas | Ninguna |
| **F2 — Motor de asientos** | `journal_entries` + `journal_lines` + `JournalPostingService` + validación de invariantes + reversas + asiento manual | F1 |
| **F3 — Outbox e integración automática** | `accounting_outbox`, handlers: payments → asiento, expenses → asiento, late-fee → asiento, cron de reintento idempotente | F2 |
| **F4 — Consultas y reportes** | Trial Balance, Libro Mayor, Balance General, Estado de Resultados (reemplaza reportes operativos por contables) | F3 |
| **F5 — Bancos** | `bank_accounts` + import CSV/OFX + conciliación bancaria | F2 |
| **F6 — Cierre/compliance** | `accounting_periods` (cierre de mes), cuentas fiduciarias (trust), base para 1099 | F4 |

> Recomendación: **F1→F4 primero** (da contabilidad real y reportes correctos).
> F5/F6 son el diferenciador EE.UU. pero pueden ir después.

---

## 7. Buenas prácticas específicas aplicadas

- **SRP llevado al límite** (estilo del repo): posteo, validación, reversa y numeración
  son servicios separados — como ya se dividieron `payments` y `contracts`.
- **Transaccionalidad:** cada posteo corre dentro de un `QueryRunner`
  (como `contract-signing.service.ts`): cabecera + líneas + validación se confirman
  o se revierten atómicamente.
- **Sin magic numbers:** códigos de cuenta y tipos en `enums/` y constantes
  (`SYSTEM_ACCOUNTS.BANK = '1100'`).
- **Inmutabilidad por diseño:** no hay endpoint `PATCH`/`DELETE` para asientos posteados
  — solo `POST /reverse`.
- **Idempotencia por constraint de BD**, no solo por código (defensa en profundidad).
- **Dimensiones (`property_id`, `unit_id`) en las líneas** → habilita reportes
  "por propiedad" estilo Buildium sin re-arquitectura.
- **Validación solo en los bordes:** DTOs validan input de asiento manual;
  el resto confía en los invariantes del ledger.
- **Auditoría:** todo posteo/reversa registra en `audit-logs` existente (reusar `AuditLogsService`).
- **Provisioning idempotente:** `CREATE TABLE IF NOT EXISTS` + `seedChartOfAccounts`
  con `ON CONFLICT DO NOTHING`, igual que el patrón actual.
- **Outbox transaccional:** ninguna integración financiera depende solo de eventos en memoria.
- **Estados visibles:** operaciones con contabilidad fallida no desaparecen; aparecen en bandeja de errores.
- **Cierre contable:** una vez cerrado un periodo, solo se corrige con asiento en periodo abierto.

---

## 8. Tests no negociables

### Unitarios

- `JournalValidationService` rechaza asiento no balanceado.
- `JournalValidationService` rechaza línea con debe y haber simultáneos.
- `JournalValidationService` rechaza asiento sin mínimo dos líneas.
- `JournalPostingService` postea asiento balanceado.
- `JournalPostingService` no duplica por `source_type + source_id`.
- `JournalReversalService` genera asiento opuesto exacto.
- `JournalNumberService` genera numeración secuencial por año.
- `ChartOfAccountsService` no permite borrar cuentas `is_system`.

### Integración

- Pago aprobado crea outbox y asiento `POSTED`.
- Reintento de outbox no duplica asiento.
- Gasto aprobado crea asiento correcto.
- Late fee crea ingreso por mora.
- Owner payout reduce `owner_payable`.
- Periodo cerrado bloquea nuevos postings.
- Tenant A no puede consultar ledger de Tenant B.
- Error de posteo deja `accounting_status = FAILED` y registra `last_error`.

### E2E mínimos

- Admin aprueba pago → aparece en ledger → aparece en P&L.
- Admin registra gasto → aparece en ledger → descuenta P&L.
- Admin genera owner statement → cuadra con ledger.
- Admin reversa asiento → saldos se corrigen sin editar el asiento original.
- Owner portal descarga statement generado desde ledger.

---

## 9. Riesgos y decisiones pendientes

| Riesgo | Decisión recomendada |
|---|---|
| Mezclar datos operativos con reportes financieros | Reportes financieros solo desde ledger. |
| Posteo contable fallido invisible | Bandeja `posting-errors` + `accounting_status`. |
| Provisioning desordenado por tenant | `accounting_schema_version` obligatoria. |
| Necesidad futura de accrual | Guardar `basis` en asiento y diseñar servicios sin asumir cash para siempre. |
| Cuentas por país | Seed base común + overrides por `tenant_config.country`. |
| Cumplimiento EE.UU. | Priorizar trust accounts, 1099 y cierre mensual después de F4. |

---

## 10. Próximos pasos

1. **Hecho:** Crear **ADR-005** en `docs/adr/` registrando la decisión (ledger como fuente de verdad).
2. **Hecho:** Implementar **F1**: `tenant-accounting-provisioning.service.ts` con SQL real
   (tablas + seed del plan de cuentas base + `accounting_schema_version`) enchufado al orquestador.
3. **En curso:** Implementar **F2**: motor de asientos + reversas + tests de invariantes.
   - Ya existe `AccountingLedgerService.postEntry()` con validación de doble partida y transacción.
   - Falta reversa de asientos e idempotencia por origen.
4. **En curso:** Implementar **F3**: outbox contable + handlers para pagos/gastos/mora.
   - Ya existe `AccountingOutboxService` con enqueue idempotente.
   - Ya existe `AccountingOutboxProcessor` con retry y estados `pending/processing/posted/failed`.
   - Ya existe handler `payment.approved` para postear pagos aprobados.
   - Ya existe handler `expense.created` para postear gastos.
   - Ya existe handler `payment.refund.created` para postear reembolsos parciales o totales.
   - Ya existen handlers `owner_statement.generated` y `owner_statement.transferred`.
   - Falta handler de mora y cierre/periodos contables.
5. Migrar reportes financieros existentes para leer desde ledger.

---

## Anexo — Contexto de la brecha vs Buildium

Resumen del análisis comparativo que originó este plan:

- **365Soft ya cubre ~80% del flujo operativo** de Buildium (leasing, mantenimiento,
  pagos, portales, reportes operativos, inspecciones, violaciones, vendor portal).
- La brecha real es **profundidad financiera + integraciones externas**:
  1. **Contabilidad de doble partida** (este documento) — faltante #1.
  2. Screening real (TransUnion) — hoy checklist manual.
  3. E-firma legal (DocuSign/HelloSign) — hoy captura de imagen in-app.
  4. Procesadores de pago en producción (Stripe/PayU live).
  5. 1099 e-filing + budgeting (mercado EE.UU.).
  6. Listing syndication a portales externos.
  7. Motor de automatización / IA + plantillas de comunicación.
