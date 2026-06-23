# Plan — Alquiler de Corto Plazo (Airbnb / Booking.com)

> Investigación profunda de Airbnb y Booking.com + análisis de brechas vs. el código
> actual de 365Soft, con modelo de datos propuesto y roadmap por fases.
>
> Estado a la fecha de redacción: existe un **MVP funcional** (disponibilidad +
> bloqueo + creación de reserva). Este documento define el camino para llegar a
> paridad con las OTAs. Ver también [`reservations.md`](reservations.md) y
> [`units.md`](units.md).

---

## 1. Estado actual del código (línea base)

### Modelo de datos existente

**`units`** (`src/units/entities/unit.entity.ts`) ya tiene los campos base de corto plazo:
`rental_type` (`LONG_TERM | SHORT_TERM | BOTH`), `price_per_night`, `cleaning_fee`,
`deposit_amount`, `min_nights`, `max_nights`, `checkin_time`, `checkout_time`,
`features` (jsonb).

**`property_availability`** (SQL crudo, sin entidad TypeORM): `property_id`, `unit_id`,
`date`, `status` (`AVAILABLE | BLOCKED | BOOKED`), `blocked_by`, `notes`, `reservation_id`.
Constraint `UNIQUE(unit_id, date)`.

**`reservations`** (SQL crudo): `property_id`, `unit_id`, `tenant_id`, `checkin_date`,
`checkout_date`, `nights`, `price_per_night`, `cleaning_fee`, `total_amount`, `currency`,
`status` (`PENDING | CONFIRMED | CANCELLED | COMPLETED`), `notes`, `created_at`.

### Endpoints existentes

- `GET  /:slug/catalog/properties/:id/availability` — disponibilidad mensual (público)
- `POST /:slug/admin/properties/:id/units/:unitId/block-dates` — bloqueo (admin)
- `POST /:slug/tenant/reservations` — crear reserva (portal inquilino)

### Limitaciones de la línea base

1. La reserva entra directo en `CONFIRMED` — **no hay aprobación ni pago previo**.
2. **No hay gestión admin de reservas** (listar / detalle / confirmar / cancelar / no-show).
3. Pricing plano: `price_per_night * nights + cleaning_fee`. Sin descuentos, estacionalidad,
   fees variables ni impuestos.
4. Restricciones (`min/max_nights`) sólo a nivel unidad, no por fecha.
5. Sin políticas de cancelación, sin reseñas, sin mensajería, sin iCal.
6. Persistencia con SQL crudo: sin entidades TypeORM ⇒ sin migraciones tipadas.

---

## 2. Cómo lo hacen Airbnb y Booking.com (investigación)

### 2.1 Pricing

| Funcionalidad | Airbnb | Booking.com |
|---|---|---|
| Precio base | Sí, por noche, editable | Sí, por rate plan |
| Precio custom por fecha | Sí (calendario) | Sí (calendario por día) |
| Premium de fin de semana | Vie/Sáb configurable | Vía rate plan |
| Pricing dinámico ("Smart Pricing") | Sí — ubicación, demanda, histórico, rango min/max | Vía channel manager / rate plans |
| Descuento semanal (≥7 noches) | Sí | Rate plan "Weekly" |
| Descuento mensual (≥28 noches) | Sí | Rate plan "Monthly" |
| Early-bird (1–24 meses antes) | Sí | Rate plan "Early Booker" |
| Last-minute (1–28 días antes) | Sí | Sí |
| Fee de limpieza | Estándar + fee de estadía corta (1–2 noches) | Incluido o como cargo |
| Fee de huésped extra | Por noche, sobre N huéspedes | Por persona/rate plan |
| Fee de mascota | Por mascota / noche / estadía | Configurable |

> Dato de la industria: el pricing dinámico bien aplicado aumenta ingresos hasta ~40% vs.
> precio estático; un rating 0.3★ superior justifica 10–15% más de tarifa.

### 2.2 Restricciones de disponibilidad

- **Min / Max length of stay (LOS)** — 1 a 30 noches, configurable **por fecha** (no solo global).
- **Min LOS from arrival** — mínimo de noches según el día de llegada.
- **Exact stay** — exige una duración exacta.
- **Closed to Arrival (CTA / "No arrivals")** — no se puede *iniciar* estancia ese día.
- **Closed to Departure (CTD / "No departures")** — no se puede *terminar* ese día.
- **Advance notice** — antelación mínima para reservar (1h a 360 días).
- **Booking window / max advance** — hasta cuántos días/meses adelante (Booking: 16 meses; Airbnb similar).
- **Preparation time** — días-buffer entre reservas (limpieza).
- **Gestión de orphan/gap nights** — minimums dinámicos para no dejar huecos imposibles de llenar.

