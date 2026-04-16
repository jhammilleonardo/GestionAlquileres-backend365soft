# API Documentation - Blacklist (Lista Negra de Inquilinos)

## 📋 Descripción General

Sistema de lista negra compartida entre todos los tenants en la plataforma. Permite que las inmobiliarias reporten inquilinos problemáticos y reciban alertas automáticas si una de ellas intenta aplicar a una propiedad.

**Objetivo**: Proteger las propiedades evitando que inquilinos con historial problemático logren arriendos en la plataforma.

---

## 🔐 Seguridad y Permisos

| Operación | Permiso Requerido | Schema | Datos Sensibles |
|-----------|------------------|--------|-----------------|
| Agregar a blacklist | ADMIN | public | ✅ Sí |
| Listar completa | ADMIN | public | ✅ Sí |
| Verificar documento | Autenticado | public | ⚠️ Solo resultado |
| Eliminar de blacklist | ADMIN | public | ✅ Sí |
| Audit Log | ADMIN | public | ✅ Muy sensible |

**Nota**: Datos compartidos en schema public entre TODOS los tenants.

---

## 📊 Base de Datos

### Tabla: `public.blacklisted_tenants`

```sql
CREATE TABLE public.blacklisted_tenants (
  id SERIAL PRIMARY KEY,
  full_name VARCHAR(255) NOT NULL,
  document_number VARCHAR(50) NOT NULL,
  document_type VARCHAR(50) NOT NULL,
  reason TEXT NOT NULL,
  reported_by_tenant_id INT NOT NULL REFERENCES public.tenant(id),
  admin_id INT,
  admin_email VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

**Índices**:
- `document_number` - Búsqueda rápida
- `document_type` - Filtrado por tipo
- `(document_number, document_type)` - Composite para búsquedas combinadas
- `created_at DESC` - Historiales recientes

### Tabla: `public.blacklist_audit_log`

Registro de auditoría para cumplimiento normativo:

```sql
CREATE TABLE public.blacklist_audit_log (
  id SERIAL PRIMARY KEY,
  action VARCHAR(50) NOT NULL,
  tenant_id INT NOT NULL REFERENCES public.tenant(id),
  admin_user_id INT,
  admin_email VARCHAR(255),
  blacklisted_tenant_id INT REFERENCES public.blacklisted_tenants(id),
  document_number VARCHAR(50),
  full_name VARCHAR(255),
  reason TEXT,
  ip_address VARCHAR(45),
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
```

---

## 🔌 Endpoints API

### 1️⃣ ADMIN - Agregar a Lista Negra

#### Endpoint
```
POST /:slug/admin/blacklist
```

#### Autenticación
```
Bearer Token (JWT) - Solo ADMIN
```

#### Request Body
```json
{
  "full_name": "Juan Pérez García",
  "document_number": "12345678",
  "document_type": "CEDULA",
  "reason": "Incumplimiento de contrato, daños a la propiedad, no pago de renta por 3 meses"
}
```

#### Response (201 Created)
```json
{
  "success": true,
  "id": 1,
  "message": "Inquilino Juan Pérez García agregado exitosamente a la lista negra"
}
```

#### Error Cases
```json
// 400 - Documento duplicado
{
  "statusCode": 400,
  "message": "Este documento ya se encuentra en la lista negra",
  "error": "Bad Request"
}

// 403 - No es ADMIN
{
  "statusCode": 403,
  "message": "Access denied"
}

// 401 - No autenticado
{
  "statusCode": 401,
  "message": "Unauthorized"
}
```

---

### 2️⃣ ADMIN - Listar Lista Negra Completa

#### Endpoint
```
GET /:slug/admin/blacklist
```

#### Autenticación
```
Bearer Token (JWT) - Solo ADMIN
```

#### Response (200 OK)
```json
[
  {
    "id": 1,
    "full_name": "Juan Pérez García",
    "document_number": "12345678",
    "document_type": "CEDULA",
    "reason": "Incumplimiento de contrato, daños a la propiedad",
    "reported_by_tenant_id": 1,
    "reported_by_tenant_name": "Inmobiliaria A",
    "admin_email": "admin@inmobiliariaa.bo",
    "created_at": "2026-04-16T10:30:00Z",
    "updated_at": "2026-04-16T10:30:00Z"
  },
  {
    "id": 2,
    "full_name": "María López",
    "document_number": "87654321",
    "document_type": "CEDULA",
    "reason": "No pago de servicios, abandono de propiedad",
    "reported_by_tenant_id": 2,
    "reported_by_tenant_name": "Inmobiliaria B",
    "admin_email": "admin@inmobiliariab.bo",
    "created_at": "2026-04-15T14:20:00Z",
    "updated_at": "2026-04-15T14:20:00Z"
  }
]
```

---

### 3️⃣ VERIFICACIÓN - Check Documento (GET)

#### Endpoint
```
GET /:slug/blacklist/check?document=12345678&document_type=CEDULA
```

#### Autenticación
```
Bearer Token (JWT) - Cualquier usuario autenticado
```

#### Query Parameters
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| document | string | ✅ Sí | Número de documento a verificar |
| document_type | string | ❌ No | Tipo de documento (default: CEDULA) |

#### Response - Documento NO Vetado (200 OK)
```json
{
  "is_blacklisted": false,
  "message": "✅ El documento no se encuentra en la lista negra"
}
```

#### Response - Documento SÍ Vetado (200 OK)
```json
{
  "is_blacklisted": true,
  "message": "⚠️ ALERTA: Este inquilino está en la lista negra",
  "details": {
    "id": 1,
    "full_name": "Juan Pérez García",
    "document_number": "12345678",
    "document_type": "CEDULA",
    "reason": "Incumplimiento de contrato, daños a la propiedad",
    "reported_by_tenant_id": 1,
    "created_at": "2026-04-16T10:30:00Z",
    "reported_by_tenant_name": "Inmobiliaria A"
  }
}
```

---

### 4️⃣ VERIFICACIÓN - Check Documento (POST)

#### Endpoint
```
POST /:slug/blacklist/check
```

#### Request Body
```json
{
  "document_number": "12345678",
  "document_type": "CEDULA"
}
```

#### Response
(Mismo que el endpoint GET)

---

### 5️⃣ ADMIN - Eliminar de Lista Negra

#### Endpoint
```
DELETE /:slug/admin/blacklist/:id
```

#### Autenticación
```
Bearer Token (JWT) - Solo ADMIN
```

#### URL Parameters
| Parameter | Type | Description |
|-----------|------|-------------|
| id | number | ID del registro en blacklist |

#### Response (200 OK)
```json
{
  "success": true,
  "message": "Registro Juan Pérez García eliminado de la lista negra"
}
```

#### Error Cases
```json
// 404 - Registro no encontrado
{
  "statusCode": 404,
  "message": "Registro en lista negra no encontrado",
  "error": "Not Found"
}
```

---

### 6️⃣ ADMIN - Obtener Audit Log (Solo Datos Sensibles)

#### Endpoint
```
GET /:slug/admin/blacklist/audit/log?limit=100
```

#### Autenticación
```
Bearer Token (JWT) - Solo ADMIN
```

#### Query Parameters
| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| limit | number | ❌ No | 100 | Cantidad de registros (máximo 500) |

#### Response (200 OK)
```json
[
  {
    "id": 1,
    "action": "CREATE",
    "tenant_id": 1,
    "admin_user_id": 5,
    "admin_email": "admin@inmobiliariaa.bo",
    "blacklisted_tenant_id": 1,
    "document_number": "12345678",
    "full_name": "Juan Pérez García",
    "ip_address": "192.168.1.100",
    "created_at": "2026-04-16T10:30:00Z"
  },
  {
    "id": 2,
    "action": "CHECK",
    "tenant_id": 2,
    "admin_user_id": null,
    "admin_email": null,
    "blacklisted_tenant_id": 1,
    "document_number": "12345678",
    "full_name": null,
    "ip_address": "192.168.1.105",
    "created_at": "2026-04-16T11:45:00Z"
  },
  {
    "id": 3,
    "action": "DELETE",
    "tenant_id": 1,
    "admin_user_id": 5,
    "admin_email": "admin@inmobiliariaa.bo",
    "blacklisted_tenant_id": 1,
    "document_number": "12345678",
    "full_name": "Juan Pérez García",
    "ip_address": "192.168.1.100",
    "created_at": "2026-04-16T15:20:00Z"
  }
]
```

---

## 🔄 Flujo de Integración con Solicitudes

### Cuando un Inquilino Envía una Solicitud:

```
POST /:slug/applications
│
├─ 1. Validar que sea INQUILINO
├─ 2. Validar que propiedad existe y está disponible
│
├─ 3. ✅ VERIFICACIÓN AUTOMÁTICA DE BLACKLIST
│   │   GET documento del personal_data
│   │   Llamar a blacklistService.checkBlacklist()
│   │   
│   ├─ Si documento está vetado:
│   │  ├─ Registrar alerta en application.blacklist_alert
│   │  ├─ Enviar notificación ESPECIAL a ADMINs: "⚠️ ALERTA: Inquilino Vetado"
│   │  └─ Incluir: motivo, quién lo reportó, tenant reporter
│   │
│   └─ Si no está vetado:
│       └─ Continuar normalmente
│
├─ 4. Crear solicitud en BD
├─ 5. Notificar a ADMINs
└─ 6. Retornar application (con alert si existe)
```

### Response Ejemplo con Alerta:
```json
{
  "id": 123,
  "property_id": 456,
  "applicant_id": 789,
  "status": "PENDIENTE",
  "personal_data": { ... },
  "created_at": "2026-04-16T12:00:00Z",
  "blacklist_alert": {
    "is_blacklisted": true,
    "reason": "Incumplimiento de contrato, daños a la propiedad",
    "reported_by": "Inmobiliaria A",
    "message": "⚠️ ALERTA: Este inquilino está en la lista negra"
  }
}
```

---

## 📱 Ejemplos de Uso (cURL)

### 1. Agregar a Lista Negra
```bash
curl -X POST 'http://localhost:3000/api/jhammil123/admin/blacklist' \
  -H 'Authorization: Bearer YOUR_JWT_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{
    "full_name": "Juan Pérez García",
    "document_number": "12345678",
    "document_type": "CEDULA",
    "reason": "Incumplimiento de contrato, daños a la propiedad, no pago por 3 meses"
  }'
