# Gestión de Proveedores Externos (Vendors)

Módulo para gestionar proveedores de servicios externos (plomeros, electricistas, limpieza, etc.) y asignarlos a órdenes de mantenimiento como alternativa a los técnicos internos.

---

## Índice

1. [Especialidades disponibles](#1-especialidades-disponibles)
2. [CRUD de Proveedores](#2-crud-de-proveedores)
3. [Historial de órdenes de un proveedor](#3-historial-de-órdenes-de-un-proveedor)
4. [Asignar vendor a una orden de mantenimiento](#4-asignar-vendor-a-una-orden-de-mantenimiento)
5. [Calificar al proveedor al cerrar la orden](#5-calificar-al-proveedor-al-cerrar-la-orden)
6. [Base de Datos](#6-base-de-datos)

---

## 1. Especialidades disponibles

| Valor | Descripción |
|---|---|
| `plumbing` | Plomería |
| `electrical` | Electricidad |
| `hvac` | Climatización / Calefacción / Ventilación |
| `cleaning` | Limpieza |
| `painting` | Pintura |
| `general` | Servicios generales |
| `other` | Otro |

---

## 2. CRUD de Proveedores

Todos los endpoints requieren `Authorization: Bearer <token>` con permiso `vendors`.

### GET `/:slug/admin/vendors`

Listar proveedores. Por defecto retorna solo los activos.

#### Query Parameters

| Parámetro | Tipo | Descripción | Ejemplo |
|---|---|---|---|
| `specialty` | enum | Filtrar por especialidad | `plumbing` |
| `search` | string | Buscar por nombre (parcial) | `Rápidas` |
| `is_active` | boolean | `true` (default) / `false` para ver inactivos | `false` |

#### Ejemplo

```
GET http://localhost:3000/mi-inmobiliaria/admin/vendors?specialty=electrical&is_active=true
```

#### Response 200 OK

```json
[
  {
    "id": 1,
    "name": "Instalaciones Rápidas S.R.L.",
    "specialty": "plumbing",
    "phone": "+591 76543210",
    "email": "contacto@instalaciones.bo",
    "address": "Av. Arce 1234, La Paz",
    "rate_per_hour": "80.00",
    "rate_flat": null,
    "is_active": true,
    "average_rating": "4.50",
    "notes": "Disponible lunes a viernes 8:00-18:00",
    "created_at": "2026-04-26T14:00:00Z"
  }
]
```

Los resultados se ordenan por `average_rating DESC` (mejor calificados primero).

---

### GET `/:slug/admin/vendors/:id`

Obtener proveedor por ID. Incluye contador de órdenes totales asignadas.

```
GET http://localhost:3000/mi-inmobiliaria/admin/vendors/1
```

**Response 200:** Mismo formato que el listado + campo `total_orders`.

---

### POST `/:slug/admin/vendors`

Crear un nuevo proveedor. Requiere permiso `vendors:create`.

#### Request Body

```json
{
  "name": "Instalaciones Rápidas S.R.L.",
  "specialty": "plumbing",
  "phone": "+591 76543210",
  "email": "contacto@instalaciones.bo",
  "address": "Av. Arce 1234, La Paz",
  "rate_per_hour": 80,
  "rate_flat": null,
  "notes": "Disponible lunes a viernes 8:00-18:00"
}
```

#### Campos

| Campo | Tipo | Requerido | Descripción |
|---|---|---|---|
| `name` | string | **Sí** | Nombre del proveedor (máx. 200 chars) |
| `specialty` | enum | **Sí** | Especialidad principal |
| `phone` | string | No | Teléfono (máx. 30 chars) |
| `email` | string (email) | No | Email de contacto |
| `address` | string | No | Dirección física |
| `rate_per_hour` | decimal | No | Tarifa por hora |
| `rate_flat` | decimal | No | Tarifa fija por servicio |
| `notes` | string | No | Notas internas |
| `is_active` | boolean | No | Default: `true` |

**Response 201 Created:** Proveedor creado con todos sus campos.

---

### PATCH `/:slug/admin/vendors/:id`

Actualizar datos de un proveedor. Requiere permiso `vendors:edit`.  
Todos los campos son opcionales — solo se actualizan los enviados.

```bash
curl -X PATCH http://localhost:3000/mi-inmobiliaria/admin/vendors/1 \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"rate_per_hour": 90, "notes": "Nueva tarifa desde mayo 2026"}'
```

---

### DELETE `/:slug/admin/vendors/:id`

**Desactivación lógica** (soft delete) — no elimina el registro. Requiere permiso `vendors:delete`.  
El proveedor queda con `is_active = false` y deja de aparecer en los listados por defecto.

```
DELETE http://localhost:3000/mi-inmobiliaria/admin/vendors/1
```

**Response 200:**
```json
{ "message": "Proveedor 1 desactivado correctamente" }
```

---

## 3. Historial de órdenes de un proveedor

### GET `/:slug/admin/vendors/:id/history`

Retorna todas las órdenes de mantenimiento que fueron asignadas al proveedor, ordenadas por fecha descendente.

```
GET http://localhost:3000/mi-inmobiliaria/admin/vendors/1/history
```

#### Response 200 OK

```json
[
  {
    "id": 42,
    "ticket_number": "MNT-2026-ABCDEF",
    "title": "Rotura de tubería en baño",
    "status": "COMPLETED",
    "priority": "HIGH",
    "current_stage": "COMPLETED",
    "vendor_rating": 5,
    "vendor_rating_comment": "Excelente trabajo, muy puntual",
    "vendor_rated_at": "2026-04-20T10:00:00Z",
    "created_at": "2026-04-15T08:00:00Z",
    "completed_at": "2026-04-19T16:00:00Z"
  },
  {
    "id": 38,
    "ticket_number": "MNT-2026-GHIJKL",
    "title": "Fuga en cocina",
    "status": "COMPLETED",
    "priority": "NORMAL",
    "current_stage": "COMPLETED",
    "vendor_rating": null,
    "vendor_rating_comment": null,
    "vendor_rated_at": null,
    "created_at": "2026-03-10T09:00:00Z",
    "completed_at": "2026-03-12T14:00:00Z"
  }
]
```

---

## 4. Asignar vendor a una orden de mantenimiento

### PATCH `/:slug/admin/maintenance/:id/assign-vendor`

Asigna un proveedor externo **o** un técnico interno a la orden. No pueden asignarse ambos simultáneamente.

#### Request Body — opción A: proveedor externo

```json
{ "vendor_id": 3 }
```

#### Request Body — opción B: técnico interno

```json
{ "assigned_to": 7 }
```

#### Validaciones

| Caso | Resultado |
|---|---|
| `vendor_id` + `assigned_to` al mismo tiempo | `400 Bad Request` |
| `vendor_id` de proveedor inactivo | `400 Bad Request` |
| `vendor_id` inexistente | `404 Not Found` |

#### Response 200 OK

Retorna la `MaintenanceRequest` actualizada con `vendor_id` poblado.

---

## 5. Calificar al proveedor al cerrar la orden

### POST `/:slug/admin/maintenance/:id/rate-vendor`

Califica al proveedor externo asignado a la orden. Solo puede hacerse una vez por orden y cuando la orden está `COMPLETED` o `CLOSED`.

#### Request Body

```json
{
  "rating": 4,
  "comment": "Trabajo bien hecho, llegó puntual pero tardó más de lo estimado"
}
```

| Campo | Tipo | Requerido | Descripción |
|---|---|---|---|
| `rating` | integer | **Sí** | Calificación del 1 al 5 |
| `comment` | string | No | Comentario sobre el trabajo (máx. 500 chars) |

#### Response 200 OK

Retorna la `MaintenanceRequest` con los campos `vendor_rating`, `vendor_rating_comment`, `vendor_rated_at` actualizados.

#### Errores

| Código | Causa |
|---|---|
| `400` | La orden no tiene proveedor asignado |
| `400` | El proveedor ya fue calificado para esta orden |
| `400` | La orden no está `COMPLETED` ni `CLOSED` |

#### Efecto sobre `average_rating`

Después de cada calificación, el sistema recalcula automáticamente el `average_rating` del proveedor como el promedio de todas sus calificaciones históricas (redondeado a 2 decimales).

---

## 6. Base de Datos

### Tabla `vendors`

```sql
CREATE TABLE vendors (
  id             SERIAL        PRIMARY KEY,
  name           VARCHAR(200)  NOT NULL,
  specialty      VARCHAR(50)   NOT NULL,   -- enum VendorSpecialty
  phone          VARCHAR(30),
  email          VARCHAR(200),
  address        TEXT,
  rate_per_hour  DECIMAL(10,2),
  rate_flat      DECIMAL(10,2),
  is_active      BOOLEAN       NOT NULL DEFAULT true,
  average_rating DECIMAL(3,2),             -- recalculado automáticamente
  notes          TEXT,
  created_by     INT,
  created_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
-- Índices: specialty (WHERE is_active), is_active
```

### Columnas nuevas en `maintenance_requests`

```sql
ALTER TABLE maintenance_requests ADD COLUMN IF NOT EXISTS vendor_id             INT;
ALTER TABLE maintenance_requests ADD COLUMN IF NOT EXISTS vendor_rating         INT;        -- 1-5
ALTER TABLE maintenance_requests ADD COLUMN IF NOT EXISTS vendor_rating_comment TEXT;
ALTER TABLE maintenance_requests ADD COLUMN IF NOT EXISTS vendor_rated_at       TIMESTAMPTZ;
ALTER TABLE maintenance_requests ADD COLUMN IF NOT EXISTS vendor_rated_by       INT;        -- user.id
-- Índice: vendor_id WHERE NOT NULL
```

> Todas las migraciones se aplican automáticamente al iniciar el servidor.
