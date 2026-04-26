# Alquiler Corto Plazo — Reservaciones

Módulo para gestionar disponibilidad y reservas de corto plazo (tipo Airbnb).  
Coexiste con el sistema de contratos anuales según la configuración `rental_type` del tenant.

---

## Índice

1. [Conceptos Clave](#1-conceptos-clave)
2. [Configuración Previa](#2-configuración-previa)
3. [Catálogo Público — Disponibilidad](#3-catálogo-público--disponibilidad)
4. [Admin — Bloqueo de Fechas](#4-admin--bloqueo-de-fechas)
5. [Portal Inquilino — Crear Reserva](#5-portal-inquilino--crear-reserva)
6. [Estados y Flujo](#6-estados-y-flujo)
7. [Validaciones del Sistema](#7-validaciones-del-sistema)
8. [Campos SHORT_TERM en Unidades](#8-campos-short_term-en-unidades)
9. [Base de Datos](#9-base-de-datos)

---

## 1. Conceptos Clave

| Concepto | Descripción |
|---|---|
| `rental_type` del tenant | Configurado en `tenant_config`. Restringe qué tipo de unidades se pueden crear |
| `rental_type` de la unidad | `SHORT_TERM`, `LONG_TERM` o `BOTH`. Debe ser coherente con el tenant |
| `property_availability` | Tabla con estado por fecha y unidad: `available / blocked / booked` |
| `reservations` | Reserva de corto plazo con fechas, precio y estado |

### Regla de coherencia `rental_type`

| Tenant config | Puede crear unidad |
|---|---|
| `LONG_TERM` | Solo `LONG_TERM` |
| `SHORT_TERM` | Solo `SHORT_TERM` |
| `BOTH` | `SHORT_TERM`, `LONG_TERM` o `BOTH` |

---

## 2. Configuración Previa

Para habilitar el módulo en un tenant, su `rental_type` debe ser `SHORT_TERM` o `BOTH`:

```bash
PATCH http://localhost:3000/{slug}/admin/config
Authorization: Bearer <token_admin>
Content-Type: application/json

{
  "rental_type": "BOTH"
}
```

Luego, al crear o actualizar una unidad, activar los campos de corto plazo:

```bash
PATCH http://localhost:3000/{slug}/admin/properties/1/units/5
Authorization: Bearer <token_admin>
Content-Type: application/json

{
  "rental_type": "SHORT_TERM",
  "price_per_night": 80,
  "cleaning_fee": 30,
  "min_nights": 2,
  "max_nights": 30,
  "checkin_time": "14:00",
  "checkout_time": "11:00"
}
```

---

## 3. Catálogo Público — Disponibilidad

### GET `/:slug/catalog/properties/:id/availability`

Retorna la disponibilidad de todos los días del mes indicado para una propiedad.  
**No requiere autenticación.**

#### Path Parameters

| Parámetro | Tipo | Descripción |
|---|---|---|
| `slug` | string | Identificador del tenant |
| `id` | number | ID de la propiedad |

#### Query Parameters

| Parámetro | Tipo | Requerido | Descripción | Ejemplo |
|---|---|---|---|---|
| `month` | string | **Sí** | Mes en formato `YYYY-MM` | `2026-06` |
| `unit_id` | number | No | Filtrar por unidad específica | `7` |

#### Ejemplo de Solicitud

```
GET http://localhost:3000/mi-inmobiliaria/catalog/properties/3/availability?month=2026-06&unit_id=7
```

#### Response 200 OK

```json
[
  { "date": "2026-06-01", "status": "available" },
  { "date": "2026-06-02", "status": "available" },
  { "date": "2026-06-03", "status": "blocked" },
  { "date": "2026-06-04", "status": "blocked" },
  { "date": "2026-06-05", "status": "booked" },
  { "date": "2026-06-06", "status": "booked" },
  { "date": "2026-06-07", "status": "available" }
]
```

#### Valores de `status`

| Status | Significado |
|---|---|
| `available` | Libre para reservar |
| `blocked` | Bloqueado manualmente por el admin (mantenimiento, etc.) |
| `booked` | Ocupado por una reserva confirmada |

#### Comportamiento

- Genera automáticamente todos los días del mes indicado
- Las fechas sin registro en BD se devuelven como `available`
- Si no se indica `unit_id`, retorna disponibilidad de toda la propiedad (unión de todas sus unidades)

#### Response 400 Bad Request

```json
{
  "statusCode": 400,
  "message": "El parámetro month debe tener formato YYYY-MM",
  "error": "Bad Request"
}
```

---

## 4. Admin — Bloqueo de Fechas

### POST `/:slug/admin/properties/:id/units/:unitId/block-dates`

Bloquea fechas manualmente en una unidad específica.  
Requiere permiso `reservations:edit`.

#### Path Parameters

| Parámetro | Tipo | Descripción |
|---|---|---|
| `slug` | string | Identificador del tenant |
| `id` | number | ID de la propiedad |
| `unitId` | number | ID de la unidad |

#### Request Body

```json
{
  "dates": ["2026-06-20", "2026-06-21", "2026-06-22"],
  "reason": "Mantenimiento programado de aire acondicionado"
}
```

#### Validaciones

| Campo | Tipo | Requerido | Descripción |
|---|---|---|---|
| `dates` | string[] | **Sí** | Array de fechas `YYYY-MM-DD`. Mínimo 1 elemento |
| `reason` | string | No | Motivo del bloqueo. Máx. 200 caracteres |

#### Ejemplo de Solicitud

```bash
curl -X POST http://localhost:3000/mi-inmobiliaria/admin/properties/3/units/7/block-dates \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "dates": ["2026-06-20", "2026-06-21"],
    "reason": "Mantenimiento"
  }'
```

#### Response 200 OK

```json
{
  "blocked": 2
}
```

#### Errores Posibles

| Código | Causa |
|---|---|
| `400` | La unidad no tiene `rental_type: SHORT_TERM` o `BOTH` |
| `404` | Unidad no encontrada en esa propiedad |
| `409` | Una o más fechas ya tienen reservas confirmadas (`booked`) — no se puede bloquear |

#### Comportamiento

- Si la fecha ya está en BD (con status `available` o `blocked`), hace **UPSERT** — actualiza su estado a `blocked`
- Si la fecha tiene status `booked`, lanza `409 Conflict` e indica las fechas conflictivas
- Las fechas bloqueadas aparecen como `blocked` en el catálogo

---

## 5. Portal Inquilino — Crear Reserva

### POST `/:slug/tenant/reservations`

Crea una reserva de corto plazo con fechas específicas.  
Requiere `Authorization: Bearer <token_inquilino>`.

#### Request Body

```json
{
  "property_id": 3,
  "unit_id": 7,
  "checkin_date": "2026-06-10",
  "checkout_date": "2026-06-15",
  "notes": "Llegaremos alrededor de las 15:00"
}
```

#### Validaciones

| Campo | Tipo | Requerido | Descripción |
|---|---|---|---|
| `property_id` | number | **Sí** | ID de la propiedad |
| `unit_id` | number | **Sí** | ID de la unidad |
| `checkin_date` | string | **Sí** | Fecha de ingreso `YYYY-MM-DD` |
| `checkout_date` | string | **Sí** | Fecha de salida `YYYY-MM-DD` |
| `notes` | string | No | Notas del huésped. Máx. 500 caracteres |

#### Ejemplo de Solicitud

```bash
curl -X POST http://localhost:3000/mi-inmobiliaria/tenant/reservations \
  -H "Authorization: Bearer <token_inquilino>" \
  -H "Content-Type: application/json" \
  -d '{
    "property_id": 3,
    "unit_id": 7,
    "checkin_date": "2026-06-10",
    "checkout_date": "2026-06-15"
  }'
```

#### Response 201 Created

```json
{
  "id": 42,
  "property_id": 3,
  "unit_id": 7,
  "tenant_id": 15,
  "checkin_date": "2026-06-10",
  "checkout_date": "2026-06-15",
  "nights": 5,
  "price_per_night": "80.00",
  "cleaning_fee": "30.00",
  "total_amount": "430.00",
  "currency": "BOB",
  "status": "confirmed",
  "notes": "Llegaremos alrededor de las 15:00",
  "created_at": "2026-04-26T14:30:00Z"
}
```

#### Cálculo de `total_amount`

```
total_amount = (price_per_night × nights) + cleaning_fee
```

Ejemplo: `(80 × 5) + 30 = 430 BOB`

#### Errores Posibles

| Código | Causa |
|---|---|
| `400` | `checkout_date` es anterior o igual a `checkin_date` |
| `400` | `checkin_date` está en el pasado |
| `400` | La unidad no tiene `rental_type: SHORT_TERM` o `BOTH` |
| `400` | El tenant está configurado solo como `LONG_TERM` |
| `400` | La estadía no cumple `min_nights` o supera `max_nights` de la unidad |
| `404` | Unidad no encontrada en esa propiedad |
| `409` | Una o más fechas de la estadía están bloqueadas o reservadas |

---

## 6. Estados y Flujo

### Estados de Reserva

```
pending → confirmed → completed
             ↓
          cancelled
```

| Estado | Descripción |
|---|---|
| `pending` | Pendiente de confirmación (reservado para flujo futuro con pago previo) |
| `confirmed` | Confirmada — actualmente todas las reservas se crean directamente como `confirmed` |
| `completed` | Estadía finalizada |
| `cancelled` | Cancelada |

### Estados de Disponibilidad

```
available ──(admin block)──→ blocked
available ──(reserva)──────→ booked
blocked   ──(desbloqueo*)──→ available
```

> `*` Endpoint de desbloqueo no implementado en esta versión.

---

## 7. Validaciones del Sistema

### Al crear una unidad con `rental_type`

El `UnitsService` valida automáticamente coherencia con `tenant_config`:

```
POST /:slug/admin/properties/:id/units
{
  "rental_type": "SHORT_TERM",
  ...
}
```

Si `tenant_config.rental_type = "LONG_TERM"`:

```json
{
  "statusCode": 400,
  "message": "El tenant está configurado como LONG_TERM. No se pueden crear unidades de tipo SHORT_TERM.",
  "error": "Bad Request"
}
```

---

## 8. Campos SHORT_TERM en Unidades

Campos nuevos en la entidad `Unit` para configurar alquiler de corto plazo:

| Campo | Tipo | Descripción | Ejemplo |
|---|---|---|---|
| `rental_type` | enum | `SHORT_TERM` / `LONG_TERM` / `BOTH` | `"SHORT_TERM"` |
| `price_per_night` | decimal | Precio por noche | `80.00` |
| `cleaning_fee` | decimal | Cargo único de limpieza por estadía | `30.00` |
| `min_nights` | integer | Mínimo de noches por reserva | `2` |
| `max_nights` | integer | Máximo de noches por reserva | `30` |
| `checkin_time` | string | Hora de ingreso (HH:MM) | `"14:00"` |
| `checkout_time` | string | Hora de salida (HH:MM) | `"11:00"` |

Estos campos se envían en `POST /:slug/admin/properties/:id/units` o `PATCH` sobre la misma ruta.

---

## 9. Base de Datos

### Tabla `property_availability`

```sql
CREATE TABLE property_availability (
  id             SERIAL      PRIMARY KEY,
  property_id    INT         NOT NULL,
  unit_id        INT         NOT NULL,
  date           DATE        NOT NULL,
  status         VARCHAR(20) NOT NULL DEFAULT 'available',
  reservation_id INT,                    -- referencia a reservations.id
  blocked_by     INT,                    -- user.id del admin que bloqueó
  notes          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_availability_unit_date UNIQUE (unit_id, date)
);
```

### Tabla `reservations`

```sql
CREATE TABLE reservations (
  id               SERIAL        PRIMARY KEY,
  property_id      INT           NOT NULL,
  unit_id          INT           NOT NULL,
  tenant_id        INT           NOT NULL,
  checkin_date     DATE          NOT NULL,
  checkout_date    DATE          NOT NULL,
  nights           INT           NOT NULL,
  price_per_night  DECIMAL(10,2) NOT NULL,
  cleaning_fee     DECIMAL(10,2) NOT NULL DEFAULT 0,
  total_amount     DECIMAL(10,2) NOT NULL,
  currency         VARCHAR(10)   NOT NULL DEFAULT 'BOB',
  status           VARCHAR(20)   NOT NULL DEFAULT 'confirmed',
  notes            TEXT,
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
```

### Columnas nuevas en `units`

```sql
ALTER TABLE units ADD COLUMN IF NOT EXISTS min_nights    INT;
ALTER TABLE units ADD COLUMN IF NOT EXISTS max_nights    INT;
ALTER TABLE units ADD COLUMN IF NOT EXISTS checkin_time  VARCHAR(5);
ALTER TABLE units ADD COLUMN IF NOT EXISTS checkout_time VARCHAR(5);
ALTER TABLE units ADD COLUMN IF NOT EXISTS cleaning_fee  DECIMAL(10,2);
```

> Todas las migraciones se aplican automáticamente al iniciar el servidor via `TenantsService.runStartupMigrations()`.

---

## Pruebas Rápidas

### 1. Consultar disponibilidad (mayo 2026)

```
GET http://localhost:3000/mi-inmobiliaria/catalog/properties/3/availability?month=2026-05&unit_id=7
```

### 2. Bloquear fechas (requiere token admin)

```bash
curl -X POST http://localhost:3000/mi-inmobiliaria/admin/properties/3/units/7/block-dates \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"dates": ["2026-05-20", "2026-05-21"], "reason": "Limpieza"}'
```

### 3. Crear reserva (requiere token inquilino)

```bash
curl -X POST http://localhost:3000/mi-inmobiliaria/tenant/reservations \
  -H "Authorization: Bearer <token_inquilino>" \
  -H "Content-Type: application/json" \
  -d '{
    "property_id": 3,
    "unit_id": 7,
    "checkin_date": "2026-05-10",
    "checkout_date": "2026-05-15"
  }'
```

### 4. Verificar disponibilidad actualizada

```
GET http://localhost:3000/mi-inmobiliaria/catalog/properties/3/availability?month=2026-05&unit_id=7
```

Los días 10-14 deben aparecer como `"booked"`.
