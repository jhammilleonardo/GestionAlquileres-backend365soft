# API Documentation - Sistema de Solicitudes de Alquiler

Esta documentación cubre el sistema completo de solicitudes de alquiler. Los inquilinos envían solicitudes para propiedades; los administradores las revisan con un proceso formal de screening (verificación de documentos, llamadas al empleador, consulta de lista negra) y las aprueban, rechazan o piden co-firmante. Al aprobar se auto-genera un contrato.

**Base URL:** `http://localhost:3000`

**Autenticación:** Todas las endpoints requieren token JWT (`Authorization: Bearer <token>`)

---

## Índice

1. [Portal de Inquilinos - Solicitudes de Alquiler](#1-portal-de-inquilinos---solicitudes-de-alquiler)
2. [Panel de Administración - Solicitudes de Alquiler](#2-panel-de-administración---solicitudes-de-alquiler)
3. [Screening (Verificación de Inquilinos)](#3-screening-verificación-de-inquilinos)
4. [Estados de Solicitud](#4-estados-de-solicitud)
5. [Flujo Completo de Solicitud a Contrato](#5-flujo-completo-de-solicitud-a-contrato)
6. [Validaciones y Errores](#6-validaciones-y-errores)

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

El administrador aprueba una solicitud y crea automáticamente un contrato. El sistema:
1. Cambia el estado de la solicitud a `APROBADA`
2. Crea un contrato de alquiler con los datos proporcionados
3. Vincula el contrato con la solicitud
4. Notifica al inquilino

**Endpoint:** `PATCH /:slug/applications/:id/approve`
**Auth:** Requerida (ADMIN)
**Role:** Admin/Superadmin
**HTTP Code:** 200

**URL Params:**
- `slug` - Slug de la inmobiliaria
- `id` - ID de la solicitud

**Request Body (Mínimo Requerido):**
```json
{
  "monthly_rent": 1200.00
}
```

**Request Body (Completo con campos opcionales):**
```json
{
  "admin_feedback": "Aprobado. Excelente perfil.",
  "monthly_rent": 1200.00,
  "deposit_amount": 1200.00,
  "currency": "BOB",
  "payment_day": 5,
  "payment_method": "Transferencia bancaria",
  "late_fee_percentage": 5,
  "grace_days": 3,
  "included_services": ["Internet", "Cable TV"],
  "start_date": "2026-02-01",
  "end_date": "2027-02-01",
  "key_delivery_date": "2026-02-01",
  "tenant_responsibilities": "Mantener la propiedad en buen estado",
  "owner_responsibilities": "Realizar reparaciones necesarias",
  "prohibitions": "No se permiten mascotas",
  "coexistence_rules": "Respetar horarios de descanso",
  "renewal_terms": "Renovación automática si no se avisa con 30 días",
  "termination_terms": "60 días de preaviso",
  "jurisdiction": "Bolivia",
  "auto_renew": true,
  "renewal_notice_days": 30,
  "auto_increase_percentage": 10,
  "bank_account_number": "123-456-789",
  "bank_account_type": "Ahorros",
  "bank_name": "Banco Nacional",
  "bank_account_holder": "Propietario"
}
```

**Descripción de campos:**

| Campo | Tipo | Requerido | Descripción | Default |
|-------|------|-----------|-------------|---------|
| `monthly_rent` | number | **Sí** | Alquiler mensual | - |
| `admin_feedback` | string | No | Feedback para el inquilino | "Solicitud aprobada..." |
| `deposit_amount` | number | No | Depósito (si no se envía, = 1 mes de renta) | = monthly_rent |
| `currency` | string | No | Moneda | "BOB" |
| `payment_day` | number | No | Día de pago (1-31) | 5 |
| `payment_method` | string | No | Método de pago | null |
| `late_fee_percentage` | number | No | % de recargo por pago tardío | 0 |
| `grace_days` | number | No | Días de gracia | 0 |
| `included_services` | array | No | Servicios incluidos | null |
| `start_date` | date | No | Fecha inicio (YYYY-MM-DD) | Hoy |
| `end_date` | date | No | Fecha fin (YYYY-MM-DD) | Hoy + 1 año |
| `key_delivery_date` | date | No | Fecha entrega llaves | null |
| `auto_renew` | boolean | No | Renovación automática | false |
| `renewal_notice_days` | number | No | Días aviso para no renovar | 30 |
| `auto_increase_percentage` | number | No | % aumento anual automático | 0 |

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
    "monthly_rent": 1200.00,
    "currency": "BOB",
    "deposit_amount": 1200.00,
    "message": "Se ha creado un borrador de contrato automáticamente. El inquilino podrá firmarlo desde su portal."
  }
}
```

**Validaciones:**
- La solicitud debe existir
- La solicitud no puede estar ya aprobada
- `monthly_rent` es obligatorio y debe ser mayor a 0
- Si no se envía `deposit_amount`, se calcula como 1 mes de renta

**Notas:**
- El contrato se genera en estado `BORRADOR`
- El contrato queda vinculado a la solicitud mediante `application_id`
- El inquilino puede firmar el contrato desde su portal
- El admin puede editar el contrato antes de que el inquilino lo firme

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

## 3. Screening (Verificación de Inquilinos)

El screening es el proceso de verificación formal que realiza el admin antes de aprobar una solicitud. Incluye validación de documentos, llamadas al empleador, contacto con arrendador anterior y consulta de lista negra.

> **Para EE.UU.:** el admin debe registrar primero el pago del fee de screening ($50) antes de proceder con la verificación.

---

### 3.1 Subir Documentos a una Solicitud

Permite al admin subir los archivos físicos del solicitante (carnet, boletas de pago, comprobante de domicilio). Los archivos se almacenan localmente en `storage/applications/{slug}/{id}/` y sus referencias se agregan al array `documents` de la solicitud.

**Endpoint:** `POST /:slug/applications/:id/documents`
**Auth:** Requerida — `ADMIN` / `SUPERADMIN`
**HTTP Code:** 200
**Content-Type:** `multipart/form-data`

**URL Params:**
- `slug` — Slug de la inmobiliaria
- `id` — ID de la solicitud

**Form Fields:**
| Campo | Tipo | Descripción |
|---|---|---|
| `files` | `File[]` | Hasta 10 archivos (JPEG, PNG, WebP, PDF — máx 10 MB c/u) |
| `types` | `string[]` | Array paralelo a `files` con el tipo de cada documento |

**Tipos de documento recomendados:**
- `carnet_anverso`
- `carnet_reverso`
- `boleta_sueldo`
- `comprobante_domicilio`
- `otros`

**Ejemplo con curl:**
```bash
curl -X POST http://localhost:3000/empresa1/applications/5/documents \
  -H "Authorization: Bearer <token>" \
  -F "files=@/path/carnet_anverso.jpg" \
  -F "types=carnet_anverso" \
  -F "files=@/path/boleta_enero.pdf" \
  -F "types=boleta_sueldo"
```

**Response (200):**
```json
{
  "message": "Documentos subidos correctamente",
  "documents": [
    {
      "type": "carnet_anverso",
      "url": "/storage/applications/empresa1/5/a1b2c3d4e5f6.jpg",
      "name": "carnet_anverso.jpg"
    },
    {
      "type": "boleta_sueldo",
      "url": "/storage/applications/empresa1/5/9f8e7d6c5b4a.pdf",
      "name": "boleta_enero.pdf"
    }
  ]
}
```

**Errores:**
- `400` — No se envió ningún archivo
- `404` — Solicitud no encontrada

---

### 3.2 Registrar Pago del Fee de Screening (EE.UU.)

Marca que el admin cobró los $50 de fee de screening antes de iniciar el proceso. Campo informativo — no procesa cobros automáticos.

**Endpoint:** `PATCH /:slug/applications/:id/screening-fee`
**Auth:** Requerida — `ADMIN` / `SUPERADMIN`
**HTTP Code:** 200

**URL Params:**
- `slug` — Slug de la inmobiliaria
- `id` — ID de la solicitud

**Request Body:** *(vacío)*

**Response (200):**
```json
{
  "message": "Pago de screening registrado"
}
```

---

### 3.3 Completar Checklist de Screening

Endpoint principal del proceso de screening. Puede llamarse múltiples veces (upsert) para ir completando el checklist a medida que el admin avanza en las verificaciones.

Cuando se envía `final_status`, el sistema ejecuta la acción correspondiente de forma automática:

| `final_status` | Acción automática |
|---|---|
| `APPROVED` | Actualiza solicitud → `APROBADA` + genera contrato en `BORRADOR` |
| `REJECTED` | Actualiza solicitud → `RECHAZADA` + notifica al inquilino |
| `REQUIRES_COSIGNER` | Actualiza solicitud → `EN_REVISION` + notifica al inquilino |
| *(omitido)* | Solo guarda el checklist, sin efectos en la solicitud |

**Endpoint:** `PATCH /:slug/applications/:id/screening`
**Auth:** Requerida — `ADMIN` / `SUPERADMIN`
**HTTP Code:** 200

**URL Params:**
- `slug` — Slug de la inmobiliaria
- `id` — ID de la solicitud

**Request Body:**

| Campo | Tipo | Descripción |
|---|---|---|
| `documents_verified` | `boolean` | Los documentos del solicitante fueron verificados |
| `employer_call_name` | `string` | Nombre del contacto en la empresa del solicitante |
| `employer_call_phone` | `string` | Teléfono de la empresa |
| `employer_call_result` | `string` | Resultado de la llamada (`confirmado`, `no contestó`, etc.) |
| `previous_landlord_name` | `string` | Nombre del arrendador anterior |
| `previous_landlord_phone` | `string` | Teléfono del arrendador anterior |
| `previous_landlord_result` | `string` | Resultado del contacto (`buenas referencias`, etc.) |
| `blacklist_checked` | `boolean` | Se consultó la lista negra |
| `blacklist_result` | `string` | Resultado de la consulta (`limpio`, `encontrado`, etc.) |
| `notes` | `string` | Notas adicionales del proceso |
| `final_status` | `string` | `APPROVED` \| `REJECTED` \| `REQUIRES_COSIGNER` |
| `monthly_rent` | `number` | **Requerido si `final_status = APPROVED`** — renta mensual del contrato |
| `currency` | `string` | Moneda del contrato (default: `BOB`) |
| `payment_day` | `number` | Día de pago mensual, 1–31 (default: `5`) |
| `deposit_amount` | `number` | Depósito (default: igual a `monthly_rent`) |
| `admin_feedback` | `string` | Mensaje visible para el inquilino |

**Ejemplo — guardar progreso parcial:**
```json
{
  "documents_verified": true,
  "employer_call_name": "ACME Bolivia S.A.",
  "employer_call_phone": "60012345",
  "employer_call_result": "confirmado — Pedro trabaja allí desde 2021"
}
```

**Response (200):**
```json
{
  "message": "Checklist de screening actualizado",
  "screening": {
    "id": 1,
    "application_id": 5,
    "documents_verified": true,
    "employer_call_name": "ACME Bolivia S.A.",
    "employer_call_phone": "60012345",
    "employer_call_result": "confirmado — Pedro trabaja allí desde 2021",
    "previous_landlord_name": null,
    "previous_landlord_phone": null,
    "previous_landlord_result": null,
    "blacklist_checked": false,
    "blacklist_result": null,
    "notes": null,
    "final_status": null,
    "reviewed_by": null,
    "reviewed_at": null,
    "created_at": "2026-04-18T10:00:00Z",
    "updated_at": "2026-04-18T10:15:00Z"
  }
}
```

**Ejemplo — aprobar con generación de contrato:**
```json
{
  "blacklist_checked": true,
  "blacklist_result": "limpio",
  "notes": "Excelente perfil. Ingresos verificados 3:1 respecto a la renta.",
  "final_status": "APPROVED",
  "monthly_rent": 3500,
  "currency": "BOB",
  "payment_day": 5,
  "deposit_amount": 3500,
  "admin_feedback": "Solicitud aprobada. El contrato está disponible para firma."
}
```

**Response (200) — APPROVED:**
```json
{
  "message": "Solicitud aprobada: contrato generado automáticamente",
  "screening": {
    "id": 1,
    "application_id": 5,
    "documents_verified": true,
    "blacklist_checked": true,
    "blacklist_result": "limpio",
    "final_status": "APPROVED",
    "reviewed_by": 99,
    "reviewed_at": "2026-04-18T11:30:00Z",
    "updated_at": "2026-04-18T11:30:00Z"
  },
  "contract": {
    "id": 42,
    "number": "CTR-2026-0042",
    "status": "BORRADOR",
    "monthly_rent": 3500,
    "currency": "BOB",
    "deposit_amount": 3500,
    "message": "Se ha creado un borrador de contrato automáticamente. El inquilino podrá firmarlo desde su portal."
  }
}
```

**Ejemplo — rechazar:**
```json
{
  "notes": "Ingresos insuficientes. Relación 1.5:1, mínimo requerido 3:1.",
  "final_status": "REJECTED",
  "admin_feedback": "Tu solicitud no cumple los requisitos mínimos de ingresos."
}
```

**Response (200) — REJECTED:**
```json
{
  "message": "Solicitud rechazada. Inquilino notificado.",
  "screening": {
    "id": 1,
    "application_id": 5,
    "final_status": "REJECTED",
    "reviewed_by": 99,
    "reviewed_at": "2026-04-18T11:30:00Z"
  }
}
```

**Ejemplo — requiere co-firmante:**
```json
{
  "notes": "Ingresos borderline. Se puede aprobar con co-firmante solvente.",
  "final_status": "REQUIRES_COSIGNER",
  "admin_feedback": "Tu perfil requiere un co-firmante. Comunícate con la administración."
}
```

**Response (200) — REQUIRES_COSIGNER:**
```json
{
  "message": "Solicitud marcada como requiere co-firmante. Inquilino notificado.",
  "screening": {
    "id": 1,
    "application_id": 5,
    "final_status": "REQUIRES_COSIGNER",
    "reviewed_by": 99,
    "reviewed_at": "2026-04-18T11:30:00Z"
  }
}
```

**Errores:**
- `400` — `final_status = APPROVED` enviado sin `monthly_rent`
- `404` — Solicitud no encontrada

---

## 4. Estados de Solicitud

```
┌──────────────────────────────────────────────────────────────────┐
│ SOLICITUD NUEVA                                                   │
└────────────┬─────────────────────────────────────────────────────┘
             │
             ▼
        ┌────────────┐
        │ PENDIENTE  │ ◄── Estado inicial, enviada por inquilino
        └────┬───────┘
             │ Admin inicia screening
             ▼
        ┌─────────────┐
        │ EN_REVISION │ ◄── Admin completando checklist de screening
        └──────┬──────┘    (también cuando se requiere co-firmante)
               │
      ┌────────┴──────────────────────┐
      ▼                                ▼
 ┌──────────┐                   ┌────────────────────┐
 │ APROBADA │                   │     RECHAZADA      │
 │ Contrato │                   │ Inquilino notificado│
 │ generado │                   └────────────────────┘
 └──────────┘
```

**Estados posibles:**

| Estado | Descripción | Quién cambia | Acción automática |
|---|---|---|---|
| `PENDIENTE` | Enviada por el inquilino, sin revisar | — | Notifica admins |
| `EN_REVISION` | Admin analizando / pendiente de co-firmante | Admin / screening | Notifica inquilino si es REQUIRES_COSIGNER |
| `APROBADA` | Aprobada tras screening satisfactorio | Admin / screening APPROVED | Genera contrato, notifica inquilino |
| `RECHAZADA` | Rechazada tras screening | Admin / screening REJECTED | Notifica inquilino con feedback |
| `CANCELADA` | Cancelada por el inquilino | Inquilino | — |
| `BORRADOR` | Guardada sin enviar | Inquilino | — |

**Estados de `screening_checklist.final_status`:**

| Valor | Efecto en la solicitud |
|---|---|
| `APPROVED` | → `APROBADA` + contrato generado |
| `REJECTED` | → `RECHAZADA` + notificación al inquilino |
| `REQUIRES_COSIGNER` | → `EN_REVISION` + notificación al inquilino |

---

## 5. Flujo Completo de Solicitud a Contrato (con Screening)

### Escenario: Un inquilino solicita una propiedad y es aprobado tras verificación

```
PASO 1: Inquilino envía solicitud
┌────────────────────────────────────────────────────┐
│ POST /:slug/applications                           │
│ { "property_id": 1, "personal_data": {...}, ... }  │
└────────────────┬─────────────────────────────────┘
                 ▼
NOTIFICACIÓN: Admins reciben "Nueva solicitud — Chalet Moderno"

────────────────────────────────────────────────────

PASO 2: Admin revisa la solicitud
┌────────────────────────────────────────────────────┐
│ GET /:slug/applications/:id                        │
│ Ve datos personales, laborales, referencias        │
└────────────────────────────────────────────────────┘

────────────────────────────────────────────────────

PASO 3 (EE.UU. solamente): Admin registra el pago del fee
┌────────────────────────────────────────────────────┐
│ PATCH /:slug/applications/:id/screening-fee        │
│ Confirma que cobró los $50 de screening            │
└────────────────────────────────────────────────────┘

────────────────────────────────────────────────────

PASO 4: Admin sube documentos físicos
┌────────────────────────────────────────────────────┐
│ POST /:slug/applications/:id/documents             │
│ Carnet anverso, reverso, boletas, comprobante domicilio│
└────────────────────────────────────────────────────┘

────────────────────────────────────────────────────

PASO 5: Admin completa el checklist de screening (puede ser incremental)
┌────────────────────────────────────────────────────┐
│ PATCH /:slug/applications/:id/screening            │
│ { "documents_verified": true,                      │
│   "employer_call_result": "confirmado",            │
│   "blacklist_checked": true,                       │
│   "blacklist_result": "limpio" }                   │
└────────────────────────────────────────────────────┘

────────────────────────────────────────────────────

PASO 6: Admin emite resultado final del screening
┌────────────────────────────────────────────────────┐
│ PATCH /:slug/applications/:id/screening            │
│ { "final_status": "APPROVED",                      │
│   "monthly_rent": 3500,                            │
│   "currency": "BOB" }                              │
└────────────────┬─────────────────────────────────┘
                 ▼
AUTO-GENERACIÓN: Sistema crea contrato CTR-2026-XXXX
                 en estado BORRADOR, vinculado a la solicitud

NOTIFICACIÓN: Inquilino recibe "Solicitud aprobada"

────────────────────────────────────────────────────

PASO 7: Admin ajusta contrato (opcional)
┌────────────────────────────────────────────────────┐
│ PATCH /:slug/admin/contracts/:id                   │
│ Puede editar términos, cláusulas, fechas           │
└────────────────────────────────────────────────────┘

────────────────────────────────────────────────────

PASO 8: Inquilino firma desde su portal
┌────────────────────────────────────────────────────┐
│ PATCH /:slug/contracts/:id/sign                    │
│ Estado del contrato → ACTIVO                       │
│ Estado de la propiedad → OCUPADO                   │
└────────────────────────────────────────────────────┘
```

---

## 6. Validaciones y Errores

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
|---|---|---|
| `POST` | `/:slug/applications` | Enviar nueva solicitud |
| `GET` | `/:slug/applications/my-applications` | Ver mis solicitudes |
| `GET` | `/:slug/applications/:id` | Ver detalle de solicitud |

### Para Administradores — Solicitudes
| Método | Endpoint | Descripción |
|---|---|---|
| `GET` | `/:slug/applications` | Listar todas las solicitudes |
| `GET` | `/:slug/applications/:id` | Ver detalle de solicitud |
| `PATCH` | `/:slug/applications/:id/approve` | Aprobar directamente y generar contrato |
| `PATCH` | `/:slug/applications/:id/status` | Cambiar estado manualmente |

### Para Administradores — Screening
| Método | Endpoint | Descripción |
|---|---|---|
| `POST` | `/:slug/applications/:id/documents` | Subir archivos físicos del solicitante |
| `PATCH` | `/:slug/applications/:id/screening-fee` | Registrar pago del fee (EE.UU.) |
| `PATCH` | `/:slug/applications/:id/screening` | Completar checklist; emite resultado final |

### Relacionados
| Método | Endpoint | Descripción |
|---|---|---|
| `GET` | `/:slug/users/tenants` | Listar todos los inquilinos |
| `GET` | `/:slug/users/tenants/:id` | Ver detalle de un inquilino |

---

## Notas Importantes

- **Notificaciones automáticas:** El sistema notifica a admins e inquilinos en cada cambio de estado
- **Auto-generación de contratos:** Tanto `/approve` como `/screening` (con `final_status: APPROVED`) generan el contrato en `BORRADOR`
- **Screening es upsert:** Llamar `PATCH /screening` múltiples veces actualiza el mismo checklist, no crea duplicados
- **Documentos acumulativos:** Cada llamada a `/documents` agrega archivos sin eliminar los existentes
- **Almacenamiento de archivos:** Local en desarrollo (`storage/applications/{slug}/{id}/`), migrar a S3 en producción (ADR-004)
- **Multi-tenant:** Cada inmobiliaria tiene sus propias solicitudes y checklist aislados
- **Fee de screening:** Campo informativo — no procesa cobros automáticos; el admin lo registra manualmente
- **Una sola fila de checklist por solicitud:** `screening_checklist.application_id` tiene restricción `UNIQUE`