### 2.3 Flujo de reserva

- **Instant Book**: cobro inmediato, reserva confirmada al instante. Airbnb favorece estos
  listados en su ranking (+20–30% de reservas).
- **Request to Book**: queda **`PENDING`**; el anfitrión tiene ~24h para aprobar/rechazar antes
  de que expire automáticamente. Se dispara también cuando el huésped no acepta house rules
  o pide horarios flexibles.
- **No-show**: estado propio; con tarifa no-reembolsable el huésped paga el total.
- **Modificaciones**: cambio de fechas/unidad sujeto a disponibilidad y política.
- **Overbooking**: a evitar con sync en tiempo real (no iCal lento).

### 2.4 Políticas de cancelación

Airbnb ofrece ~8 políticas estándar + opción no-reembolsable. Las más usadas:

| Política | Reembolso |
|---|---|
| Flexible | 100% si cancela ≥24h antes del check-in |
| Moderada | 100% si cancela ≥5 días antes |
| Estricta | 50% hasta cierta ventana; luego no-reembolsable |
| No-reembolsable | Sin reembolso, a cambio de tarifa con descuento |

El "reembolso total" real suele ser 80–86% porque el service fee no se devuelve.

### 2.5 Depósito de garantía y protección por daños

- Depósito de seguridad: usualmente **fuera de plataforma** (hold) entre US$100–5.000.
- Airbnb cubre con **AirCover** (hasta €3M). Para un PMS propio: registrar el monto del
  depósito, el hold y la liberación/retención post-checkout.

### 2.6 Reseñas

- **Doble-ciego**: huésped y anfitrión escriben; las reseñas se publican simultáneamente
  cuando ambos enviaron o al expirar la ventana (14 días). Ninguno ve la del otro antes.
- Rating multidimensional (limpieza, comunicación, ubicación, valor, check-in, exactitud).

### 2.7 Check-in / experiencia

- **Self check-in** (códigos, lockbox, smart lock), instrucciones, guía del lugar.
- **House rules** (mascotas, fiestas, fumar, huéspedes máximos) — aceptación obligatoria.
- **Verificación de huésped** (identidad).

### 2.8 Impuestos

- Impuesto de ocupación / transitorio por jurisdicción, **añadido al total** y desglosado.
- A veces lo recauda la plataforma; en un PMS propio, configurable por tenant/ciudad.

### 2.9 Channel manager / sincronización

- **iCal import/export** por unidad (mínimo viable para sincronizar con Airbnb/Booking/Vrbo).
- **API 2-way** (objetivo a largo plazo) para ARI (Availability, Rates, Inventory) en
  tiempo real y evitar dobles reservas.
- **Inbox unificado** de mensajería huésped↔anfitrión.

### 2.10 Operaciones / Housekeeping

Plataformas dedicadas (Breezeway, Guesty, ResortCleaning, SuiteOp) automatizan toda la
operación post-reserva. Ahorro reportado: 10–20 h/semana por equipo.

- **Auto-generación de tareas de limpieza** desde la reserva (en cada check-out programa turnover).
- **Checklists con foto obligatoria** para limpieza/inspección (mobile-first para el personal).
- **Asignación a personal de limpieza/proveedor** + agenda y notificaciones.
- **Gastos por tarea** que se registran automáticamente al completar (alimenta estados de propietario).
- **Mantenimiento preventivo** independiente de reservas.

> 365Soft ya tiene módulos `maintenance` y `vendors` + rol TECNICO; la limpieza de turnover
> es un primo cercano que puede reutilizar ese patrón.

### 2.11 Analytics / Revenue management

Las "Big 3" de la industria que hoy no calculamos:

- **Occupancy Rate** — noches vendidas / noches disponibles.
- **ADR** (Average Daily Rate) — ingreso medio por noche vendida.
- **RevPAR** (Revenue Per Available Night) — ADR × ocupación; el KPI más importante.
- Complementarios: **booking pace / pickup** (ritmo de reservas), **lead time**, LOS promedio,
  estacionalidad, ingreso por canal.

> El módulo `Reports` actual cubre largo plazo (Rent Roll, Delinquency, P&L…) pero **no** las
> métricas de hospedaje corto. Es un reporte nuevo.

### 2.12 Experiencia del huésped

- **Guía digital del lugar (guidebook)** — wifi, instrucciones, recomendaciones.
- **Self check-in / smart lock** — códigos de acceso temporales por reserva (integración Nuki/August/igloohome o lockbox).
- **Upsells** — check-in temprano, late check-out, limpieza extra, servicios — como extras opcionales del total.
- **Verificación de identidad** del huésped (KYC ligero).
- **Damage waiver** opcional como alternativa al depósito.

