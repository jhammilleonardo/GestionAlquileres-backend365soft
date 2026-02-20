# Módulo de Pagos — Documentación Completa

> **Última actualización:** 18 Feb 2026
> **Archivo fuente principal:** `src/payments/`

---

## Índice

1. [Estructura de archivos](#1-estructura-de-archivos)
2. [Endpoints Admin](#2-endpoints-admin)
3. [Endpoints Inquilino](#3-endpoints-inquilino)
4. [Enums y valores válidos](#4-enums-y-valores-válidos)
5. [Modelos de datos](#5-modelos-de-datos)
6. [DTOs — Cuerpos de petición](#6-dtos--cuerpos-de-petición)
7. [Ejemplos de peticiones y respuestas](#7-ejemplos-de-peticiones-y-respuestas)
8. [Lógica de negocio](#8-lógica-de-negocio)
9. [Autenticación y roles](#9-autenticación-y-roles)
10. [Esquema de base de datos](#10-esquema-de-base-de-datos)

---

## 1. Estructura de archivos

```
src/payments/
├── payments.module.ts
├── payments.controller.ts       ← AdminPaymentsController + TenantPaymentsController
├── payments.service.ts
├── dto/
│   ├── index.ts
│   ├── create-payment.dto.ts            ← Creación por inquilino
│   ├── create-payment-as-admin.dto.ts   ← Creación por admin
│   ├── update-payment-status.dto.ts     ← Aprobar / rechazar
│   ├── payment-filters.dto.ts           ← Filtros de listado
│   └── create-refund.dto.ts             ← Reembolsos
├── enums/
│   ├── index.ts
│   ├── payment-status.enum.ts
│   ├── payment-type.enum.ts
│   ├── payment-method.enum.ts
│   ├── currency.enum.ts
│   └── payment-processor.enum.ts
└── interfaces/
    └── payment.interface.ts

migrations/
└── create-payments-tables.sql
```

---

## 2. Endpoints Admin

**Base URL:** `/:slug/admin/payments`
**Guards:** `JwtAuthGuard` + `RolesGuard`
**Rol requerido:** `ADMIN`

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/:slug/admin/payments` | Listar todos los pagos (con filtros y paginación) |
| `GET` | `/:slug/admin/payments/stats` | Estadísticas globales de pagos |
| `POST` | `/:slug/admin/payments` | Registrar pago manualmente como admin |
| `GET` | `/:slug/admin/payments/:id` | Obtener detalle de un pago |
| `PATCH` | `/:slug/admin/payments/:id` | Actualizar estado (aprobar / rechazar) |
| `DELETE` | `/:slug/admin/payments/:id` | Eliminar un pago |
| `POST` | `/:slug/admin/payments/:id/refund` | Crear reembolso de un pago aprobado |

### GET `/:slug/admin/payments` — Listar pagos

**Query params disponibles:**

| Param | Tipo | Descripción |
|-------|------|-------------|
| `status` | `PaymentStatus` | Filtrar por estado |
| `type` | `PaymentType` | Filtrar por tipo |
| `method` | `PaymentMethod` | Filtrar por método |
| `currency` | `Currency` | Filtrar por moneda |
| `tenant_id` | `number` | Filtrar por inquilino |
| `property_id` | `number` | Filtrar por propiedad |
| `contract_id` | `number` | Filtrar por contrato |
| `date_from` | `string` (ISO) | Fecha inicio del rango |
| `date_to` | `string` (ISO) | Fecha fin del rango |
| `page` | `number` (default: 1) | Página |
| `limit` | `number` (default: 50) | Resultados por página |
| `sort` | ver abajo | Campo de ordenamiento |
| `order` | `ASC` / `DESC` (default: DESC) | Dirección del orden |

**Campos de ordenamiento permitidos (`sort`):**
`created_at`, `updated_at`, `payment_date`, `amount`, `status`, `tenant_id`, `property_id`

---

## 3. Endpoints Inquilino

**Base URL:** `/:slug/tenant/payments`
**Guards:** `JwtAuthGuard`
**Rol requerido:** cualquier usuario autenticado (solo ve sus propios pagos)

| Método | Ruta | Descripción |
|--------|------|-------------|
| `POST` | `/:slug/tenant/payments` | Registrar un nuevo pago |
| `GET` | `/:slug/tenant/payments` | Ver mis pagos |
| `GET` | `/:slug/tenant/payments/stats` | Ver mis estadísticas de pago |
| `GET` | `/:slug/tenant/payments/:id` | Ver detalle de un pago (verificación de propiedad) |

> El backend detecta automáticamente el contrato activo del inquilino al crear un pago.

---

## 4. Enums y valores válidos

### PaymentStatus — Estado del pago

| Valor | Descripción |
|-------|-------------|
| `PENDING` | Pendiente de revisión |
| `PROCESSING` | En proceso |
| `APPROVED` | Aprobado y completado |
| `REJECTED` | Rechazado por el admin |
| `FAILED` | Falló el procesamiento |
| `REFUNDED` | Reembolsado completamente |
| `REVERSED` | Cancelado / revertido |
| `DISPUTED` | En disputa / contracargo |

### PaymentType — Tipo de pago

| Valor | Descripción |
|-------|-------------|
| `RENT` | Renta mensual |
| `DEPOSIT` | Depósito de garantía |
| `LATE_FEE` | Cargo por pago tardío |
| `UTILITY` | Servicios (agua, luz, gas) |
| `HOA_FEE` | Cuota de administración |
| `PET_FEE` | Cargo por mascotas |
| `PARKING_FEE` | Cargo por estacionamiento |
| `APPLICATION_FEE` | Cargo por solicitud |
| `MAINTENANCE_FEE` | Cargo por mantenimiento |
| `OTHER` | Otro |

### PaymentMethod — Método de pago

| Valor | Descripción |
|-------|-------------|
| `TRANSFER` | Transferencia bancaria genérica |
| `CASH` | Efectivo |
| `CREDIT_CARD` | Tarjeta de crédito |
| `DEBIT_CARD` | Tarjeta de débito |
| `CHECK` | Cheque físico |
| `WIRE_TRANSFER` | Transferencia bancaria internacional |
| `ACH` | ACH (EE.UU.) |
| `ECHECK` | Cheque electrónico |
| `MONEY_ORDER` | Giro postal |
| `PAYPAL` | PayPal |
| `STRIPE` | Stripe |
| `ZELLE` | Zelle |
| `VENMO` | Venmo |
| `SEPA` | SEPA (Europa) |
| `OTHER` | Otro |

### Currency — Moneda

| Valor | Símbolo | Descripción |
|-------|---------|-------------|
| `BOB` | Bs | Boliviano (Bolivia) |
| `USD` | $ | Dólar estadounidense |
| `EUR` | € | Euro |
| `GBP` | £ | Libra esterlina |
| `MXN` | MX$ | Peso mexicano |
| `BRL` | R$ | Real brasileño |
| `COP` | COL$ | Peso colombiano |
| `CLP` | CL$ | Peso chileno |
| `PEN` | S/ | Sol peruano |
| `ARS` | AR$ | Peso argentino |
| `CAD` | CA$ | Dólar canadiense |
| `AUD` | A$ | Dólar australiano |

### PaymentProcessor — Procesador de pago

| Valor | Descripción |
|-------|-------------|
| `manual` | Entrada manual (sin procesador externo) |
| `stripe` | Stripe |
| `paypal` | PayPal |
| `square` | Square |
| `authorize_net` | Authorize.Net |
| `plaid` | Plaid (ACH) |
| `dwolla` | Dwolla (ACH) |
| `mercado_pago` | MercadoPago (Latinoamérica) |

---

## 5. Modelos de datos

### Payment — Pago

```typescript
interface Payment {
  // Identificadores
  id: number;

  // Relaciones
  tenant_id: number;
  contract_id: number;
  property_id: number;

  // Financiero
  amount: number;                    // DECIMAL(12,2)
  currency: Currency;                // Default: 'USD'

  // Información del pago
  payment_type: PaymentType;
  payment_method: PaymentMethod;
  status: PaymentStatus;             // Default: 'PENDING'

  // Fechas
  payment_date: string | Date;       // DATE
  due_date?: string | Date;
  processed_date?: string | Date;

  // Referencias
  reference_number?: string;         // Max 100
  transaction_id?: string;           // Max 255
  check_number?: string;             // Max 50

  // Procesador
  payment_processor: PaymentProcessor; // Default: 'manual'
  processor_fee?: number;

  // Archivos
  proof_file?: string;               // Comprobante del inquilino
  receipt_file?: string;             // Recibo del admin

  // Notas
  notes?: string;                    // Notas del inquilino
  admin_notes?: string;              // Notas internas del admin
  rejection_reason?: string;

  // Pagos parciales y recurrentes
  is_partial_payment: boolean;
  parent_payment_id?: number;        // ID del pago principal si es parcial
  is_recurring: boolean;
  recurring_schedule_id?: number;
  is_autopay: boolean;

  // Trazabilidad
  created_by?: number;               // ID del admin que creó
  approved_by?: number;              // ID del admin que aprobó
  approved_at?: string | Date;

  // Metadata flexible (JSON)
  metadata?: Record<string, any>;    // Datos específicos del método (ej: card_last_4)

  // Timestamps
  created_at: string | Date;
  updated_at: string | Date;

  // Relaciones opcionales (joins)
  tenant?: { id: number; name: string; email: string };
  property?: { id: number; title: string };
  contract?: { id: number; contract_number: string; start_date: string; end_date: string; status: string };
}
```

### PaymentStats — Estadísticas

```typescript
interface PaymentStats {
  total_payments: number;
  total_pending: number;
  total_processing: number;
  total_approved: number;
  total_rejected: number;
  total_failed: number;
  total_amount_pending: number;
  total_amount_approved: number;
  total_amount_failed: number;
  by_currency?: Record<string, { count: number; total_amount: number }>;
  by_type?: Record<string, number>;
  by_method?: Record<string, number>;
}
```

---

## 6. DTOs — Cuerpos de petición

### CreatePaymentDto — Inquilino crea pago

```json
{
  "amount": 1500.00,
  "currency": "BOB",
  "payment_type": "RENT",
  "payment_method": "TRANSFER",
  "payment_date": "2026-02-18",
  "due_date": "2026-02-28",
  "reference_number": "REF-001",
  "check_number": null,
  "notes": "Pago de renta febrero",
  "payment_processor": "manual",
  "is_partial_payment": false,
  "parent_payment_id": null,
  "is_recurring": false,
  "recurring_schedule_id": null
}
```

**Campos requeridos:** `amount`, `payment_type`, `payment_method`, `payment_date`

> El `contract_id` y `property_id` se detectan automáticamente del contrato activo del inquilino.

---

### CreatePaymentAsAdminDto — Admin registra pago manualmente

```json
{
  "tenant_id": 5,
  "contract_id": 3,
  "property_id": 2,
  "amount": 1500.00,
  "currency": "BOB",
  "payment_type": "RENT",
  "payment_method": "CASH",
  "status": "APPROVED",
  "payment_date": "2026-02-18",
  "due_date": null,
  "reference_number": "CASH-001",
  "check_number": null,
  "card_last_4_digits": null,
  "card_holder_name": null,
  "card_expiry": null,
  "bank_name": null,
  "bank_account_last_4": null,
  "payee_email": null,
  "received_by": "Maria Garcia",
  "notes": "Pago en efectivo recibido en oficina",
  "admin_notes": null,
  "payment_processor": "manual",
  "is_partial_payment": false,
  "is_recurring": false
}
```

**Campos requeridos:** `tenant_id`, `contract_id`, `property_id`, `amount`, `payment_type`, `payment_method`, `payment_date`

**Campos específicos por método de pago:**

| Método | Campos relevantes |
|--------|-------------------|
| `CREDIT_CARD` / `DEBIT_CARD` | `card_last_4_digits`, `card_holder_name`, `card_expiry` |
| `TRANSFER` / `WIRE_TRANSFER` / `ACH` | `bank_name`, `bank_account_last_4` |
| `PAYPAL` / `ZELLE` / `VENMO` | `payee_email` |
| `CASH` | `received_by` |
| `CHECK` | `check_number` |

> Si `status` es `APPROVED`, se registra automáticamente `approved_by` y `approved_at`.

---

### UpdatePaymentStatusDto — Admin actualiza estado

```json
{
  "status": "APPROVED",
  "admin_notes": "Comprobante verificado",
  "rejection_reason": null
}
```

**Para rechazar:**
```json
{
  "status": "REJECTED",
  "rejection_reason": "El comprobante no es legible",
  "admin_notes": "Solicitar al inquilino un comprobante más claro"
}
```

**Estados válidos para actualizar:** `PENDING`, `PROCESSING`, `APPROVED`, `REJECTED`, `FAILED`, `REFUNDED`, `REVERSED`, `DISPUTED`

---

### CreateRefundDto — Admin crea reembolso

```json
{
  "amount": 1500.00,
  "reason": "Pago duplicado detectado",
  "refund_method": "TRANSFER",
  "refund_date": "2026-02-19",
  "transaction_id": "TXN-456"
}
```

**Campos requeridos:** `amount`, `reason`
**Restricción:** El pago debe estar en estado `APPROVED`. El monto no puede superar el pago original.

---

## 7. Ejemplos de peticiones y respuestas

### Inquilino — Crear pago

```http
POST /mi-empresa/tenant/payments
Authorization: Bearer <TOKEN_INQUILINO>
Content-Type: application/json

{
  "amount": 1500.00,
  "payment_type": "RENT",
  "payment_method": "TRANSFER",
  "payment_date": "2026-02-18",
  "notes": "Renta febrero"
}
```

**Respuesta 201:**
```json
{
  "id": 15,
  "tenant_id": 5,
  "contract_id": 3,
  "property_id": 2,
  "amount": 1500.00,
  "currency": "BOB",
  "payment_type": "RENT",
  "payment_method": "TRANSFER",
  "status": "PENDING",
  "payment_date": "2026-02-18",
  "payment_processor": "manual",
  "is_partial_payment": false,
  "is_recurring": false,
  "is_autopay": false,
  "created_at": "2026-02-18T14:25:00Z",
  "updated_at": "2026-02-18T14:25:00Z"
}
```

---

### Admin — Listar pagos pendientes

```http
GET /mi-empresa/admin/payments?status=PENDING&page=1&limit=20
Authorization: Bearer <TOKEN_ADMIN>
```

**Respuesta 200:**
```json
{
  "payments": [
    {
      "id": 15,
      "tenant_id": 5,
      "contract_id": 3,
      "property_id": 2,
      "amount": 1500.00,
      "currency": "BOB",
      "payment_type": "RENT",
      "payment_method": "TRANSFER",
      "status": "PENDING",
      "payment_date": "2026-02-18",
      "created_at": "2026-02-18T14:25:00Z",
      "tenant": { "id": 5, "name": "Juan Pérez", "email": "juan@email.com" },
      "property": { "id": 2, "title": "Departamento 101" },
      "contract": { "id": 3, "contract_number": "CT-2024-001", "status": "ACTIVE" }
    }
  ],
  "total": 12,
  "page": 1,
  "limit": 20
}
```

---

### Admin — Aprobar pago

```http
PATCH /mi-empresa/admin/payments/15
Authorization: Bearer <TOKEN_ADMIN>
Content-Type: application/json

{
  "status": "APPROVED",
  "admin_notes": "Comprobante verificado correctamente"
}
```

**Respuesta 200:**
```json
{
  "id": 15,
  "status": "APPROVED",
  "admin_notes": "Comprobante verificado correctamente",
  "approved_by": 1,
  "approved_at": "2026-02-18T15:00:00Z",
  "updated_at": "2026-02-18T15:00:00Z"
}
```

---

### Admin — Crear pago manual (efectivo)

```http
POST /mi-empresa/admin/payments
Authorization: Bearer <TOKEN_ADMIN>
Content-Type: application/json

{
  "tenant_id": 5,
  "contract_id": 3,
  "property_id": 2,
  "amount": 1500.00,
  "payment_type": "RENT",
  "payment_method": "CASH",
  "status": "APPROVED",
  "payment_date": "2026-02-18",
  "received_by": "Maria Garcia",
  "notes": "Pago en efectivo"
}
```

---

### Admin — Estadísticas

```http
GET /mi-empresa/admin/payments/stats
Authorization: Bearer <TOKEN_ADMIN>
```

**Respuesta 200:**
```json
{
  "total_payments": 145,
  "total_pending": 12,
  "total_processing": 3,
  "total_approved": 120,
  "total_rejected": 8,
  "total_failed": 2,
  "total_amount_pending": 18000.00,
  "total_amount_approved": 180000.00,
  "total_amount_failed": 3000.00
}
```

---

## 8. Lógica de negocio

### Flujo estándar de un pago

```
Inquilino registra pago (PENDING)
        ↓
Admin revisa el comprobante
        ↓
   ┌────┴────┐
APPROVED   REJECTED
   ↓
Admin puede crear reembolso (REFUNDED)
```

### Detección automática de contrato (creación por inquilino)

Cuando el inquilino crea un pago, el backend busca automáticamente su contrato activo. No es necesario enviar `contract_id` ni `property_id`.

### Pagos parciales

- Se puede indicar `is_partial_payment: true`
- Referenciar el pago principal con `parent_payment_id`

### Pagos recurrentes

- Se puede configurar un `recurring_schedule_id`
- La tabla `payment_schedules` gestiona frecuencia, día de cobro y fechas

### Metadata por método de pago

Los campos específicos del método (número de tarjeta, banco, etc.) se almacenan en el campo `metadata` (JSONB) de la tabla. El admin los envía directamente en el body del DTO y el servicio los extrae.

### Transacciones

Todas las operaciones de escritura usan `QueryRunner` con rollback automático en caso de error.

### Multi-tenant

El módulo usa `SET search_path TO [schema]` en cada query para aislar los datos por empresa (slug).

---

## 9. Autenticación y roles

Todos los endpoints requieren un token JWT válido en el header:

```
Authorization: Bearer <TOKEN>
```

| Endpoint | Rol requerido |
|----------|---------------|
| `/:slug/admin/payments/*` | `ADMIN` |
| `/:slug/tenant/payments/*` | Cualquier usuario autenticado |

Los endpoints de inquilino aplican una verificación de propiedad: el inquilino solo puede ver sus propios pagos.

---

## 10. Esquema de base de datos

### Tabla principal: `payments`

```sql
CREATE TABLE payments (
  id                    SERIAL PRIMARY KEY,

  -- Relaciones
  tenant_id             INTEGER NOT NULL,
  contract_id           INTEGER NOT NULL,
  property_id           INTEGER NOT NULL,

  -- Financiero
  amount                DECIMAL(12, 2) NOT NULL CHECK (amount >= 0),
  currency              VARCHAR(3) NOT NULL DEFAULT 'USD',

  -- Tipo y método
  payment_type          VARCHAR(50) NOT NULL,
  payment_method        VARCHAR(50) NOT NULL,

  -- Estado
  status                VARCHAR(20) NOT NULL DEFAULT 'PENDING',

  -- Fechas
  payment_date          DATE NOT NULL,
  due_date              DATE,
  processed_date        TIMESTAMP,

  -- Referencias
  reference_number      VARCHAR(100),
  transaction_id        VARCHAR(255),
  check_number          VARCHAR(50),

  -- Procesador
  payment_processor     VARCHAR(50) DEFAULT 'manual',
  processor_fee         DECIMAL(10, 2) DEFAULT 0,

  -- Archivos
  proof_file            VARCHAR(255),
  receipt_file          VARCHAR(255),

  -- Notas
  notes                 TEXT,
  admin_notes           TEXT,
  rejection_reason      TEXT,

  -- Pagos parciales y recurrentes
  is_partial_payment    BOOLEAN DEFAULT false,
  parent_payment_id     INTEGER REFERENCES payments(id) ON DELETE SET NULL,
  is_recurring          BOOLEAN DEFAULT false,
  recurring_schedule_id INTEGER,
  is_autopay            BOOLEAN DEFAULT false,

  -- Trazabilidad
  created_by            INTEGER,
  approved_by           INTEGER,
  approved_at           TIMESTAMP,

  -- Metadata flexible
  metadata              JSONB,

  -- Timestamps
  created_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Tabla: `payment_schedules` (pagos recurrentes)

```sql
CREATE TABLE payment_schedules (
  id                  SERIAL PRIMARY KEY,
  tenant_id           INTEGER NOT NULL,
  contract_id         INTEGER NOT NULL,
  property_id         INTEGER NOT NULL,
  amount              DECIMAL(12, 2) NOT NULL,
  currency            VARCHAR(3) DEFAULT 'USD',
  payment_type        VARCHAR(50) NOT NULL,
  payment_method      VARCHAR(50) NOT NULL,

  -- Configuración de recurrencia
  frequency           VARCHAR(20) NOT NULL,  -- MONTHLY, WEEKLY, BIWEEKLY, QUARTERLY, YEARLY
  start_date          DATE NOT NULL,
  end_date            DATE,
  day_of_month        INTEGER CHECK (day_of_month BETWEEN 1 AND 31),

  -- Estado
  is_active           BOOLEAN DEFAULT true,
  last_payment_date   DATE,
  next_payment_date   DATE,

  -- Auto-pago
  autopay_enabled     BOOLEAN DEFAULT false,
  autopay_method      VARCHAR(50),
  autopay_token       VARCHAR(255),

  created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Tabla: `payment_refunds` (reembolsos)

```sql
CREATE TABLE payment_refunds (
  id            SERIAL PRIMARY KEY,
  payment_id    INTEGER NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  amount        DECIMAL(12, 2) NOT NULL CHECK (amount > 0),
  reason        TEXT,
  refund_method VARCHAR(50),
  refund_date   DATE NOT NULL,
  transaction_id VARCHAR(255),
  processed_by  INTEGER,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Índices

```sql
-- Tabla payments
CREATE INDEX idx_payments_tenant       ON payments(tenant_id);
CREATE INDEX idx_payments_contract     ON payments(contract_id);
CREATE INDEX idx_payments_property     ON payments(property_id);
CREATE INDEX idx_payments_status       ON payments(status);
CREATE INDEX idx_payments_date         ON payments(payment_date);
CREATE INDEX idx_payments_created_at   ON payments(created_at);
CREATE INDEX idx_payments_currency     ON payments(currency);
CREATE INDEX idx_payments_type         ON payments(payment_type);
CREATE INDEX idx_payments_method       ON payments(payment_method);

-- Tabla payment_schedules
CREATE INDEX idx_schedules_tenant      ON payment_schedules(tenant_id);
CREATE INDEX idx_schedules_contract    ON payment_schedules(contract_id);
CREATE INDEX idx_schedules_active      ON payment_schedules(is_active);
CREATE INDEX idx_schedules_next_date   ON payment_schedules(next_payment_date);

-- Tabla payment_refunds
CREATE INDEX idx_refunds_payment       ON payment_refunds(payment_id);
CREATE INDEX idx_refunds_date          ON payment_refunds(refund_date);
```

---

*Documentación generada el 18 Feb 2026 basada en el código fuente del módulo de pagos.*
