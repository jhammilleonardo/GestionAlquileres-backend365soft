# Database Migrations & Setup

Proceso automático de migraciones - Las tablas se crean automáticamente desde las **entidades TypeORM**.

**✨ SIN migraciones SQL manuales - Todo se sincroniza automáticamente en desarrollo**

---

## Setup (Automático)

### 1. Actualizar Código

```bash
git pull origin main
npm install
npm run build
```

### 2. Levantar Docker (Automático)

```bash
# Las migraciones se aplican automáticamente al levantar
docker compose down      # Detener contenedores existentes
docker compose up --build # Levantar con rebuild
```

**Eso es todo.** TypeORM sincroniza automáticamente las tablas desde las entidades.

### 3. Verificar Migraciones

```bash
# Conectar a la BD
docker exec -it gestion-postgres-dev psql -U postgres -d gestion_alquileres

# Desde psql:
\c gestion_alquileres
SET search_path TO tenant_mi_inmobiliaria;
\dt  # Ver todas las tablas

# Consulta de verificación
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'tenant_mi_inmobiliaria' 
ORDER BY table_name;
```

---

## Features

✅ **Sincronización Automática**: TypeORM crea/actualiza tablas desde entidades  
✅ **Sin SQL Manual**: No necesitas escritos de migración SQL  
✅ **Desarrollo Ágil**: Cambios en `@Entity` = cambios automáticos en BD  
✅ **Índices & Triggers Decorados**: Configurados en la entidad TypeORM  

---

## Entidades Sincronizadas

| Módulo | Entidad | Estado |
|---|---|---|
| properties | Property, PropertyAddress, RentalOwner, PropertyOwner | ✅ Sincronizado |
| users | User | ✅ Sincronizado |
| contracts | Contract | ✅ Sincronizado |
| maintenance | MaintenanceRequest | ✅ Sincronizado |
| notifications | Notification | ✅ Sincronizado |
| applications | RentalApplication | ✅ Sincronizado |
| applications | **ScreeningChecklist** | **✅ F2-BE-SCREENING Sincronizado** |
| units | Unit | ✅ Sincronizado |
| owner-statements | OwnerStatement | ✅ F2-BE-07 Sincronizado |
| reservations | property_availability, reservations | ✅ Sprint 5 — Startup Migration |
| vendors | vendors | ✅ Sprint 5 — Startup Migration |
| lifecycle-notifications | lifecycle_notification_log | ✅ Sprint 5 — Startup Migration |

---

## Recent Changes (Sprint 5 — Gestión de Vendors)

### Nuevos Archivos
- `src/vendors/` — Módulo completo: service, controller, DTOs, enums, tests
- `src/vendors/enums/vendor-specialty.enum.ts` — `plumbing/electrical/hvac/cleaning/painting/general/other`
- `src/maintenance/dto/assign-vendor.dto.ts` — DTO para asignar vendor o técnico
- `src/maintenance/dto/rate-vendor.dto.ts` — DTO para calificar vendor (1-5 + comentario)

### Archivos Modificados
- `src/maintenance/entities/maintenance-request.entity.ts` — 5 columnas nuevas: `vendor_id`, `vendor_rating`, `vendor_rating_comment`, `vendor_rated_at`, `vendor_rated_by`
- `src/maintenance/maintenance.service.ts` — Métodos `assignVendor()` y `rateVendor()`
- `src/maintenance/maintenance.controller.ts` — Endpoints `PATCH :id/assign-vendor` y `POST :id/rate-vendor`
- `src/tenants/tenants.service.ts` — 2 migraciones nuevas en `runStartupMigrations()`
- `src/app.module.ts` — `VendorsModule` registrado

### Base de Datos — Startup Migrations (idempotentes)

**Nueva tabla `vendors`:**
```sql
CREATE TABLE IF NOT EXISTS {schema}.vendors (
  id             SERIAL        PRIMARY KEY,
  name           VARCHAR(200)  NOT NULL,
  specialty      VARCHAR(50)   NOT NULL,
  phone          VARCHAR(30),
  email          VARCHAR(200),
  address        TEXT,
  rate_per_hour  DECIMAL(10,2),
  rate_flat      DECIMAL(10,2),
  is_active      BOOLEAN       NOT NULL DEFAULT true,
  average_rating DECIMAL(3,2),
  notes          TEXT,
  created_by     INT,
  created_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
-- Índices: specialty (WHERE is_active), is_active
```

