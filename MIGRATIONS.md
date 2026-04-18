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
