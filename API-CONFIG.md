# API Documentation - Configuración del Tenant

Documentación del módulo `tenant-config`. Gestiona la configuración regional de cada empresa: país, moneda, idioma, zona horaria, métodos de pago habilitados, comisiones y políticas de mora.

**Base URL:** `http://localhost:3000`
**Auth:** Todos los endpoints requieren `Authorization: Bearer <token>`

---

## Índice

1. [Estructura de tenant_config](#1-estructura-de-tenant_config)
2. [Inicialización automática](#2-inicialización-automática)
3. [Obtener configuración](#3-obtener-configuración)
4. [Actualizar configuración](#4-actualizar-configuración)
5. [Marcar wizard como completado](#5-marcar-wizard-como-completado)
6. [Valores por defecto por país](#6-valores-por-defecto-por-país)

---

## 1. Estructura de tenant_config

Cada tenant tiene exactamente **una fila** en esta tabla. Se crea automáticamente al registrar la empresa.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | integer | PK |
| `country` | varchar(2) | País: `US`, `BO`, `GT`, `HN` |
| `currency` | varchar(3) | Moneda: `USD`, `BOB`, `GTQ`, `HNL` |
| `language` | varchar(2) | Idioma: `en`, `es` |
| `timezone` | varchar(100) | Ej: `America/La_Paz` |
| `date_format` | varchar(20) | Ej: `DD/MM/YYYY` |
| `rental_type` | varchar(20) | `SHORT_TERM`, `LONG_TERM`, `BOTH` |
| `payment_methods` | JSONB | Array de métodos habilitados |
| `notification_channels` | JSONB | `{email, whatsapp, internal}` |
| `commission_percentage` | decimal(5,2) | % comisión de la empresa (0–100) |
| `grace_days_late_fee` | integer | Días de gracia antes de aplicar mora |
| `late_fee_percentage` | decimal(5,2) | % de mora (0–100) |
| `setup_completed` | boolean | `false` hasta que el wizard se complete |
| `created_at` | timestamp | — |
| `updated_at` | timestamp | — |

---

## 2. Inicialización automática

Al registrar una empresa con `POST /auth/register-admin`, el sistema crea la tabla `tenant_config` con los valores por defecto del país indicado en el campo `country`. No hay que llamar a ningún endpoint adicional para crearla.

Si el tenant ya existía (tenants anteriores a esta feature), la tabla se crea automáticamente en el próximo reinicio del servidor mediante `runStartupMigrations`.

---

## 3. Obtener configuración

**Endpoint:** `GET /:slug/admin/config`
**Auth:** Bearer token requerido

**Ejemplo:**
```
GET /mi-inmobiliaria/admin/config
Authorization: Bearer eyJhbGci...
```

**Response (200):**
```json
{
  "id": 1,
  "country": "BO",
  "currency": "BOB",
  "language": "es",
  "timezone": "America/La_Paz",
  "date_format": "DD/MM/YYYY",
  "rental_type": "BOTH",
  "payment_methods": ["qr_accl", "transferencia"],
  "notification_channels": {
    "email": true,
    "whatsapp": true,
    "internal": true
  },
  "commission_percentage": "10.00",
  "grace_days_late_fee": 5,
  "late_fee_percentage": "2.00",
  "setup_completed": false,
  "created_at": "2026-04-09T12:00:00.000Z",
  "updated_at": "2026-04-09T12:00:00.000Z"
}
```

---

## 4. Actualizar configuración

Todos los campos son opcionales. Solo se actualizan los que se envíen.

**Endpoint:** `PATCH /:slug/admin/config`
**Auth:** Bearer token requerido

**Request Body (todos opcionales):**
```json
{
  "country": "BO",
  "currency": "BOB",
  "language": "es",
  "timezone": "America/La_Paz",
  "date_format": "DD/MM/YYYY",
  "rental_type": "BOTH",
  "payment_methods": ["qr_accl", "transferencia"],
  "notification_channels": {
    "email": true,
    "whatsapp": true,
    "internal": true
  },
  "commission_percentage": 12.5,
  "grace_days_late_fee": 3,
  "late_fee_percentage": 2.5
}
```

**Valores aceptados por campo:**

| Campo | Valores válidos |
|-------|----------------|
| `country` | `"US"`, `"BO"`, `"GT"`, `"HN"` |
| `currency` | `"USD"`, `"BOB"`, `"GTQ"`, `"HNL"` |
| `language` | `"en"`, `"es"` |
| `rental_type` | `"SHORT_TERM"`, `"LONG_TERM"`, `"BOTH"` |
| `commission_percentage` | número entre 0 y 100 |
| `grace_days_late_fee` | entero >= 0 |
| `late_fee_percentage` | número entre 0 y 100 |
| `payment_methods` | array de strings |
| `notification_channels` | objeto `{email: bool, whatsapp: bool, internal: bool}` |

**Response (200):** Igual al GET, con los campos actualizados.

**Errores:**
```json
// 400 — Campo con valor inválido
{
  "statusCode": 400,
  "message": ["country must be one of the following values: US, BO, GT, HN"],
  "error": "Bad Request"
}

// 404 — Tenant config no encontrada (no debería ocurrir en condiciones normales)
{
  "statusCode": 404,
  "message": "Tenant config not found"
}
```

---

## 5. Marcar wizard como completado

Establece `setup_completed = true`. Llamar al terminar el wizard de configuración inicial para que el sistema sepa que el onboarding fue completado.

**Endpoint:** `PATCH /:slug/admin/config/setup-complete`
**Auth:** Bearer token requerido

**Request Body:** ninguno

**Response (200):**
```json
{
  "id": 1,
  "country": "BO",
  "setup_completed": true,
  ...
}
```

---

## 6. Valores por defecto por país

Al crear un tenant, `tenant_config` se inicializa según el `country` enviado en el registro:

### 🇧🇴 Bolivia (`BO`)
```json
{
  "currency": "BOB",
  "language": "es",
  "timezone": "America/La_Paz",
  "date_format": "DD/MM/YYYY",
  "rental_type": "BOTH",
  "payment_methods": ["qr_accl", "transferencia"],
  "notification_channels": { "email": true, "whatsapp": true, "internal": true },
  "commission_percentage": 10,
  "grace_days_late_fee": 5,
  "late_fee_percentage": 2
}
```

### 🇺🇸 EE.UU. (`US`)
```json
{
  "currency": "USD",
  "language": "en",
  "timezone": "America/New_York",
  "date_format": "MM/DD/YYYY",
  "rental_type": "LONG_TERM",
  "payment_methods": ["stripe", "ach", "paypal"],
  "notification_channels": { "email": true, "whatsapp": false, "internal": true },
  "commission_percentage": 0,
  "grace_days_late_fee": 5,
  "late_fee_percentage": 5
}
```

### 🇬🇹 Guatemala (`GT`)
```json
{
  "currency": "GTQ",
  "language": "es",
  "timezone": "America/Guatemala",
  "date_format": "DD/MM/YYYY",
  "rental_type": "BOTH",
  "payment_methods": ["stripe", "payu", "tarjeta"],
  "notification_channels": { "email": true, "whatsapp": true, "internal": true },
  "commission_percentage": 0,
  "grace_days_late_fee": 5,
  "late_fee_percentage": 3
}
```

### 🇭🇳 Honduras (`HN`)
```json
{
  "currency": "HNL",
  "language": "es",
  "timezone": "America/Tegucigalpa",
  "date_format": "DD/MM/YYYY",
  "rental_type": "LONG_TERM",
  "payment_methods": ["payu", "tarjeta", "transferencia"],
  "notification_channels": { "email": true, "whatsapp": true, "internal": true },
  "commission_percentage": 0,
  "grace_days_late_fee": 5,
  "late_fee_percentage": 3
}
```