**Columnas nuevas en `maintenance_requests`:**
```sql
ALTER TABLE {schema}.maintenance_requests ADD COLUMN IF NOT EXISTS vendor_id             INT;
ALTER TABLE {schema}.maintenance_requests ADD COLUMN IF NOT EXISTS vendor_rating         INT;
ALTER TABLE {schema}.maintenance_requests ADD COLUMN IF NOT EXISTS vendor_rating_comment TEXT;
ALTER TABLE {schema}.maintenance_requests ADD COLUMN IF NOT EXISTS vendor_rated_at       TIMESTAMPTZ;
ALTER TABLE {schema}.maintenance_requests ADD COLUMN IF NOT EXISTS vendor_rated_by       INT;
-- Índice: vendor_id WHERE NOT NULL
```

### Endpoints Nuevos

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| `GET` | `/:slug/admin/vendors` | Admin | Listar proveedores |
| `GET` | `/:slug/admin/vendors/:id` | Admin | Obtener proveedor |
| `POST` | `/:slug/admin/vendors` | Admin | Crear proveedor |
| `PATCH` | `/:slug/admin/vendors/:id` | Admin | Actualizar proveedor |
| `DELETE` | `/:slug/admin/vendors/:id` | Admin | Desactivar proveedor |
| `GET` | `/:slug/admin/vendors/:id/history` | Admin | Historial de órdenes |
| `PATCH` | `/:slug/admin/maintenance/:id/assign-vendor` | Admin | Asignar vendor/técnico |
| `POST` | `/:slug/admin/maintenance/:id/rate-vendor` | Admin | Calificar vendor (1-5) |

> Documentación completa: [API-VENDORS.md](./API-VENDORS.md)

---

## Recent Changes (Sprint 5 — Lifecycle Notifications)

### Nuevos Archivos
- `src/lifecycle-notifications/lifecycle-notifications.service.ts` — Lógica de eventos: contrato activado, vencimientos 60/30/15 días, inspección de salida, mantenimiento sin asignar
- `src/lifecycle-notifications/lifecycle-notifications.cron.ts` — Cron jobs: diario 08:00 UTC (contratos) y cada 6 horas (mantenimiento)
- `src/lifecycle-notifications/lifecycle-notifications.module.ts` — Módulo NestJS exportable

### Archivos Modificados
- `src/notifications/dto/create-notification.dto.ts` — 6 nuevos valores en `NotificationEventType`
- `src/notifications/entities/notification.entity.ts` — Mismos 6 valores en el enum de columna TypeORM
- `src/contracts/contracts.service.ts` — Hook `onContractActivated()` al activar y al firmar contrato
- `src/contracts/contracts.module.ts` — Importa `LifecycleNotificationsModule`
- `src/inspections/inspections.service.ts` — Hook `onMoveOutCompleted()` al completar inspección tipo `move_out`
- `src/inspections/inspections.module.ts` — Importa `LifecycleNotificationsModule`
- `src/tenants/tenants.service.ts` — Migración `createLifecycleNotificationLog` en `runStartupMigrations()`
- `src/app.module.ts` — `ScheduleModule.forRoot()` y `LifecycleNotificationsModule` registrados

### Base de Datos — Startup Migration (idempotente)

**Nueva tabla `lifecycle_notification_log`** (por schema de tenant):
```sql
CREATE TABLE IF NOT EXISTS {schema}.lifecycle_notification_log (
  id          SERIAL       PRIMARY KEY,
  entity_type VARCHAR(50)  NOT NULL,
  entity_id   INTEGER      NOT NULL,
  event_key   VARCHAR(100) NOT NULL,
  sent_at     TIMESTAMP    NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_lifecycle_notif_log UNIQUE (entity_id, entity_type, event_key)
);
CREATE INDEX IF NOT EXISTS idx_lifecycle_notif_log_entity
  ON {schema}.lifecycle_notification_log (entity_type, entity_id);
```

**Propósito:** Deduplicación de notificaciones automáticas. El cron no re-envía si ya existe una fila para `(entity_type, entity_id, event_key)`.

**Ejemplos de `event_key`:**
- `contract.expiring.60` + `entity_type = 'contract'` + `entity_id = 5`
- `maintenance.unassigned_reminder` + `entity_type = 'maintenance'` + `entity_id = 7`

