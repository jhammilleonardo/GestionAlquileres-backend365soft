# Plan de Implementación — Modo BOTH (Corto + Largo Plazo) y Portales

> Plan accionable para que un mismo tenant/admin gestione **largo plazo (contratos)** y
> **corto plazo (reservas)** a la vez, con estrategia explícita de portales (qué se
> reutiliza y qué se construye).
>
> Complementa [`short-term-rental-plan.md`](short-term-rental-plan.md) (investigación + 27
> brechas) y [`reservations.md`](reservations.md). Las brechas `Gxx` referenciadas aquí
> vienen de ese documento.

---

## 0. Objetivo

- El tipo de operación se define por `rental_type` (`LONG_TERM | SHORT_TERM | BOTH`) en
  `tenant_config`, y en cascada en `property` y `unit`.
- En `BOTH`, el admin puede tener unas unidades a contrato mensual y otras a reserva por noche.
- **No es un rediseño de arquitectura**: el modelo ya soporta `BOTH`. El trabajo es
  *completar features + cablear el modo a la UI + cerrar la coherencia anti doble-booking*.

---

## 1. Estrategia de portales (decisión central)

> **Decisión de diseño ya tomada en el código:** el huésped de corto plazo **es un
> INQUILINO registrado**. `ReservationIntentionService` guarda la intención de reserva,
> manda a `tenant-register`/`login` y vuelve al portal del inquilino. El backend
> `POST /:slug/tenant/reservations` exige JWT de inquilino. → **Se reutiliza el portal del
> inquilino; NO se crea un rol/portal "guest" separado.**

| Portal | Rol | Estado | Qué se REUTILIZA | Qué se AGREGA |
|---|---|---|---|---|
| **Público** (`public-portal`) | Anónimo | ✅ Existe | Catálogo, `property-detail`, `availability-calendar`, `tenant-register` | Selector fechas+huéspedes en detalle → **quote** (desglose) → botón "Reservar" |
| **Inquilino** (`tenant-portal`) | INQUILINO | ⚠️ Parcial | Auth, layout, dashboard, pagos, mensajes, notificaciones, **"Mis Reservas"** (lista + cancelar) ✅ | **flujo de checkout** de reserva (pendiente) |
| **Admin** (`/:slug/admin`) | ADMIN/EMPLEADO | ❌ Falta | Sidebar dinámico, permisos, patrón de tablas/filtros | **Módulo Reservas** (lista, calendario, confirmar/cancelar/no-show) + bloqueo (ya existe) |
| **Propietario** (`owner-portal`) | PROPIETARIO | ✅ Existe | `owner-statements`, vista de propiedades | (Fase tardía) ingresos de corto plazo de sus unidades |

**Conclusión:** no se inventan portales nuevos. Se **extiende** el del inquilino (huésped),
se **completa** el público (reservar), y se **construye** el módulo admin de reservas.

### 1.1 Corrección de un cableado roto detectado

`ReservationIntentionService.navigateToReservation()` hoy redirige a
`/portal/new-application?reservation=true` — pero `new-application` es el **wizard de
solicitudes de LARGO plazo**, no un checkout de reserva. **Hay que crear un flujo propio**
(`/portal/reservar` o `/portal/checkout`) y apuntar la intención ahí. Esto explica parte del
"no funciona".

---

## 2. Cableado del modo BOTH (lo que hace que "elegir el tipo" por fin sirva)

| Punto | Hoy | Cambio |
|---|---|---|
| **Registro** | `RegisterAdminDto` deriva `rental_type` del `country` | Añadir campo opcional `rental_type` al DTO (elegir en el registro, no solo país) |
| **Wizard** | Ya tiene select `rental_type` (default BOTH) y lo guarda | ✅ Sin cambios (funciona) |
| **Sidebar (admin)** | Filtra solo por rol/permiso; sin entrada de Reservas | Mostrar **Contratos** si `LONG_TERM\|BOTH`; **Reservas** si `SHORT_TERM\|BOTH` |
| **Guards** | `setupCompleteGuard`, `moduleGuard` | Nuevo guard/condición por `rental_type` del tenant |
| **Catálogo público** | Ya distingue short/long term units | Mostrar CTA "Reservar" solo en unidades short; "Solicitar" en long |
| **Coherencia unidad** | `assertRentalTypeCoherence` (tenant BOTH ⇒ cualquiera) | ✅ Ya funciona |

