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
|--------|---------|--------|
| properties | Property, PropertyAddress, RentalOwner, PropertyOwner | ✅ Sincronizado |
| users | User | ✅ Sincronizado |
| contracts | Contract | ✅ Sincronizado |
| maintenance | MaintenanceRequest | ✅ Sincronizado |
| notifications | Notification | ✅ Sincronizado |
| applications | Application | ✅ Sincronizado |
| units | Unit | ✅ Sincronizado |
| **owner-statements** | **OwnerStatement** | **✅ F2-BE-07 Sincronizado** |

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