### 2.13 Confianza, ranking y crecimiento

- **Reseñas** (ya en G7) alimentan rating → multiplicador de precio y visibilidad.
- **Superhost / Guest Favorite** (Airbnb) y **Genius** (Booking): badges por desempeño
  (rating, tasa de respuesta, cancelaciones) que mejoran ranking. Equivalente propio:
  un score de calidad del listado/anfitrión por tenant.
- **Wishlist / favoritos** y **perfil de huésped** (historial, verificaciones) en el portal público.
- **Búsqueda avanzada con filtros** en el catálogo público: fechas+huéspedes, precio,
  amenidades, tipo, mapa.

### 2.14 Pagos y multi-moneda

- **Multi-moneda** de cara al huésped (pago en su moneda local) — relevante para el catálogo público internacional.
- **Métodos de pago locales** (ya hay infra por país en `tenant_config`: qr_accl, payu, stripe…).
- **Cobro online de la reserva** + reembolsos parciales según política.

---

## 3. Catálogo de módulos / funcionalidades faltantes

Agrupado por área. Cada fila es candidato a issue/épica.

### 3.1 Núcleo de reservas

| # | Funcionalidad | Prioridad | Esfuerzo |
|---|---|---|---|
| G1 | Gestión admin de reservas (lista, detalle, confirmar/cancelar/no-show) | 🔴 Alta | M |
| G2 | Request-to-Book vs Instant Book + expiración de PENDING (cron) | 🔴 Alta | M |
| G11 | Entidades TypeORM + migraciones para `reservations`/`property_availability` | 🔴 Alta | S |
| G13 | Modificación de reserva (cambio de fechas/unidad) y estados ampliados | 🟠 Media | M |

### 3.2 Pricing y disponibilidad

| # | Funcionalidad | Prioridad | Esfuerzo |
|---|---|---|---|
| G3 | Motor de pricing: descuentos (semanal/mensual/early/last-minute), weekend, fees (huésped extra/mascota/limpieza corta), impuesto ocupación, endpoint **quote** | 🔴 Alta | L |
| G4 | Restricciones por fecha: min/max LOS, CTA/CTD, advance notice, prep time, orphan-night rules | 🟠 Media | L |
| G12 | Calendario admin estilo OTA (precio + restricciones por día) | 🟠 Media | L |
| G14 | Pricing estacional/dinámico por reglas (`pricing_rules`) | 🟢 Baja | L |

### 3.3 Pagos, políticas y depósitos

| # | Funcionalidad | Prioridad | Esfuerzo |
|---|---|---|---|
| G6 | Cobro online de la reserva (Stripe/PayU) + reembolsos | 🟠 Media | L |
| G5 | Políticas de cancelación (flexible/moderada/estricta/no-reembolsable) + cálculo de reembolso | 🟠 Media | M |
| G15 | Depósito de garantía / hold + liberación/retención post-checkout | 🟠 Media | M |
| G16 | Multi-moneda de cara al huésped en catálogo público | 🟢 Baja | M |

### 3.4 Operaciones / Housekeeping

| # | Funcionalidad | Prioridad | Esfuerzo |
|---|---|---|---|
| G17 | Auto-generación de tareas de limpieza/turnover desde la reserva | 🟠 Media | M |
| G18 | Checklists con foto obligatoria + asignación a personal/proveedor | 🟢 Baja | M |
| G19 | Gastos por tarea → estados de propietario (enlaza `expenses`/`owner-statements`) | 🟢 Baja | S |

### 3.5 Experiencia del huésped

| # | Funcionalidad | Prioridad | Esfuerzo |
|---|---|---|---|
| G8 | House rules + self check-in/instrucciones + verificación huésped | 🟢 Baja | S |
| G10 | Mensajería huésped↔anfitrión por reserva (inbox) | 🟢 Baja | M |
| G20 | Guía digital del lugar (guidebook) | 🟢 Baja | S |
| G21 | Upsells (early/late check-in, limpieza extra, servicios) | 🟢 Baja | M |
| G22 | Smart lock / códigos de acceso temporales por reserva | 🟢 Baja | L |

### 3.6 Confianza, ranking y crecimiento

| # | Funcionalidad | Prioridad | Esfuerzo |
|---|---|---|---|
| G7 | Reseñas bidireccionales doble-ciego (huésped↔anfitrión) | 🟢 Baja | M |
| G23 | Score de calidad listado/anfitrión (estilo Superhost/Genius) | 🟢 Baja | M |
| G24 | Búsqueda avanzada + filtros + mapa en catálogo público | 🟠 Media | M |
| G25 | Wishlist/favoritos + perfil de huésped | 🟢 Baja | S |