---

## 3. Garantía de ocupación única (el punto MÁS delicado — concurrencia + coherencia)

En `BOTH`, una misma unidad **no puede** estar simultáneamente con contrato de largo plazo
activo **y** aceptar reservas por noche en esas fechas (doble-booking). Pero el problema real
tiene **dos capas**: (A) la validación cruzada contrato↔reserva, y (B) la **concurrencia**, que
hoy está rota incluso para reservas contra reservas.

### 3.1 Capa A — Validación cruzada contrato ↔ reserva (hoy ausente)

- El servicio de contratos **no detecta solape por unidad**: `validatePropertyAvailability`
  (`contract-creation-validation.service.ts:151`) sólo mira `properties.status`
  (`DISPONIBLE/RESERVADO`); nunca consulta `reservations` ni `property_availability`.
- `reservations.service` valida disponibilidad contra `property_availability`, pero **no cruza
  con `contracts` activos**.

A cerrar:
1. Al **crear reserva**: rechazar si la unidad tiene un `contract` activo que solape el rango.
2. Al **crear/activar contrato** de largo plazo: rechazar si hay reservas confirmadas en ese
   rango; opcionalmente marcar la unidad como no-reservable mientras dure el contrato.
3. (Recomendado) **Vista unificada de ocupación** por unidad que combine
   `property_availability` (corto) + `contracts` (largo) como fuente única de verdad.

### 3.2 Capa B — Concurrencia (BUG actual, no sólo "falta") ⚠️

`createReservation` (`reservations.service.ts:148`) hace **check-then-insert sin transacción**:
`assertDatesAvailable()` → `INSERT reservations` → loop de `INSERT property_availability`.
Dos problemas reales:

1. **TOCTOU sin transacción ni lock:** entre el check y el insert, otra petición puede colarse.
   Inconsistente con el propio repo: `payment-creation.service.ts` **sí** usa `queryRunner` +
   transacción. Reservas no.
2. **La constraint que debería salvarte está derrotada por el upsert.** Existe
   `UNIQUE (unit_id, date)` en `property_availability` (`tenant-units-provisioning.service.ts:93`),
   pero la escritura de noches usa `ON CONFLICT (unit_id, date) DO UPDATE SET status=BOOKED,
   reservation_id=…` (`reservations.service.ts:178`). El `DO UPDATE` hace que la segunda reserva
   **sobrescriba** la primera en vez de fallar → **doble-booking silencioso**. Además, sin
   transacción, un fallo a mitad del loop deja una reserva con noches parciales.

**Solución (más fuerte que un simple `FOR UPDATE`):**
1. Envolver creación de reserva en `queryRunner` transaccional (igual que pagos).
2. Cambiar el upsert a `ON CONFLICT (unit_id, date) DO NOTHING` y **verificar que se reclamaron
   las N noches** (`rowCount === nights`); si no, abortar la transacción. La constraint actúa
   como árbitro atómico, sin races.
3. (Robustez de motor, recomendado) **Exclusion constraint** sobre `reservations`:
   `EXCLUDE USING gist (unit_id WITH =, daterange(checkin_date, checkout_date, '[)') WITH &&)`
   — garantiza ocupación única a nivel BD, no a nivel app. Es el estándar para booking.

> **Esfuerzo realista: 2–4 días**, no "0.5–1 día". Toca reservas, contratos, estados,
> provisioning (constraints) y concurrencia. **No es UI**: es garantizar ocupación única bajo
> carga sin romper el modelo de pagos. Diseñar junto con §4.6 (pago confirma la reserva → misma
> transacción).

---

## 3.5 Arquitectura y patrones OBLIGATORIOS (no negociable)

Todo lo nuevo debe seguir los patrones ya establecidos en el repo. No inventar estructuras.

### Frontend — patrón Fachada (Facade) + Signals

El proyecto usa **patrón fachada** (22 facades existentes). Regla: **el componente NO contiene
lógica de negocio ni llama services directo** — delega todo en su `*.facade.ts`.

```
Componente (standalone)        → solo renderiza + delega eventos a la facade
   │ inject()
   ▼
*.facade.ts  (@Injectable, provista a nivel de componente)
   • estado con signal() / computed()  (NUNCA BehaviorSubject)
   • orquesta: ApiService, ToastService, ConfirmDialogService, TranslocoService
   • expone signals readonly + métodos de acción
   │ inject()
   ▼
core/services/<area>/<x>.service.ts    → HTTP a la API (capa de datos)
   │
   ▼
core/models/<x>.model.ts               → tipos/interfaces compartidos
```

