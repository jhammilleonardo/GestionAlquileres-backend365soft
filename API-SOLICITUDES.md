# API Documentation - Sistema de Solicitudes de Alquiler

Esta documentación cubre el sistema completo de solicitudes de alquiler. Los inquilinos pueden enviar solicitudes para propiedades y los administradores pueden revisarlas, aprobarlas o rechazarlas. Al aprobar una solicitud se auto-genera un contrato de alquiler.

**Base URL:** `http://localhost:3000`

**Autenticación:** Todas las endpoints requieren token JWT (`Authorization: Bearer <token>`)

---

## Índice

1. [Portal de Inquilinos - Solicitudes de Alquiler](#1-portal-de-inquilinos---solicitudes-de-alquiler)
2. [Panel de Administración - Solicitudes de Alquiler](#2-panel-de-administración---solicitudes-de-alquiler)
3. [Estados de Solicitud](#3-estados-de-solicitud)
4. [Flujo Completo de Solicitud a Contrato](#4-flujo-completo-de-solicitud-a-contrato)
5. [Validaciones y Errores](#5-validaciones-y-errores)

---

## 1. Portal de Inquilinos - Solicitudes de Alquiler

### 1.1 Enviar Nueva Solicitud de Alquiler

Los inquilinos pueden solicitar una propiedad disponible incluyendo sus datos personales, laborales, historial de alquiler y referencias.

**Endpoint:** `POST /:slug/applications`
**Auth:** Requerida (USER/Inquilino)
**Role:** Inquilino/USER

**URL Params:**
- `slug` - Slug de la inmobiliaria (ej: "inmo-sur")

**Request Body:**
```json
{
  "property_id": 1,
  "personal_data": {
    "full_name": "Pedro Cliente",
    "phone": "+59178547855",
    "email": "pedro.cliente@email.com",
    "birth_date": "1990-05-15",
    "national_id": "12345678",
    "marital_status": "soltero",
    "number_of_dependents": 0
  },
  "employment_data": {
    "current_job": {
      "company": "TechCorp Bolivia",
      "position": "Ingeniero de Software",
      "salary": 4500.00,
      "currency": "BOB",
      "start_date": "2020-03-01",
      "employment_type": "tiempo_completo",
      "supervisor_name": "Juan Pérez",
      "supervisor_phone": "+59178123456"
    },
    "previous_job": {
      "company": "Software Solutions",
      "position": "developer junior",
      "salary": 2000.00,
      "end_date": "2020-02-28"
    }
  },
  "rental_history": [
    {
      "property_address": "Calle Principal 123, La Paz",
      "landlord_name": "Roberto García",
      "landlord_phone": "+59178111111",
      "monthly_rent": 2500.00,
      "start_date": "2018-01-01",
      "end_date": "2020-02-29",
      "reason_for_leaving": "cambio_de_ciudad"
    }
  ],
  "references": {
    "personal": [
      {
        "name": "Carlos López",
        "relationship": "amigo",
        "phone": "+59178222222",
        "email": "carlos@email.com"
      }
    ],
    "professional": [
      {
        "name": "Juan Pérez",
        "company": "TechCorp Bolivia",
        "position": "Jefe",
        "phone": "+59178123456",
        "email": "juan.perez@techcorp.com"
      }
    ]
  },
  "documents": [
    {
      "type": "cedula_identidad",
      "url": "https://s3.aws.com/docs/cedula-12345678.pdf",
      "uploaded_date": "2026-02-12"
    },
    {
      "type": "comprobante_ingresos",
      "url": "https://s3.aws.com/docs/nomina-feb-2026.pdf",
      "uploaded_date": "2026-02-12"
    }
  ],
  "additional_notes": "Tengo mascotas pero pequeñas y bien cuidadas"
}
```

**Response (201):**
```json
{
  "id": 5,
  "property_id": 1,
  "applicant_id": 8,
  "status": "PENDIENTE",
  "personal_data": {
    "full_name": "Pedro Cliente",
    "phone": "+59178547855",
    "email": "pedro.cliente@email.com",
    "birth_date": "1990-05-15",
    "national_id": "12345678",
    "marital_status": "soltero",
    "number_of_dependents": 0
  },
  "employment_data": {
    "current_job": {
      "company": "TechCorp Bolivia",
      "position": "Ingeniero de Software",
      "salary": 4500.00,
      "currency": "BOB"
    }
  },
  "rental_history": [...],
  "references": {...},
  "documents": [...],
  "additional_notes": "Tengo mascotas pero pequeñas y bien cuidadas",
  "admin_feedback": null,
  "created_at": "2026-02-12T15:30:00Z",
  "updated_at": "2026-02-12T15:30:00Z"
}
```

**Validaciones:**
- La propiedad debe existir y estar en estado `DISPONIBLE`
- El inquilino no puede tener más de una solicitud `PENDIENTE` para la misma propiedad
- Los datos personales requeridos: full_name, phone, email, birth_date, national_id
- El salario debe ser un número positivo
- Las fechas deben ser válidas

**Notas Importantes:**
- Se notifica automáticamente a todos los administradores
- El estado inicial es siempre `PENDIENTE`
- La solicitud se vincula automáticamente al Usuario autenticado

---

### 1.2 Ver Mis Solicitudes

Obtiene todas las solicitudes enviadas por el inquilino autenticado.

**Endpoint:** `GET /:slug/applications/my-applications`
**Auth:** Requerida (USER/Inquilino)
**Role:** Inquilino/USER

**URL Params:**
- `slug` - Slug de la inmobiliaria

**Query Params (Opcionales):**
```
?status=PENDIENTE
?status=APROBADA
?status=RECHAZADA
```

**Response (200):**
```json
[
  {
    "id": 5,
    "property_id": 1,
    "applicant_id": 8,
    "status": "PENDIENTE",
    "personal_data": {
      "full_name": "Pedro Cliente",
      "phone": "+59178547855",
      "email": "pedro.cliente@email.com"
    },
    "employment_data": {
      "current_job": {
        "company": "TechCorp Bolivia",
        "position": "Ingeniero de Software",
        "salary": 4500.00
      }
    },
    "properties_title": "Chalet Moderno en Zona Sud",
    "created_at": "2026-02-12T15:30:00Z",
    "updated_at": "2026-02-12T15:30:00Z"
  },
  {
    "id": 3,
    "property_id": 2,
    "applicant_id": 8,
    "status": "RECHAZADA",
    "personal_data": { ... },
    "admin_feedback": "No cumple con los requisitos de ingresos solicitados",
    "property_title": "Apartamento Centro",
    "created_at": "2026-02-10T10:00:00Z",
    "updated_at": "2026-02-11T14:20:00Z"
  }
]
```

**Notas:**
- Solo muestra solicitudes del usuario autenticado
- Ordenadas por fecha de creación descendente (más recientes primero)
- Incluye feedback del admin si fue rechazada

---

### 1.3 Ver Detalle de Mi Solicitud

Obtiene los detalles completos de una solicitud específica del inquilino.

**Endpoint:** `GET /:slug/applications/:id`
**Auth:** Requerida (USER/Inquilino o ADMIN)
**Role:** Inquilino (propietario de la solicitud) o Admin

**URL Params:**
- `slug` - Slug de la inmobiliaria
- `id` - ID de la solicitud

**Response (200):**
```json
{
  "id": 5,
  "property_id": 1,
  "applicant_id": 8,
  "status": "PENDIENTE",
  "personal_data": {
    "full_name": "Pedro Cliente",
    "phone": "+59178547855",
    "email": "pedro.cliente@email.com",
    "birth_date": "1990-05-15",
    "national_id": "12345678",
    "marital_status": "soltero",
    "number_of_dependents": 0
  },
  "employment_data": {
    "current_job": {
      "company": "TechCorp Bolivia",
      "position": "Ingeniero de Software",
      "salary": 4500.00,
      "currency": "BOB",
      "start_date": "2020-03-01",
      "employment_type": "tiempo_completo",
      "supervisor_name": "Juan Pérez",
      "supervisor_phone": "+59178123456"
    },
    "previous_job": {
      "company": "Software Solutions",
      "position": "developer junior",
      "salary": 2000.00,
      "end_date": "2020-02-28"
    }
  },
  "rental_history": [
    {
      "property_address": "Calle Principal 123, La Paz",
      "landlord_name": "Roberto García",
      "landlord_phone": "+59178111111",
      "monthly_rent": 2500.00,
      "start_date": "2018-01-01",
      "end_date": "2020-02-29"
    }
  ],
  "references": {
    "personal": [
      {
        "name": "Carlos López",
        "relationship": "amigo",
        "phone": "+59178222222"
      }
    ],
    "professional": [
      {
        "name": "Juan Pérez",
        "company": "TechCorp Bolivia",
        "position": "Jefe",
        "phone": "+59178123456"
      }
    ]
  },
  "documents": [
    {
      "type": "cedula_identidad",
      "url": "https://s3.aws.com/docs/cedula-12345678.pdf"
    }
  ],
  "additional_notes": "Tengo mascotas pero pequeñas y bien cuidadas",
  "admin_feedback": null,
  "property_title": "Chalet Moderno en Zona Sud",
  "applicant_name": "Pedro Cliente",
  "applicant_email": "pedro.cliente@email.com",
  "created_at": "2026-02-12T15:30:00Z",
  "updated_at": "2026-02-12T15:30:00Z"
}
```

**Errores Posibles:**
- `404 NOT FOUND` - La solicitud no existe
- `403 FORBIDDEN` - El inquilino intenta ver solicitud de otro usuario

---

## 2. Panel de Administración - Solicitudes de Alquiler

### 2.1 Listar Todas las Solicitudes

Los administradores pueden ver todas las solicitudes del sistema con opciones de filtrado.

**Endpoint:** `GET /:slug/applications`
**Auth:** Requerida (ADMIN)
**Role:** Admin/Superadmin

**URL Params:**
- `slug` - Slug de la inmobiliaria

**Query Params (Todos Opcionales):**
```
?status=PENDIENTE
?status=APROBADA
?status=RECHAZADA
```

**Response (200):**
```json
[
  {
    "id": 5,
    "property_id": 1,
    "applicant_id": 8,
    "status": "PENDIENTE",
    "personal_data": {
      "full_name": "Pedro Cliente",
      "phone": "+59178547855",
      "email": "pedro.cliente@email.com",
      "birth_date": "1990-05-15",
      "national_id": "12345678"
    },
    "employment_data": {
      "current_job": {
        "company": "TechCorp Bolivia",
        "position": "Ingeniero de Software",
        "salary": 4500.00,
        "currency": "BOB"
      }
    },
    "property_title": "Chalet Moderno en Zona Sud",
    "applicant_name": "Pedro Cliente",
    "applicant_email": "pedro.cliente@email.com",
    "created_at": "2026-02-12T15:30:00Z",
    "updated_at": "2026-02-12T15:30:00Z"
  },
  {
    "id": 4,
    "property_id": 3,
    "applicant_id": 7,
    "status": "APROBADA",
    "personal_data": { ... },
    "property_title": "Apartamento Centro",
    "applicant_name": "María González",
    "created_at": "2026-02-10T10:00:00Z",
    "updated_at": "2026-02-11T16:45:00Z"
  }
]
```

**Notas:**
- Ordenadas por fecha de creación descendente
- Si no se especifica `status`, devuelve todas las solicitudes
- Filtro por estado es case-sensitive

---

### 2.2 Ver Detalle de Solicitud (Admin)

El administrador puede ver todos los detalles de una solicitud específica.

**Endpoint:** `GET /:slug/applications/:id`
**Auth:** Requerida (ADMIN)
**Role:** Admin/Superadmin

**URL Params:**
- `slug` - Slug de la inmobiliaria
- `id` - ID de la solicitud

**Response (200):**
```json
{
  "id": 5,
  "property_id": 1,
  "applicant_id": 8,
  "status": "PENDIENTE",
  "personal_data": {
    "full_name": "Pedro Cliente",
    "phone": "+59178547855",
    "email": "pedro.cliente@email.com",
    "birth_date": "1990-05-15",
    "national_id": "12345678",
    "marital_status": "soltero",
    "number_of_dependents": 0
  },
  "employment_data": {
    "current_job": {
      "company": "TechCorp Bolivia",
      "position": "Ingeniero de Software",
      "salary": 4500.00,
      "currency": "BOB",
      "start_date": "2020-03-01",
      "supervisor_name": "Juan Pérez",
      "supervisor_phone": "+59178123456"
    },
    "previous_job": {
      "company": "Software Solutions",
      "position": "developer junior"
    }
  },
  "rental_history": [
    {
      "property_address": "Calle Principal 123, La Paz",
      "landlord_name": "Roberto García",
      "landlord_phone": "+59178111111",
      "monthly_rent": 2500.00,
      "start_date": "2018-01-01",
      "end_date": "2020-02-29",
      "reason_for_leaving": "cambio_de_ciudad"
    }
  ],
  "references": {
    "personal": [
      {
        "name": "Carlos López",
        "relationship": "amigo",
        "phone": "+59178222222",
        "email": "carlos@email.com"
      }
    ],
    "professional": [
      {
        "name": "Juan Pérez",
        "company": "TechCorp Bolivia",
        "position": "Jefe",
        "phone": "+59178123456",
        "email": "juan.perez@techcorp.com"
      }
    ]
  },
  "documents": [
    {
      "type": "cedula_identidad",
      "url": "https://s3.aws.com/docs/cedula-12345678.pdf"
    },
    {
      "type": "comprobante_ingresos",
      "url": "https://s3.aws.com/docs/nomina-feb-2026.pdf"
    }
  ],
  "additional_notes": "Tengo mascotas pero pequeñas y bien cuidadas",
  "admin_feedback": null,
  "property_title": "Chalet Moderno en Zona Sud",
  "applicant_name": "Pedro Cliente",
  "applicant_email": "pedro.cliente@email.com",
  "created_at": "2026-02-12T15:30:00Z",
  "updated_at": "2026-02-12T15:30:00Z"
}
```

---

### 2.3 Aprobar Solicitud y Auto-Generar Contrato

El administrador aprueba una solicitud. El sistema:
1. Cambia el estado a `APROBADA`
2. Auto-genera un contrato de alquiler (borrador)
3. Notifica al inquilino

**Endpoint:** `PATCH /:slug/applications/:id/approve`
**Auth:** Requerida (ADMIN)
**Role:** Admin/Superadmin
**HTTP Code:** 200

**URL Params:**
- `slug` - Slug de la inmobiliaria
- `id` - ID de la solicitud

**Request Body (Opcional):**
```json
{
  "admin_feedback": "Aprobado. Excelente perfil. Proceder con firma de contrato."
}
```

**Response (200):**
```json
{
  "message": "Solicitud aprobada con éxito",
  "application": {
    "id": 5,
    "status": "APROBADA",
    "property": "Chalet Moderno en Zona Sud",
    "applicant": "Pedro Cliente"
  },
  "contract_generated": {
    "id": 10,
    "number": "CTR-2026-0010",
    "status": "BORRADOR",
    "message": "Se ha creado un borrador de contrato automáticamente. Favor revisar y activar."
  }
}
```

**Validaciones:**
- La solicitud debe existir
- La solicitud no puede estar ya aprobada
- La propiedad debe estar disponible

**Notas:**
- El contrato se genera automáticamente en estado `BORRADOR`
- El inquilino recibe notificación
- El admin puede modificar el contrato antes de pedirle al inquilino que lo firme
- Las fechas del contrato son automáticas (hoy + 1 año)

---

### 2.4 Rechazar o Cambiar Estado de Solicitud

El administrador puede rechazar una solicitud o cambiar su estado con un feedback.

**Endpoint:** `PATCH /:slug/applications/:id/status`
**Auth:** Requerida (ADMIN)
**Role:** Admin/Superadmin
**HTTP Code:** 200

**URL Params:**
- `slug` - Slug de la inmobiliaria
- `id` - ID de la solicitud

**Request Body:**
```json
{
  "status": "RECHAZADA",
  "admin_feedback": "No cumple con los requisitos mínimos de ingresos. Se requiere una relación ingreso/renta de al menos 3:1."
}
```

**Estados Válidos:**
- `PENDIENTE`
- `APROBADA`
- `RECHAZADA`

**Response (200):**
```json
{
  "id": 5,
  "property_id": 1,
  "applicant_id": 8,
  "status": "RECHAZADA",
  "personal_data": {...},
  "employment_data": {...},
  "admin_feedback": "No cumple con los requisitos mínimos de ingresos. Se requiere una relación ingreso/renta de al menos 3:1.",
  "updated_at": "2026-02-12T16:45:00Z"
}
```

**Validaciones:**
- La solicitud debe existir
- El estado debe ser válido
- Se notifica automáticamente al inquilino

**Notas:**
- El `admin_feedback` es visible para el inquilino
- Cambiar a cualquier estado (no solo rechazada) activa las notificaciones
- El inquilino recibe el feedback y puede ver el motivo del rechazo

---

## 3. Estados de Solicitud

```
┌─────────────────────────────────────────────────────┐
│ SOLICITUD NUEVA                                      │
└────────────┬────────────────────────────────────────┘
             │
             ▼
        ┌────────────┐
        │ PENDIENTE  │ ◄── Estado inicial, enviada por inquilino
        └────┬───────┘
             │
        ┌────┴────────────────────┐
        ▼                          ▼
   ┌─────────────┐         ┌────────────┐
   │  APROBADA   │         │ RECHAZADA  │
   │ Contrato    │         │ Feedback   │
   │ generado    │         │ del admin  │
   └─────────────┘         └────────────┘
```

**Estados Posibles:**

| Estado | Descripción | Quién Puede Cambiar | Acción Automática |
|--------|-------------|-------------------|-------------------|
| `PENDIENTE` | Solicitud enviada, esperando revisión | Admin | Notificación al inquilino |
| `APROBADA` | Solicitud aprobada para alquiler | Admin | Auto-genera contrato, notifica inquilino |
| `RECHAZADA` | Solicitud rechazada | Admin | Notifica inquilino con feedback |

---

## 4. Flujo Completo de Solicitud a Contrato

### Escenario: Un inquilino solicita una propiedad y es aprobado

```
PASO 1: Inquilino envía solicitud
┌────────────────────────────────────────────────────┐
│ POST /:slug/applications                           │
│ {                                                   │
│   "property_id": 1,                                │
│   "personal_data": {...},                          │
│   "employment_data": {...}                         │
│ }                                                   │
└────────────────┬─────────────────────────────────┘
                 │
                 ▼
NOTIFICACIÓN: Todos los admins reciben alerta
             "Nueva solicitud para Chalet Moderno"

────────────────────────────────────────────────────

PASO 2: Admin revisa solicitud
┌────────────────────────────────────────────────────┐
│ GET /:slug/applications/:id                        │
│ Admin ve todos los detalles del solicitante        │
└────────────────────────────────────────────────────┘

────────────────────────────────────────────────────

PASO 3: Admin aprueba solicitud
┌────────────────────────────────────────────────────┐
│ PATCH /:slug/applications/:id/approve              │
│ {                                                   │
│   "admin_feedback": "Aprobado. Excelente perfil"  │
│ }                                                   │
└────────────────┬─────────────────────────────────┘
                 │
                 ▼
AUTO-GENERACIÓN: Sistema crea contrato CTR-2026-XXXX
                 en estado BORRADOR
                 
NOTIFICACIÓN: Inquilino recibe
             "¡Tu solicitud fue aprobada!"
             "Contrato generado. Revisa los términos"

────────────────────────────────────────────────────

PASO 4: Admin prepara contrato
┌────────────────────────────────────────────────────┐
│ PATCH /:slug/admin/contracts/:id                   │
│ Admin puede editar términos, montos, etc.          │
└────────────────────────────────────────────────────┘

────────────────────────────────────────────────────

PASO 5: Admin pide firma al inquilino
┌────────────────────────────────────────────────────┐
│ GET /:slug/contracts/:id                           │
│ Inquilino puede ver contrato desde su portal       │
│                                                     │
│ PATCH /:slug/contracts/:id/sign                    │
│ Inquilino firma digitalmente                       │
└────────────────────────────────────────────────────┘

────────────────────────────────────────────────────

PASO 6: Contrato activo
┌────────────────────────────────────────────────────┐
│ Estado del Contrato: ACTIVO                        │
│ Ambas partes han firmado                           │
│ Ahora aplican términos de pago, mantenimiento, etc │
└────────────────────────────────────────────────────┘
```

---

## 5. Validaciones y Errores

### Errores Comunes en Solicitudes

**400 BAD REQUEST - Propiedad no disponible**
```json
{
  "statusCode": 400,
  "message": "La propiedad no está disponible para alquiler",
  "error": "Bad Request"
}
```

**400 BAD REQUEST - Datos faltantes**
```json
{
  "statusCode": 400,
  "message": "El campo 'personal_data.full_name' es requerido",
  "error": "Bad Request"
}
```

**404 NOT FOUND - Solicitud no existe**
```json
{
  "statusCode": 404,
  "message": "Solicitud no encontrada",
  "error": "Not Found"
}
```

**404 NOT FOUND - Propiedad no existe**
```json
{
  "statusCode": 404,
  "message": "La propiedad no existe",
  "error": "Not Found"
}
```

**403 FORBIDDEN - No tienes permiso**
```json
{
  "statusCode": 403,
  "message": "No tienes permiso para ver esta solicitud",
  "error": "Forbidden"
}
```

**401 UNAUTHORIZED - Token inválido**
```json
{
  "statusCode": 401,
  "message": "Token inválido o expirado",
  "error": "Unauthorized"
}
```

---

## Resumen de Endpoints

### Para Inquilinos
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| `POST` | `/:slug/applications` | Enviar nueva solicitud |
| `GET` | `/:slug/applications/my-applications` | Ver mis solicitudes |
| `GET` | `/:slug/applications/:id` | Ver detalle de solicitud |

### Para Administradores
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| `GET` | `/:slug/applications` | Listar todas las solicitudes |
| `GET` | `/:slug/applications/:id` | Ver detalle de solicitud |
| `PATCH` | `/:slug/applications/:id/approve` | Aprobar y generar contrato |
| `PATCH` | `/:slug/applications/:id/status` | Cambiar estado o rechazar |

---

## Notas Importantes

- ✅ **Notificaciones Automáticas:** El sistema notifica automáticamente a admins e inquilinos en cada cambio de estado
- ✅ **Auto-generación de Contratos:** Al aprobar una solicitud se crea automáticamente un borrador de contrato
- ✅ **Multi-tenant:** Cada inmobiliaria tiene sus propias solicitudes aisladas
- ✅ **Validación de Datos:** Se valida formato de email, teléfono, fechas y relación salario/renta
- ✅ **Feedback:** Los administradores pueden dejar feedback visible para el inquilino
- ⚠️ **Una solicitud por propiedad:** Un inquilino no puede tener 2+ solicitudes PENDIENTES para la misma propiedad
- ⚠️ **Auditoria:** Todos los cambios quedan registrados con timestamp