### 3.7 Analytics y sincronización

| # | Funcionalidad | Prioridad | Esfuerzo |
|---|---|---|---|
| G26 | Reporte de hospedaje: Occupancy, ADR, RevPAR, pace/pickup | 🟠 Media | M |
| G9 | iCal import/export por unidad (anti doble-booking) | 🟠 Media | M |
| G27 | Channel manager API 2-way (Airbnb/Booking/Vrbo) — largo plazo | 🟢 Baja | XL |

`S` ≈ 1–2 días · `M` ≈ 3–5 días · `L` ≈ 1–2 semanas · `XL` ≈ 1 mes+ (referencia).

---

## 3-bis. Top prioridad (lo que desbloquea todo)

Del catálogo anterior, lo 🔴 Alta que hay que atacar primero:

- **G11** — entidades TypeORM + migraciones (prerequisito técnico de todo lo demás).
- **G1** — gestión admin de reservas (hoy no existe listar/confirmar/cancelar).
- **G2** — Request-to-Book vs Instant Book + expiración de pendientes.
- **G3** — motor de pricing con endpoint de quote.

---

## 4. Modelo de datos propuesto

> Migrar primero el SQL crudo a **entidades TypeORM** (G11) antes de extender.

### 4.1 Extender `units` (campos de pricing/reglas)

```
weekend_price            decimal   -- premium Vie/Sáb (o usar pricing_rules)
extra_guest_fee          decimal   -- por huésped extra/noche
extra_guest_threshold    int       -- a partir de cuántos huéspedes aplica
pet_fee                  decimal
pet_fee_unit             enum(per_pet, per_night, per_stay)
max_guests               int
advance_notice_days      int       -- antelación mínima
max_advance_days         int       -- ventana de reserva
prep_time_days           int       -- buffer entre reservas
instant_book             boolean   -- true = Instant Book; false = Request-to-Book
weekly_discount_pct      decimal
monthly_discount_pct     decimal
cancellation_policy      enum(flexible, moderate, strict, non_refundable)
house_rules              jsonb     -- {pets, smoking, parties, quiet_hours...}
checkin_instructions     text
```

### 4.2 Nueva tabla `unit_pricing_calendar` (precio/restricción por día) — G3/G4/G12

```
id, unit_id, date,
price                 decimal      -- override del precio base ese día
min_nights            int          -- LOS por fecha (override)
closed_to_arrival     boolean
closed_to_departure   boolean
UNIQUE(unit_id, date)
```

### 4.3 Nueva tabla `pricing_rules` (estacional/dinámico) — G3

```
id, unit_id (o property_id), name,
type        enum(seasonal, weekend, early_bird, last_minute, length_of_stay),
start_date, end_date,           -- para seasonal
adjustment_type enum(percent, fixed),
adjustment_value decimal,
condition   jsonb,              -- {min_days_before, min_nights...}
priority    int, active boolean
```

### 4.4 Extender `reservations`

```
guest_count          int
subtotal             decimal     -- noches * tarifa (con descuentos)
discount_total       decimal
extra_guest_fee      decimal
pet_fee              decimal
tax_total            decimal
deposit_amount       decimal
deposit_status       enum(none, held, released, retained)
payment_status       enum(pending, paid, partially_refunded, refunded)
cancellation_policy  enum(...)   -- congelada al momento de reservar
cancelled_at         timestamp
refund_amount        decimal
source               enum(direct, airbnb, booking, ical)  -- para channel mgr
expires_at           timestamp   -- para PENDING (Request-to-Book)
```

Estados ampliados: `PENDING → CONFIRMED → (IN_PROGRESS) → COMPLETED`,
con ramas `CANCELLED`, `EXPIRED`, `NO_SHOW`, `DECLINED`.

### 4.5 Nuevas tablas de soporte

- **`reservation_reviews`** — `reservation_id, author(guest|host), ratings jsonb,
  comment, submitted_at, published_at, visible boolean` (doble-ciego).
- **`reservation_messages`** — hilo por reserva (`sender_role, body, attachments, read_at`).
- **`reservation_taxes`** — desglose de impuestos aplicados (auditable).
- **`unit_ical_feeds`** — `unit_id, direction(import|export), url, last_synced_at` (G9).

---

## 5. Roadmap por fases