Convenciones (de `frontend/CLAUDE.md`):
- **Standalone components** siempre; `signal()`/`computed()` para estado; `toSignal()` para Observables.
- `effect()` solo para sincronizar con el exterior (localStorage, DOM), nunca para derivar estado.
- **Transloco con scope por feature** (`es/<feature>.json`, `en/<feature>.json`).
- Errores con `getApiErrorMessage()` + `ToastService`; confirmaciones con `ConfirmDialogService`.

**Aplicación a este plan** — cada pantalla nueva lleva su facade:
| Pantalla | Facade | Service (core) | Model |
|---|---|---|---|
| Admin Reservas (lista/detalle) | `reservations-admin.facade.ts` | `admin/reservation.service.ts` | `reservation.model.ts` |
| Inquilino "Mis Reservas" | `my-reservations.facade.ts` | `tenant/reservation.service.ts` (ya existe parcial) | `reservation.model.ts` |
| Inquilino checkout | `reservation-checkout.facade.ts` | idem + quote | idem |
| Público "Reservar" (detalle) | extender facade de `property-detail` | `catalog`/quote service | idem |

> `ReservationService` ya existe en `core/services/reservation.service.ts` (availability,
> createReservation, blockDates) — se extiende, no se duplica (DRY).

**Deuda a corregir en F0:** `AvailabilityCalendarComponent`
(`public-portal/availability-calendar/availability-calendar.component.ts`) hoy **inyecta services
y crea reservas directamente**, violando la regla "el componente no llama services directo". F0
debe **refactorizar ese flujo a una facade** antes de construir las pantallas nuevas encima, para
no propagar el anti-patrón.

### Backend — Monolito modular + service fachada por módulo

(De `backend/docs/architecture.md`: *"Services fachada: API interna estable por módulo"*.)

```
<feature>.module.ts        → declara controller + service + providers
<feature>.controller.ts    → rutas + guards (@UseGuards, @RequirePermission) + DTOs
<feature>.service.ts       → lógica de negocio (fachada estable del módulo)
dto/                       → class-validator en los bordes
entities/                  → TypeORM (migrar reservations/availability — G11)
enums/
```

- Multi-tenancy schema-per-tenant intacto (`search_path` por `TenantContextMiddleware`).
- Guards: `JwtAuthGuard` + `PermissionsGuard` con `@RequirePermission('reservations', …)` en admin.
- SOLID + funciones cortas + DI (nunca `new`). El módulo `reservations` ya existe; se extiende.

---

## 4. Backend — trabajo por módulo

### 4.1 Fundamentos (prerequisito)
- **G11**: entidades TypeORM `Reservation` y `PropertyAvailability`. **Pero `reservations` y
  `property_availability` se crean por schema tenant en `tenant-units-provisioning.service.ts:79`,
  no por TypeORM.** Por tanto G11 debe incluir:
  - `ensureReservations()` / `upgradeReservations()` en el provisioning (patrón `ensureX`/`upgradeX`
    del repo) para **tenants existentes**, no sólo `CREATE TABLE` de cero.
  - Las nuevas constraints de §3.2 (cambio de upsert, exclusion constraint) se aplican vía
    `upgrade…()` idempotente, registradas en el orquestador `tenant-provisioning.service.ts`.
  - Si se adoptan entidades TypeORM, deben **convivir** con el SQL de provisioning (la BD es la
    fuente de verdad del schema), no reemplazarlo silenciosamente.
- Enum de estados ampliado: `PENDING → CONFIRMED → IN_PROGRESS → COMPLETED` + `CANCELLED`,
  `EXPIRED`, `NO_SHOW`, `DECLINED`.

### 4.1.1 Concurrencia en creación de reserva (de §3.2)
- Refactor de `createReservation` a `queryRunner` transaccional + upsert `DO NOTHING` con chequeo
  de `rowCount` + (recomendado) exclusion constraint. Prerequisito de F-coherencia.

### 4.2 Reservas admin (G1)
Nuevo controller `@Controller(':slug/admin/reservations')` con `@RequirePermission('reservations', …)`:
- `GET /` lista + filtros (estado, unidad, propiedad, fechas) — filtros auto-apply.
- `GET /:id` detalle.
- `PATCH /:id` confirmar / cancelar / no-show / completar.
- (Reusar el `block-dates` existente.)