> Documentación completa: [API-NOTIFICATIONS.md](./API-NOTIFICATIONS.md#8-notificaciones-automáticas-de-ciclo-de-vida)

---

## Recent Changes (Sprint 5 — Alquiler Corto Plazo)

### Nuevos Archivos
- `src/reservations/` — Módulo completo: service, controllers (3), DTOs, enums, tests
- `src/reservations/enums/availability-status.enum.ts` — `available / blocked / booked`
- `src/reservations/enums/reservation-status.enum.ts` — `pending / confirmed / cancelled / completed`

### Archivos Modificados
- `src/units/entities/unit.entity.ts` — 5 campos nuevos: `min_nights`, `max_nights`, `checkin_time`, `checkout_time`, `cleaning_fee`
- `src/units/dto/create-unit.dto.ts` — Validación de los 5 campos nuevos
- `src/units/units.service.ts` — Validación de coherencia `rental_type` unidad vs. `tenant_config`
- `src/properties/entities/property.entity.ts` — `rental_type` tipado con enum `RentalType`
- `src/employees/dto/create-employee.dto.ts` — Módulo `'reservations'` agregado a `AVAILABLE_MODULES`
- `src/tenants/tenants.service.ts` — 3 migraciones nuevas en `runStartupMigrations()`
- `src/app.module.ts` — `ReservationsModule` registrado

### Base de Datos — Startup Migrations (idempotentes)

**Columnas nuevas en `units`:**
```sql
ALTER TABLE {schema}.units ADD COLUMN IF NOT EXISTS min_nights    INT;
ALTER TABLE {schema}.units ADD COLUMN IF NOT EXISTS max_nights    INT;
ALTER TABLE {schema}.units ADD COLUMN IF NOT EXISTS checkin_time  VARCHAR(5);
ALTER TABLE {schema}.units ADD COLUMN IF NOT EXISTS checkout_time VARCHAR(5);
ALTER TABLE {schema}.units ADD COLUMN IF NOT EXISTS cleaning_fee  DECIMAL(10,2);
```

**Nueva tabla `property_availability`:**
```sql
CREATE TABLE IF NOT EXISTS {schema}.property_availability (
  id             SERIAL      PRIMARY KEY,
  property_id    INT         NOT NULL,
  unit_id        INT         NOT NULL,
  date           DATE        NOT NULL,
  status         VARCHAR(20) NOT NULL DEFAULT 'available',
  reservation_id INT,
  blocked_by     INT,
  notes          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_availability_unit_date UNIQUE (unit_id, date)
);
-- Índices: (property_id, date) y (unit_id, date)
```

**Nueva tabla `reservations`:**
```sql
CREATE TABLE IF NOT EXISTS {schema}.reservations (
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
-- Índices: (unit_id, checkin_date, checkout_date) y (tenant_id)
```

### Endpoints Nuevos

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| `GET` | `/:slug/catalog/properties/:id/availability` | Pública | Disponibilidad mensual |
| `POST` | `/:slug/admin/properties/:id/units/:unitId/block-dates` | Admin | Bloquear fechas |
| `POST` | `/:slug/tenant/reservations` | Inquilino | Crear reserva |

> Documentación completa: [API-RESERVATIONS.md](./API-RESERVATIONS.md)

---

## Recent Changes (F2-BE-SCREENING — Screening de Inquilinos)

### Nuevos Archivos
- `src/applications/enums/screening-final-status.enum.ts` — Enum `APPROVED | REJECTED | REQUIRES_COSIGNER`
- `src/applications/entities/screening-checklist.entity.ts` — Entidad TypeORM para el checklist
- `src/applications/dto/update-screening.dto.ts` — DTO validado para el endpoint de screening
- `src/applications/applications.service.spec.ts` — 10 tests unitarios del flujo de screening

### Archivos Modificados
- `src/applications/entities/application.entity.ts` — Campo `screening_fee_paid: boolean`
- `src/applications/applications.module.ts` — Registra `ScreeningChecklist` en TypeORM
- `src/applications/applications.service.ts` — Métodos `uploadDocuments`, `completeScreening`, `markScreeningFeePaid`
- `src/applications/applications.controller.ts` — 3 endpoints nuevos (documents, screening, screening-fee)
- `src/common/utils/multer.config.ts` — `applicationDocumentMulterConfig` para archivos de solicitudes
- `src/tenants/tenants.service.ts` — 2 migraciones idempotentes en `runStartupMigrations`

### Base de Datos — Startup Migrations (idempotentes)

**Columna nueva en `rental_applications`:**
```sql
ALTER TABLE {schema}.rental_applications
  ADD COLUMN IF NOT EXISTS screening_fee_paid BOOLEAN NOT NULL DEFAULT FALSE;
```

**Nuevo tipo enum:**
```sql
CREATE TYPE {schema}.screening_final_status_enum AS ENUM (
  'APPROVED', 'REJECTED', 'REQUIRES_COSIGNER'
);
```

**Nueva tabla `screening_checklist`:**
```sql
CREATE TABLE IF NOT EXISTS {schema}.screening_checklist (
  id                       SERIAL PRIMARY KEY,
  application_id           INTEGER NOT NULL UNIQUE
    REFERENCES {schema}.rental_applications(id) ON DELETE CASCADE,
  documents_verified       BOOLEAN NOT NULL DEFAULT FALSE,
  employer_call_name       VARCHAR(150),
  employer_call_phone      VARCHAR(30),
  employer_call_result     VARCHAR(50),
  previous_landlord_name   VARCHAR(150),
  previous_landlord_phone  VARCHAR(30),
  previous_landlord_result VARCHAR(50),
  blacklist_checked        BOOLEAN NOT NULL DEFAULT FALSE,
  blacklist_result         VARCHAR(50),
  notes                    TEXT,
  final_status             {schema}.screening_final_status_enum,
  reviewed_by              INTEGER REFERENCES {schema}."user"(id) ON DELETE SET NULL,
  reviewed_at              TIMESTAMP,
  created_at               TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMP NOT NULL DEFAULT NOW()
);
```

**Restricción clave:** `application_id UNIQUE` — una sola fila de checklist por solicitud (upsert garantizado).

### Almacenamiento de Archivos
```
storage/
└── applications/
    └── {tenant_slug}/
        └── {application_id}/
            ├── a1b2c3.jpg   ← carnet_anverso
            ├── d4e5f6.jpg   ← carnet_reverso
            ├── 7g8h9i.pdf   ← boleta_sueldo
            └── ...
```

Formatos aceptados: JPEG, PNG, WebP, PDF — máx 10 MB por archivo, hasta 10 archivos por llamada.

---

## Recent Changes (F2-BE-07)

### Nuevos Archivos
- `src/owner-statements/entities/owner-statement.entity.ts` - Entidad TypeORM
- `src/owner-statements/dto/owner-statement.dto.ts` - DTOs (CRUD)
- `src/owner-statements/owner-statements.service.ts` - Lógica de negocio
- `src/owner-statements/owner-statement-pdf.service.ts` - Generación de PDFs
- `src/owner-statements/owner-statements.controller.ts` - Endpoints Admin + Portal
- `src/owner-statements/owner-statements.module.ts` - Módulo NestJS

### Archivos Modificados
- `src/app.module.ts` - Registrar entidad OwnerStatement para sincronización TypeORM
- `src/payments/payments.module.ts` - Importar OwnerStatementsModule
- `src/payments/payments.service.ts` - Trigger automático de owner_statements al aprobar pago
- `src/rental-owners/rental-owners.controller.ts` - Endpoint para descargar PDF
- `src/rental-owners/rental-owners.module.ts` - Importar OwnerStatementsModule

### Base de Datos Automática
✅ Tabla `owner_statements` - Se crea automáticamente  
✅ Índices de performance - Decorados en la entidad  
✅ Trigger `updated_at` - Configurado en la entidad  

---

## Cómo Salir de Impasses de BD

Si encuentras problemas de sincronización:

### Opción 1: Limpiar y Reiniciar (Recomendado)
```bash
# Detener todas las instancias
docker compose down

# Eliminar volumen de datos (LIMPIA TODO)
docker volume rm gestion-alquileres_365soft-backend_postgres_dev_data

# Reiniciar con rebuild
docker compose up --build
```

### Opción 2: Reconectar sin Limpiar
```bash
docker compose restart backend
```

---

## Documentación Completa

- [Owner Statements API](src/owner-statements/README.md)
- [Payments Module](src/payments/README.md)
- [Rental Owners API](API-ADMIN.md#6-dueños-de-propiedades-rental-owners)

---

## Documentación

Ver [API-CATALOG.md](./API-CATALOG.md) para endpoints y ejemplos.
