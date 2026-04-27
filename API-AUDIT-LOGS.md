# API Documentation - Audit Logs (Registros de Auditoría)

Módulo de trazabilidad inmutable. Registra automáticamente todas las operaciones relevantes de negocio: creación/modificación de contratos, aprobación/rechazo de pagos y cambios de permisos de empleados.

**Base URL:** `http://localhost:3000`

**Autenticación:** Todas las endpoints requieren token JWT (`Authorization: Bearer <token>`)

**Acceso:** Solo roles `ADMIN` y `SUPERADMIN`. Los registros son de solo lectura — no hay endpoint de eliminación ni modificación.

---

## Índice

1. [Estructura de la Tabla](#1-estructura-de-la-tabla)
2. [Acciones Registradas](#2-acciones-registradas)
3. [Qué se Registra Automáticamente](#3-qué-se-registra-automáticamente)
4. [Endpoints](#4-endpoints)
5. [Ejemplos de Implementación](#5-ejemplos-de-implementación)

---

## 1. Estructura de la Tabla

La tabla `audit_logs` vive dentro del schema del tenant (`tenant_<slug>.audit_logs`). No hay datos de auditoría compartidos entre tenants.

```sql
CREATE TABLE audit_logs (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL,        -- ID del usuario que realizó la acción
  action      VARCHAR(30) NOT NULL,    -- Ver sección 2
  entity_type VARCHAR(50) NOT NULL,    -- 'contract', 'payment', 'employee', etc.
  entity_id   INTEGER NOT NULL,        -- ID del registro afectado
  old_values  JSONB,                   -- Estado anterior (null en creaciones)
  new_values  JSONB,                   -- Estado nuevo (null en eliminaciones)
  ip_address  VARCHAR(45),             -- IPv4 o IPv6 del cliente
  user_agent  VARCHAR(500),            -- User-Agent del navegador/cliente
  timestamp   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**Índices:**
```sql
-- Búsqueda por entidad + período (más frecuente)
CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_type, entity_id, timestamp DESC);
-- Búsqueda por usuario
CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
-- Filtro por tipo de acción
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
```

---

## 2. Acciones Registradas

| Valor (`action`) | Descripción |
|------------------|-------------|
| `created` | Creación de un nuevo registro |
| `updated` | Modificación de un registro existente |
| `deleted` | Eliminación de un registro |
| `approved` | Aprobación de una entidad (pago, solicitud) |
| `rejected` | Rechazo de una entidad |
| `status_changed` | Cambio de estado (ej. contrato BORRADOR → ACTIVO) |
| `signed` | Firma digital de un contrato |
| `renewed` | Renovación de un contrato |
| `permissions_updated` | Modificación de permisos de un empleado |

---

## 3. Qué se Registra Automáticamente

### Contratos (`entity_type: "contract"`)

| Evento | `action` | `old_values` | `new_values` |
|--------|----------|--------------|--------------|
| Crear contrato | `created` | `null` | `{ status, tenant_id, property_id, monthly_rent }` |
| Cambiar estado | `status_changed` | `{ status: "BORRADOR" }` | `{ status: "ACTIVO" }` |
| Firmar contrato | `signed` | `{ status: "BORRADOR" }` | `{ status: "ACTIVO", tenant_signature_date }` |
| Renovar contrato | `renewed` | `null` | `{ new_contract_id, previous_contract_id }` |

### Pagos (`entity_type: "payment"`)

| Evento | `action` | `old_values` | `new_values` |
|--------|----------|--------------|--------------|
| Aprobar pago | `approved` | `{ status: "PENDIENTE" }` | `{ status: "PAGADO" }` |
| Rechazar pago | `rejected` | `{ status: "PENDIENTE" }` | `{ status: "RECHAZADO", rejection_reason }` |

### Empleados (`entity_type: "employee"`)

| Evento | `action` | `old_values` | `new_values` |
|--------|----------|--------------|--------------|
| Crear empleado | `created` | `null` | `{ user_id, role }` |
| Actualizar permisos | `permissions_updated` | `null` | `{ permissions: [...] }` |
| Eliminar empleado | `deleted` | `{ user_id }` | `null` |

---

## 4. Endpoints

### 4.1 Listar Registros de Auditoría

**Endpoint:** `GET /:slug/admin/audit-logs`
**Auth:** Requerida — solo `ADMIN` o `SUPERADMIN`

**Query Params (todos opcionales):**

| Param | Tipo | Descripción | Ejemplo |
|-------|------|-------------|---------|
| `user_id` | number | Filtrar por usuario que realizó la acción | `?user_id=5` |
| `entity_type` | string | Filtrar por tipo de entidad | `?entity_type=contract` |
| `entity_id` | number | Filtrar por ID de entidad específica | `?entity_id=42` |
| `action` | string | Filtrar por tipo de acción (ver sección 2) | `?action=renewed` |
| `from` | string (ISO date) | Fecha de inicio del período | `?from=2024-01-01` |
| `to` | string (ISO date) | Fecha de fin del período | `?to=2024-12-31` |
| `page` | number | Página (default: 1) | `?page=2` |
| `limit` | number | Registros por página (default: 20, máx: 100) | `?limit=50` |

**Ejemplos de uso:**

```
# Ver todo lo que hizo el usuario 7 en enero
GET /:slug/admin/audit-logs?user_id=7&from=2024-01-01&to=2024-01-31

# Historial completo del contrato 42
GET /:slug/admin/audit-logs?entity_type=contract&entity_id=42

# Solo aprobaciones de pagos
GET /:slug/admin/audit-logs?entity_type=payment&action=approved

# Renovaciones del último mes
GET /:slug/admin/audit-logs?action=renewed&from=2024-03-01&to=2024-03-31
```

**Response (200):**
```json
{
  "data": [
    {
      "id": 1,
      "user_id": 5,
      "action": "renewed",
      "entity_type": "contract",
      "entity_id": 1,
      "old_values": null,
      "new_values": {
        "new_contract_id": 2,
        "previous_contract_id": 1
      },
      "ip_address": "192.168.1.100",
      "user_agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) ...",
      "timestamp": "2024-04-15T10:30:00.000Z"
    },
    {
      "id": 2,
      "user_id": 3,
      "action": "approved",
      "entity_type": "payment",
      "entity_id": 88,
      "old_values": { "status": "PENDIENTE" },
      "new_values": { "status": "PAGADO" },
      "ip_address": "10.0.0.1",
      "user_agent": null,
      "timestamp": "2024-04-14T08:15:00.000Z"
    }
  ],
  "total": 245,
  "page": 1,
  "limit": 20
}
```

**Notas:**
- Los resultados se ordenan por `timestamp DESC` (más reciente primero)
- `old_values` y `new_values` son objetos JSON o `null`
- `limit` se clampea automáticamente a máximo 100
- No existe endpoint de eliminación — los logs son inmutables por diseño

**Errores:**
- `403 Forbidden` — el usuario no tiene rol `ADMIN` o `SUPERADMIN`

---

## 5. Ejemplos de Implementación

### Ejemplo 1: Tabla de Auditoría en Angular

```typescript
// audit-logs.service.ts
interface AuditLog {
  id: number;
  user_id: number;
  action: string;
  entity_type: string;
  entity_id: number;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  ip_address: string | null;
  timestamp: string;
}

interface AuditLogsPage {
  data: AuditLog[];
  total: number;
  page: number;
  limit: number;
}

@Injectable({ providedIn: 'root' })
export class AuditLogsService {
  constructor(private http: HttpClient, private auth: AuthService) {}

  findAll(slug: string, filters: Partial<{
    user_id: number;
    entity_type: string;
    entity_id: number;
    action: string;
    from: string;
    to: string;
    page: number;
    limit: number;
  }>): Observable<AuditLogsPage> {
    const params = new HttpParams({ fromObject: filters as Record<string, string> });
    return this.http.get<AuditLogsPage>(
      `/${slug}/admin/audit-logs`,
      { params, headers: this.auth.headers() }
    );
  }
}
```

### Ejemplo 2: Ver historial de un contrato específico

```typescript
// En el componente de detalle de contrato
loadContractAuditHistory(contractId: number): void {
  this.auditLogsService.findAll(this.slug, {
    entity_type: 'contract',
    entity_id: contractId,
    limit: 50,
  }).subscribe(({ data }) => {
    this.auditHistory = data;
  });
}
```

### Ejemplo 3: Filtros en el panel de administración

```typescript
// Ejemplo de uso con filtros combinados
this.auditLogsService.findAll(this.slug, {
  entity_type: 'payment',
  action: 'approved',
  from: '2024-01-01',
  to: '2024-12-31',
  page: 1,
  limit: 20,
}).subscribe(result => {
  this.logs = result.data;
  this.totalPages = Math.ceil(result.total / result.limit);
});
```

---

## Resumen de Endpoints

| Método | Endpoint | Descripción | Roles |
|--------|----------|-------------|-------|
| `GET` | `/:slug/admin/audit-logs` | Listar logs con filtros y paginación | ADMIN, SUPERADMIN |

> No hay endpoints de creación, modificación ni eliminación — los logs son generados internamente por el sistema y son inmutables.

---

**Fin de la Documentación de Audit Logs**