### 4.3 Flujo de reserva (G2)
- `instant_book` por unidad. Si false ⇒ reserva entra `PENDING` con `expires_at` (~24h).
- Cron de expiración (reusar patrón [`billing-cron.md`](billing-cron.md)).
- Notificación al admin para aprobar/rechazar (reusar módulo `notifications`).

### 4.4 Pricing + quote (G3)
- Endpoint `POST /:slug/catalog/properties/:id/units/:unitId/quote` → devuelve desglose
  (noches, subtotal, descuentos, fees, impuesto, total) **antes** de reservar.
- Motor: descuentos (semanal/mensual/early/last-minute), weekend, fees (huésped extra/mascota/
  limpieza), impuesto de ocupación.

### 4.5 Coherencia (sección 3) + permisos
- Añadir `'reservations'` al catálogo de módulos de `employee_permissions` (para EMPLEADO).

### 4.6 Pagos de reserva — modelo (DECISIÓN, no opcional)
El modelo de pagos actual asume contrato: `payments.contract_id` es **NOT NULL**
(`tenant-payments-provisioning.service.ts:13`) y `createPayment` **resuelve el contrato activo
del inquilino** cuando no llega `contractId` (`payment-creation.service.ts:37`). Una reserva de
corto plazo **no necesariamente tiene contrato** → el modelo actual la rompe.

Opciones evaluadas:
| Opción | Veredicto |
|---|---|
| Tabla `reservation_payments` aparte | ❌ Duplica pipeline de pagos y obliga a un segundo handler de posteo contable → rompe DRY y "ledger = única fuente de verdad". |
| `contract_id` nullable + `reservation_id` nullable + `CHECK` exactly-one | ✅ **Elegida.** Pago **polimórfico**: un solo pipeline, un solo punto de entrada al outbox contable. |

**Decisión: pago polimórfico.**
- `ALTER payments`: `contract_id` → nullable; `ADD reservation_id INTEGER NULL`;
  `CHECK ((contract_id IS NOT NULL) <> (reservation_id IS NOT NULL))` (exactamente uno).
- Aplicar vía `upgrade…()` idempotente en provisioning (tenants existentes).
- `createPayment` deja de auto-resolver contrato si viene `reservationId`; valida el `CHECK`.
- **Integración contable:** el pago de reserva entra al **mismo outbox** de
  `payment-approval.service.ts:82` que ya alimenta el ledger (ver `accounting-plan.md`).
  Mapeo sugerido: cobro de reserva → DEBE `1100 Bancos` / HABER `1300 Pagos anticipados de
  inquilinos` (o `4000 Ingresos por renta` si es cash basis al confirmar).
- Diseñar junto con §3.2: **el pago confirma la reserva ⇒ ambos en la misma transacción.**

---

## 5. Frontend — trabajo por portal

> Cada pantalla nueva sigue el **patrón fachada** de §3.5: componente standalone delgado +
> `*.facade.ts` con signals + service en `core/services`. Reusar `ReservationService` existente.

### 5.1 Público (`public-portal`) — completar "Reservar"
- En `property-detail`: selector de **fechas + nº huéspedes**; al elegir, llamar al endpoint
  **quote** y mostrar el desglose.
- Botón "Reservar" → `ReservationIntentionService.setIntention()` → login/register → checkout.
- En el catálogo: badge/CTA distinto para unidades short ("Reservar por noche") vs long ("Solicitar").

### 5.2 Inquilino (`tenant-portal`) — huésped
- **Nuevo flujo de checkout** `/portal/reservar` (no reusar `new-application`): confirma
  fechas, muestra quote, crea la reserva (`POST /:slug/tenant/reservations`), maneja PENDING.
- **Nueva sección "Mis Reservas"** en el nav (`tenant-layout.component.ts`): lista de reservas,
  estado, detalle, cancelar según política.
- Corregir `navigateToReservation()` para apuntar al nuevo checkout.

### 5.3 Admin — módulo Reservas
- Entrada en sidebar (gated por `rental_type`), bajo permiso `reservations`.
- **Calendario/tabla** de reservas con filtros auto-apply (patrón ya usado en otros módulos).
- Panel de detalle + acciones (confirmar/cancelar/no-show). Reusar diálogo de bloqueo existente.