```

### 2. Listar Blacklist Completa
```bash
curl -X GET 'http://localhost:3000/api/jhammil123/admin/blacklist' \
  -H 'Authorization: Bearer YOUR_JWT_TOKEN'
```

### 3. Verificar Documento
```bash
curl -X GET 'http://localhost:3000/api/jhammil123/blacklist/check?document=12345678&document_type=CEDULA' \
  -H 'Authorization: Bearer YOUR_JWT_TOKEN'
```

### 4. Verificar Documento (POST)
```bash
curl -X POST 'http://localhost:3000/api/jhammil123/blacklist/check' \
  -H 'Authorization: Bearer YOUR_JWT_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{
    "document_number": "12345678",
    "document_type": "CEDULA"
  }'
```

### 5. Eliminar de Blacklist
```bash
curl -X DELETE 'http://localhost:3000/api/jhammil123/admin/blacklist/1' \
  -H 'Authorization: Bearer YOUR_JWT_TOKEN'
```

### 6. Obtener Audit Log
```bash
curl -X GET 'http://localhost:3000/api/jhammil123/admin/blacklist/audit/log?limit=50' \
  -H 'Authorization: Bearer YOUR_JWT_TOKEN'
```

---

## ✅ Criterios de Aceptación (Completados)

- ✅ Tabla `blacklisted_tenants` en schema public
- ✅ Campos: id, full_name, document_number, document_type, reason, reported_by_tenant_id, created_at
- ✅ Solo ADMIN puede agregar (con motivo obligatorio)
- ✅ Verificación automática al iniciar screening (crear aplicación)
- ✅ Alerta automática en panel de screening con motivo y quién reportó
- ✅ POST /admin/blacklist para agregar
- ✅ GET /blacklist/check?document=X para verificar
- ✅ Registro de auditoría: quién agregó, cuándo, por qué
- ✅ Datos sensibles: solo ADMIN autenticado puede consultar

---

## 🛡️ Medidas de Seguridad

1. **Autenticación JWT**: Todos los endpoints requieren token válido
2. **Control de Roles**: Solo ADMIN puede modificar/listar
3. **Rate Limiting**: Protección contra fuerza bruta
4. **Audit Log**: Registro de todas las operaciones
5. **Schema Public**: Compartido entre tenants pero datos sensibles
6. **Validación de Entrada**: Class-validator en todos los DTOs
7. **IP Tracking**: Registro de dirección IP en audit log

---

## 📝 Notas Importantes

- **Datos Compartidos**: Todos los tenants pueden verificar documentos
- **Alertas Automáticas**: Los ADMINs recibirán notificación especial si un inquilino vetado intenta aplicar
- **No Bloquea Solicitud**: Un inquilino vetado PUEDE crear solicitud, pero genera alerta roja en panel
- **Auditoría Completa**: Cada acción es registrada para cumplimiento normativo
- **Razón Obligatoria**: Al agregar a blacklist, la razón es obligatoria y detallada

---

## 🔗 Relaciones

```
Tenant (public)
    ↓
blacklisted_tenants (public)
    ↓
blacklist_audit_log (public)
    ↓
rental_applications (schema específico del tenant)
    └─ Integración: Check automático en create()
```

---

**Implementado**: 16/04/2026 | **Fase**: F2-BE-09