### Fase A — Cimientos (desbloquea todo) 🔴
- **G11**: entidades TypeORM `Reservation`, `PropertyAvailability` + migraciones.
- **G1**: endpoints admin `GET /:slug/admin/reservations` (lista + filtros), `GET /:id`,
  `PATCH /:id` (confirmar/cancelar/no-show), con `@RequirePermission('reservations', ...)`.
- Frontend: módulo admin **Reservas** (tabla + filtros auto-apply + panel detalle) y
  entrada en sidebar dinámico.

### Fase B — Reserva como en una OTA 🔴
- **G2**: `instant_book` por unidad; Request-to-Book ⇒ `PENDING` con `expires_at` y cron de
  expiración (reusar patrón `billing-cron.md`); notificación al admin para aprobar/rechazar.
- **G3**: motor de pricing — descuentos (semanal/mensual/early/last-minute), weekend, fees
  (huésped extra, mascota, limpieza corta), impuesto de ocupación. Endpoint de **quote**
  (`POST /:slug/catalog/.../quote`) que devuelve el desglose antes de reservar.
- Frontend: desglose de precio en el detalle público + flujo de solicitud/confirmación.

### Fase C — Pagos y políticas 🟠
- **G6**: cobro de la reserva e integración Stripe/PayU (ya en roadmap Fase 3); depósito/hold.
- **G5**: políticas de cancelación con cálculo de reembolso automático.

### Fase D — Calendario y restricciones avanzadas 🟠
- **G4 + G12**: `unit_pricing_calendar` + `pricing_rules`; calendario admin estilo OTA
  (editar precio y restricciones por día, CTA/CTD, advance notice, prep time).

### Fase E — Operaciones y analytics 🟠
- **G17–G19**: turnover/limpieza auto-generada desde la reserva, checklists con foto,
  gastos por tarea hacia estados de propietario (reusa `maintenance`/`vendors`/`expenses`).
- **G26**: reporte de hospedaje (Occupancy, ADR, RevPAR, pace/pickup) en el módulo `Reports`.

### Fase F — Confianza y sincronización 🟢/🟠
- **G7**: reseñas doble-ciego (huésped↔anfitrión).
- **G9**: iCal import/export por unidad (anti doble-booking) — paso previo al channel manager API.
- **G10**: mensajería por reserva (inbox).
- **G8 + G20**: house rules, self check-in, verificación de huésped, guidebook.

### Fase G — Crecimiento y experiencia 🟢
- **G24–G25**: búsqueda avanzada + filtros + mapa + wishlist/perfil de huésped en catálogo público.
- **G21–G22**: upsells y smart lock / códigos de acceso por reserva.
- **G23**: score de calidad listado/anfitrión (estilo Superhost/Genius).
- **G16**: multi-moneda de cara al huésped.
- **G27**: channel manager API 2-way (Airbnb/Booking/Vrbo) — largo plazo.

---

## 6. Decisiones abiertas (requieren confirmación de producto)

1. **Multi-huésped real**: ¿el `tenant_id` de la reserva es siempre un INQUILINO
   registrado, o se permite reserva de huésped no-registrado (guest) como en Airbnb?
2. **Pricing dinámico**: ¿motor propio basado en reglas (Fase D) o integración futura con
   PriceLabs/Beyond? Reglas propias cubren 80% sin dependencia externa.
3. **Impuestos**: ¿se modela en `tenant_config` (porcentaje por país, ya existe infra) o
   tabla dedicada por ciudad?
4. **Depósito**: ¿hold real vía pasarela o sólo registro contable (enlazar con
   [`accounting-plan.md`](accounting-plan.md))?
5. **Channel manager**: ¿iCal es suficiente a mediano plazo o se prioriza API 2-way?

---

## 7. Fuentes

- Airbnb — Using pricing tools, Set/customize nightly pricing, Smart Pricing
- Airbnb — Instant Book vs Request to Book, booking settings, security deposits, cancellation policies
- Booking.com for Partners — rates/availability, length-of-stay & advance restrictions, no-arrivals/no-departures, rate plans
- Airbnb — guidebooks, smart lock/self check-in, AirCover (damage protection $3M + liability $1M), Superhost, Guest Favorites, search ranking
- Booking.com — Genius loyalty program, Payments by Booking.com, multi-moneda
- Industria PMS — Avantio, Hostaway, Lodgify, PriceLabs, Guesty (dynamic pricing, channel manager, iCal vs API, seasonal/gap-night strategy)
- Operaciones — Breezeway, ResortCleaning, SuiteOp (housekeeping/turnover automation, checklists con foto)
- Analytics — Key Data, AirDNA, AirROI (Occupancy, ADR, RevPAR, pace/pickup)