### 5.4 Configuración — registro + wizard
- Añadir selección de `rental_type` en el registro (hoy solo país).
- Wizard: ya funciona; sólo asegurar que el valor gobierna sidebar/guards.

---

## 6. Roadmap por fases (con dependencias)

> **Re-secuenciado (post-revisión):** la concurrencia y la ocupación única se adelantan **antes**
> de construir UI/admin. El riesgo no es la pantalla; es garantizar ocupación única bajo
> concurrencia y no romper el modelo contable con los pagos de reserva.

| Fase | Entregable | Brechas | Depende de |
|---|---|---|---|
| **F0 — Cableado + refactor facade** | 🟡 **En progreso** — ✅ **`navigateToReservation` corregido**: tras login redirige al checkout `/portal/reservar/:propertyId/:unitId` (antes iba a `new-application`); ✅ el checkout **precarga fechas desde la intención** guardada antes del login (`prefillFromIntention`, valida que sea la misma unidad y la consume) → flujo anónimo elige fechas en catálogo → login → checkout con fechas y quote ya cargadas. **+4 tests** (intention + checkout). ✅ **Gating por `rental_type`**: `FormatService.supportsShortTerm()` (false sólo si modo `LONG_TERM`; asume true mientras carga para no parpadear); el sidebar admin oculta "Reservas" y la nav del portal inquilino oculta "Mis Reservas" cuando el tenant es solo-largo-plazo. **+3 tests**. ⏳ `rental_type` editable en registro/wizard; ⏳ refactor de `availability-calendar` a facade (deuda §3.5 — el nuevo checkout ya es facade limpio y no la necesita para el flujo) | — | — |
| **F1 — Fundamentos + provisioning/upgrade** | 🟡 **En progreso** — ✅ estados ampliados (`PENDING→CONFIRMED→IN_PROGRESS→COMPLETED` + `CANCELLED/EXPIRED/NO_SHOW/DECLINED`) con set único `OCCUPYING_RESERVATION_STATUSES`; ✅ guarda de solape versionada (`_v2`, incluye `in_progress`) y migrada idempotentemente para tenants existentes; ⏳ entidades TypeORM `Reservation`/`PropertyAvailability` (opcional: la BD vía provisioning sigue siendo la fuente de verdad del schema) | G11 | F0 |
| **F2 — Concurrencia + anti doble-booking** | 🟡 **En progreso** — ✅ `createReservation` transaccional + reclamación atómica de noches (`claimNightsOrFail`); ✅ exclusion constraint best-effort (`ensureReservationOverlapGuard`); ✅ dirección reserva→contrato (`assertNoActiveContractOverlap`); ⏳ dirección contrato→reserva pendiente (requiere que `CreateContractDto` lleve `unit_id`) | — | F1 |
| **F3 — Admin Reservas (backend + frontend)** | ✅ **Backend**: `ReservationsAdminService` (SRP) + `AdminReservationManagementController` en `/:slug/admin/reservations`; `GET` lista con filtros auto-apply + paginación (limit ≤100); `GET /:id` detalle con joins; `PATCH /:id/status` máquina de estados (`RESERVATION_TRANSITIONS`) transaccional con `FOR UPDATE` + libera noches en cancel/decline/no-show; permiso `reservations` (view/edit). ✅ **Frontend (patrón fachada)**: `ReservationsAdminFacade` (signals + filtros auto-apply + paginación + `applyAction` con ConfirmDialog para acciones destructivas); componente delgado que extiende la fachada; sub-componentes `reservation-filters` / `reservation-list`; `ReservationAdminService` (capa datos) + `reservation-admin.model.ts`; ruta lazy `/:slug/admin/reservas` (moduleGuard) + entrada de sidebar; scope Transloco `reservas` ES/EN. **6 tests fachada + 6 tests backend admin verdes.** | G1 | F2 |
| **F4 — Quote + checkout (público + inquilino)** | 🟡 **En progreso** — ✅ **Motor de quote** (`QuoteService`, abierto/cerrado por `QuoteLine`): base noches×precio, descuento por estadía semanal(7+)/mensual(28+, prioritario), limpieza, desglose + totales; endpoint público `POST /:slug/catalog/.../quote` (throttle 600/min). ✅ Esquema: `weekly_discount_pct`/`monthly_discount_pct` en `units` (entidad + DTO + provisioning idempotente). ✅ Capa datos frontend (`ReservationService.getQuote` + tipos). ✅ **"Mis Reservas" inquilino**: backend `GET /:slug/tenant/reservations` (lista propia) + `PATCH /:slug/tenant/reservations/:id/cancel` (cancela pending/confirmed, libera noches en transacción, valida propiedad por `tenant_id`); frontend fachada `TenantReservationsFacade` + componente standalone (secciones Próximas/Historial, status-badge, cancelar con ConfirmDialog), ruta `/portal/reservas`, item de nav `CalendarCheck`, i18n scope `tenant-reservas` ES/EN. **Tests verdes:** 7 quote + 3 mis-reservas backend, 6 fachada frontend. ✅ **UI checkout** (`reservation-checkout.component` + fachada en `tenant-portal/checkout/`, ruta `/portal/reservar/:propertyId/:unitId`): fechas → cotización en vivo (auto-apply con debounce, reusa `getQuote`) → desglose de líneas/descuentos/total → confirmar (reusa `createReservation`) → navega a Mis Reservas. Fachada limpia, sin tocar el viejo `availability-calendar`. ✅ **Impuesto de ocupación**: `tenant_config.occupancy_tax_pct` (provisioning idempotente); línea `occupancy_tax` en el quote (grava el alojamiento neto, no la limpieza). ✅ **Pricing unificado (DRY)**: función pura `reservation-pricing.ts` (`priceReservation`) usada por el motor de quote **y** por `createReservation` → el monto cobrado = el mostrado (antes `createReservation` ignoraba descuentos e impuesto). **Tests verdes:** 5 checkout + 2 impuesto quote + 5 función pura + 1 consistencia createReservation. ✅ enganche `navigateToReservation` → checkout (F0) | G3, G2 | F3 |
| **F5 — Pagos de reserva** | 🟡 **En progreso** — ✅ **Pago polimórfico (§4.6)**: `payments.contract_id` ahora nullable + `reservation_id` + FK + **CHECK `num_nonnulls(contract_id, reservation_id)=1`** (exactamente uno); provisioning idempotente como paso `ensureReservationPaymentSupport` tras `ensureReservations`. ✅ **`ReservationPaymentService`** (SRP/OCP, no toca `PaymentCreationService`): crea pago PENDING vinculado a la reserva, bloqueo `FOR UPDATE`, valida propiedad por `tenant_id`, estado pagable y **anti-sobrepago** (saldo = total − comprometido). ✅ Endpoint `POST /:slug/tenant/reservations/:id/payments`. ✅ **Reutiliza el pipeline existente** (aprobación → split por propiedad → outbox → posteo contable), verificado agnóstico al contrato (el posting tolera `contract_id` NULL). **5 tests verdes** (+120 de pagos sin romper). ✅ **UI de pago end-to-end** en "Mis Reservas": `findMyReservations` ahora devuelve `paid_amount` (LATERAL sum); componente+fachada hijo `ReservationPaymentDialog` (SRP/composición, no infla la fachada de la lista; reusa `getAvailablePaymentMethods`), botón "Pagar" con saldo pendiente, anti-sobrepago reflejado. ✅ **Política de cancelación con reembolso**: `units.cancellation_policy` (flexible/moderate/strict/non_refundable, entidad + DTO + provisioning); función pura `cancellation-policy.ts` (`computeCancellationRefund` → % según política y antelación al check-in) + `ReservationRefundService` (inserta `payment_refunds` y marca pagos REFUNDED dentro de la misma transacción). Cableado: cancelación del huésped aplica la política; cancelación/rechazo admin reembolsa 100% (decisión del host); NO_SHOW no reembolsa. **+9 tests** (5 política, 3 refund service, 1 NO_SHOW). ✅ **`cancellation_policy` configurable en el form de unidad** (select + i18n). ✅ **Preview de reembolso**: endpoint solo-lectura `GET /:slug/tenant/reservations/:id/cancellation-preview` (reusa `computeCancellationRefund` sobre pagos APROBADOS); el diálogo de cancelar del huésped muestra "si cancelas ahora recuperarás X (Y%)" antes de confirmar (best-effort: cae a mensaje genérico si falla). **+2 tests backend**. ✅ **Depósito de garantía**: se reusa `units.deposit_amount`; `reservations.security_deposit` (columna nueva, provisioning idempotente); la función pura de pricing lo expone aparte (`deposit` + `totalDue = total + depósito`, línea `security_deposit` no gravada ni descontada) → quote y `createReservation` cobran `totalDue` y guardan el depósito por separado; checkout muestra "Total a pagar" + nota "incluye depósito reembolsable". **+4 tests** (2 pricing, 1 quote, 1 createReservation). ✅ **Reembolso consciente del depósito**: modelo "pago cubre alquiler primero, depósito retenido al final"; funciones puras `computeRefundableAmount` (alquiler por política + depósito 100%) y `computeDepositPaid`; `refundAbsoluteAmount` reparte un monto absoluto sobre pagos aprobados. Cableado: cancelación huésped (alquiler por política + depósito íntegro), cancelación/rechazo admin (100%), **COMPLETE devuelve el depósito retenido**, NO_SHOW nada; el preview refleja el monto depósito-consciente. **+8 tests** (refundable/depositPaid, refundAbsoluteAmount, COMPLETE, preview strict). | G5, G6, G15 | F2, F4 |
| **F6 — Flujo OTA** | 🟡 **En progreso** — ✅ **Modo de reserva** `booking_mode` (`instant`/`request`) en `units` (entidad + DTO `@IsIn` + provisioning idempotente en `ensureShortTermFields`, default `instant`). ✅ `createReservation` decide el estado: `request` → **PENDING** (request-to-book, retiene noches), `instant` → CONFIRMED. La confirmación admin ya existe (transición CONFIRM). ✅ **Expiración por cron**: `ReservationExpiryService` + `ReservationExpiryScheduler` (`@Cron` cada 15 min) recorre tenants activos y, vía CTE atómica, marca EXPIRED las PENDING > 24 h y libera sus noches. ✅ **Notificaciones OTA** (`ReservationNotificationService`, SRP + best-effort): solicitud → avisa a admins (`RESERVATION_REQUESTED`); confirmar/rechazar → avisa al huésped (`RESERVATION_CONFIRMED`/`DECLINED`); expiración → avisa al huésped (`RESERVATION_EXPIRED`). Cableado en createReservation (request), transición admin y cron de expiración; `schemaName`/`slug` resueltos en los controllers (`req.tenant.schema_name`). **8 tests verdes** (request→PENDING + 3 expiración + 3 notificación + 1 transición notifica). ✅ **Toggle UI** en el form de unidad admin: selects de `booking_mode` (instantánea/por solicitud) y descuentos por duración; i18n ES/EN. | G2 | F4 |
| **F7+** | 🟡 **En progreso** — ✅ **Reseñas de estadía**: tabla `reviews` (1×reserva UNIQUE, rating 1–5 CHECK, provisioning idempotente); `ReviewsService` (crear sólo sobre reserva COMPLETADA propia, mis reseñas, listado admin con filtro por propiedad, rating agregado por propiedad); controllers tenant (`POST /:slug/tenant/reservations/:id/review`, `GET /tenant/reviews`), admin (`GET /:slug/admin/reviews`), público (`GET /:slug/catalog/properties/:id/rating`, throttle); `findMyReservations` expone `has_review`. Frontend: data layer + **diálogo de reseña** (componente+fachada hijo, SRP/composición, estrellas 1–5 + comentario) en "Mis Reservas" (botón "Dejar reseña" para completadas sin reseña), i18n ES/EN. ✅ **Apartado admin de reseñas** (`/resenas`, item de sidebar `Star` gateado por modo; fachada con filtro por propiedad auto-apply, promedio y estrellas; **+4 tests fachada**) y ✅ **rating ★ en el catálogo público** (detalle de propiedad consume `GET /catalog/properties/:id/rating`, best-effort). **+8 tests** (6 backend, 2 fachada). ✅ **Analytics de ocupación**: `ReservationAnalyticsService` (ocupación = noches reservadas/capacidad, ingresos por estados de ingreso, ADR = ingresos/noches, conteo por estado; rango con noches inclusivas, valida rango invertido); endpoint `GET /:slug/admin/reservations/analytics?from&to` (antes de `:id` para no colisionar). Frontend: data layer + **dashboard KPI** (componente+fachada en `features/reservations/analytics/`, rango auto-apply con debounce, tarjetas ocupación %/ingresos/ADR/unidades) montado arriba de la página admin de reservas, i18n ES/EN. **+6 tests** (3 backend, 3 fachada). ✅ **Exportación iCal**: función pura `buildIcalendar` (RFC 5545, CRLF, escape de texto, all-day VEVENT) + `IcalService` (un evento por reserva ocupante y por fecha bloqueada, sin PII del huésped); endpoint admin `GET /:slug/admin/units/:unitId/calendar.ics` (text/calendar, attachment). Frontend: data layer (HttpClient responseType text) + botón "Exportar calendario" en el panel de unidad (solo corto plazo) → descarga `.ics` vía blob, manejado en `PropertyUnitsFacade`. **+5 tests backend**. ✅ **Tarifas por temporada**: tabla `season_rules` (override de precio/noches por rango y unidad, sin solapes; provisioning idempotente); función pura `resolveStayPricing` (precio por noche según temporada + noches mínimas efectivas de la temporada del check-in); `priceReservation` extendido para aceptar `nightlyPrices` → **integrado en quote y createReservation** (precio mostrado = cobrado, con temporadas); `SeasonRulesService` CRUD con anti-solape; controllers admin `GET/POST/DELETE /:slug/admin/units/:unitId/seasons`. Frontend: data layer + **diálogo de gestión de temporadas** (componente+fachada en `features/reservations/seasons/`, lista + alta + baja con confirmación) abierto desde el panel de unidad, i18n ES/EN. **+13 tests** (4 resolver puro, 5 service CRUD, +integración quote/createReservation, 4 fachada). ✅ **Housekeeping (limpieza)**: tabla `housekeeping_tasks` (provisioning idempotente); `HousekeepingService` (genera la tarea **al COMPLETAR** una reserva, programada para el check-out — idempotente por reserva, dentro de la transacción de la transición; list con filtros; update de estado/asignación); controllers admin `GET/PATCH /:slug/admin/housekeeping`. Frontend: data layer + **tablero de limpieza** (`features/reservations/housekeeping/`, fachada con filtro de estado auto-apply + avance pending→in_progress→done), ruta `/limpieza`, item de sidebar `Sparkles` gateado por modo, i18n ES/EN. **+11 tests** (5 service backend, 1 transición COMPLETE, 6 fachada). ✅ **Import iCal externo**: tabla `calendar_sync_sources` + columna marcadora `property_availability.sync_source_id` (provisioning idempotente); función pura `parseIcalendar` (RFC 5545, unfolding, DATE/DATE-TIME); `CalendarSyncService` (CRUD de fuentes + descarga vía HttpModule + parse + bloqueo idempotente con `generate_series`, sin pisar reservas reales — sólo fechas `available`; libera bloqueos previos al re-sincronizar; **schema-qualified** para servir a request y cron); `CalendarSyncScheduler` (`@Cron` cada 6 h, recorre tenants); controllers admin `GET/POST/DELETE/POST :id/sync` en `/:slug/admin/units/:unitId/calendar-sources`. Frontend: data layer + **diálogo de calendarios externos** (`features/reservations/calendar-sync/`, fachada con lista + alta + sync-ahora + baja) abierto desde el panel de unidad, i18n ES/EN. **+13 tests** (4 parser, 4 service backend, 5 fachada). ✅ **Módulo F7 completo.** | G4, G7, G17, G26, G9 | — |

**Camino crítico mínimo para "ambos funcionando de verdad": F0 → F1 → F2 → F3 → F4 → F5.**
F2 y F5 son el núcleo de riesgo (ocupación única + pagos sin romper el modelo contable) y se
diseñan en conjunto.

---

## 7. Decisiones abiertas

1. **Huésped = inquilino**: confirmado por el código actual. ¿Se mantiene, o a futuro se quiere
   un guest "ligero" sin cuenta? (Recomendación: mantener inquilino; menos fricción.)
2. **`BOTH` por unidad**: ¿una unidad puede alternar entre corto/largo según el período, o se
   fija un tipo por unidad? (Recomendación: permitir alternar, con la regla de coherencia §3.)
3. **Impuesto de ocupación**: ¿en `tenant_config` (% por país, ya existe infra) o tabla por ciudad?
4. **Pagos de reserva**: ~~modelo~~ **resuelto** → pago polimórfico (§4.6). Queda abierto sólo el
   *cuándo*: ¿cobro online desde F5 o primero registro manual como en pagos actuales?
