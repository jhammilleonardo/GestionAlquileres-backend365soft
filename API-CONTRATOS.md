# API Documentation - Sistema de Contratos

Esta documentación cubre el sistema completo de gestión de contratos de alquiler, tanto para el panel de administración como para el portal de inquilinos.

**Base URL:** `http://localhost:3000`

**Autenticación:** Todas las endpoints requieren token JWT (`Authorization: Bearer <token>`)

---

## ⚠️ Flujo Recomendado

El sistema implementa **dos formas** de crear contratos:

### 1. Flujo con Solicitudes (RECOMENDADO) ✅
```
Inquilino → Envía Solicitud → Admin Aprueba (con datos del contrato) → Contrato Creado
```

Este es el flujo principal del sistema. Ver [API-SOLICITUDES.md](./API-SOLICITUDES.md) para más detalles.

**Endpoint:** `PATCH /:slug/applications/:id/approve`

**Ventajas:**
- El inquilino completa todos sus datos personales y laborales en la solicitud
- El admin aprueba y define el monto del alquiler al mismo tiempo
- El contrato queda vinculado a la solicitud
- Mejor trazabilidad y auditoría

### 2. Creación Manual (CASOS ESPECIALES)
```
Admin → Selecciona Inquilino Aprobado → Crea Contrato Manualmente
```

Este flujo es para casos especiales donde el admin necesita crear un contrato directamente.

**Endpoint:** `POST /:slug/admin/contracts`

**Requisitos:**
- El inquilino debe tener rol `INQUILINO`
- El inquilino debe tener una solicitud `APROBADA` previa
- El inquilino no puede tener un contrato activo

---

## Índice

1. [Panel de Administración - Contratos](#1-panel-de-administración---contratos)
2. [Portal de Inquilinos - Mis Contratos](#2-portal-de-inquilinos---mis-contratos)
3. [Estados del Contrato](#3-estados-del-contrato)
4. [Flujo Completo de Creación y Firma](#4-flujo-completo-de-creación-y-firma)

---

## 1. Panel de Administración - Contratos

### 1.1 Dashboard de Contratos (Métricas)

**Endpoint:** `GET /:slug/admin/contracts/dashboard`
**Auth:** Requerida (ADMIN)

**Response (200):**
```json
{
  "total_contracts": 25,
  "active_contracts": 18,
  "draft_contracts": 3,
  "completed_contracts": 4,
  "monthly_revenue": 21600.00,
  "avg_rent": 1200.00,
  "contracts_expiring_soon": 2,
  "contracts_by_status": {
    "BORRADOR": 3,
    "ACTIVO": 18,
    "FINALIZADO": 4
  },
  "expiring_next_30_days": [
    {
      "id": 5,
      "contract_number": "CTR-2026-0005",
      "end_date": "2026-03-07",
      "tenant": {
        "name": "María González"
      },
      "property": {
        "title": "Apartamento en Palermo"
      }
    }
  ]
}
```

**Uso recomendado:**
- Dashboard principal con tarjetas de métricas
- Alertas de contratos por vencer
- Gráficos de ingresos mensuales
- Lista de contratos que requieren atención

---

### 1.2 Listar Todos los Contratos

**Endpoint:** `GET /:slug/admin/contracts`
**Auth:** Requerida (ADMIN)

**Query Params (Todos opcionales):**
```
?status=ACTIVO
&tenant_id=5
&property_id=1
```

**Descripción de filtros:**
- `status` - Filtrar por estado (`BORRADOR`, `ACTIVO`, `FINALIZADO`)
- `tenant_id` - Filtrar por inquilino
- `property_id` - Filtrar por propiedad

**Response (200):**
```json
[
  {
    "id": 1,
    "contract_number": "CTR-2026-0001",
    "status": "ACTIVO",
    "start_date": "2026-02-01",
    "end_date": "2027-02-01",
    "monthly_rent": 1200.00,
    "currency": "USD",
    "payment_day": 5,
    "deposit_amount": 2400.00,
    "tenant_signature_date": "2026-02-01T10:30:00Z",
    "admin_signature_date": "2026-02-01T09:00:00Z",
    "created_at": "2026-02-01T08:00:00Z",
    "tenant": {
      "id": 5,
      "name": "María González",
      "email": "maria.gonzalez@email.com",
      "phone": "+5491198765432"
    },
    "property": {
      "id": 1,
      "title": "Apartamento Moderno en Centro",
      "addresses": [
        {
          "street_address": "Av. Libertador 1234, Piso 5, Depto A",
          "city": "Buenos Aires",
          "country": "Argentina"
        }
      ]
    }
  },
  {
    "id": 2,
    "contract_number": "CTR-2026-0002",
    "status": "BORRADOR",
    "start_date": "2026-03-01",
    "end_date": "2027-03-01",
    "monthly_rent": 1500.00,
    "currency": "USD",
    "tenant": {
      "id": 6,
      "name": "Carlos López"
    },
    "property": {
      "id": 2,
      "title": "Studio en Palermo"
    }
  }
]
```

---

### 1.3 Crear Nuevo Contrato (Manual)

**⚠️ IMPORTANTE:** Este endpoint es solo para creación manual de contratos. El flujo recomendado es usar el sistema de solicitudes (ver API-SOLICITUDES.md).

**Endpoint:** `POST /:slug/admin/contracts`
**Auth:** Requerida (ADMIN)

**Request Body (MÍNIMO REQUERIDO):**
```json
{
  "tenant_id": 5,
  "property_id": 1,
  "start_date": "2026-02-01",
  "end_date": "2027-02-01",
  "monthly_rent": 1200.00
}
```

**Request Body (COMPLETO):**
```json
{
  "tenant_id": 5,
  "property_id": 1,
  "application_id": 10,
  "start_date": "2026-02-01",
  "end_date": "2027-02-01",
  "key_delivery_date": "2026-02-01",
  "monthly_rent": 1200.00,
  "currency": "BOB",
  "payment_day": 5,
  "deposit_amount": 1200.00,
  "payment_method": "Transferencia bancaria",
  "late_fee_percentage": 5,
  "grace_days": 3,
  "included_services": [
    "Internet",
    "Cable TV",
    "Expensas"
  ],
  "tenant_responsibilities": "Mantener la propiedad en buen estado, pagar servicios a su cargo",
  "owner_responsibilities": "Realizar reparaciones necesarias, mantener la propiedad habitable",
  "prohibitions": "No se permiten mascotas, no fumadores",
  "coexistence_rules": "Respetar horarios de descanso, no hacer ruido después de las 22hs",
  "renewal_terms": "El contrato se renueva automáticamente si ninguna de las partes avisa con 30 días de antelación",
  "termination_terms": "Cualquiera de las partes puede rescindir con 60 días de preaviso",
  "jurisdiction": "Bolivia",
  "auto_renew": true,
  "renewal_notice_days": 30,
  "auto_increase_percentage": 10,
  "bank_account_number": "123-456-789",
  "bank_account_type": "Ahorros",
  "bank_name": "Banco Nacional",
  "bank_account_holder": "Carlos González"
}
```

**Descripción de campos:**

| Campo | Tipo | Requerido | Descripción | Default |
|-------|------|-----------|-------------|---------|
| `tenant_id` | number | Sí | ID del inquilino (debe tener rol INQUILINO) | - |
| `property_id` | number | Sí | ID de la propiedad | - |
| `application_id` | number | No | ID de la solicitud que originó el contrato | null |
| `start_date` | date | Sí | Fecha de inicio del contrato | - |
| `end_date` | date | Sí | Fecha de finalización del contrato | - |
| `key_delivery_date` | date | No | Fecha de entrega de llaves | null |
| `monthly_rent` | number | Sí | Alquiler mensual | - |
| `currency` | string | No | Moneda | "BOB" |
| `payment_day` | number | No | Día de pago (1-31) | 5 |
| `deposit_amount` | number | No | Monto del depósito | 0 |
| `payment_method` | string | No | Método de pago | null |
| `late_fee_percentage` | number | No | % de recargo por pago tardío | 0 |
| `grace_days` | number | No | Días de gracia antes de recargo | 0 |
| `included_services` | array | No | Servicios incluidos | null |
| `auto_renew` | boolean | No | Renovación automática | false |
| `renewal_notice_days` | number | No | Días de aviso para no renovar | 30 |
| `auto_increase_percentage` | number | No | % de aumento anual automático | 0 |

**Response (201):**
```json
{
  "id": 1,
  "contract_number": "CTR-2026-0001",
  "status": "BORRADOR",
  "start_date": "2026-02-01",
  "end_date": "2027-02-01",
  "monthly_rent": 1200.00,
  "currency": "BOB",
  "payment_day": 5,
  "deposit_amount": 1200.00,
  "created_at": "2026-02-05T10:00:00.000Z",
  "tenant": {
    "id": 5,
    "name": "María González",
    "email": "maria.gonzalez@email.com"
  },
  "property": {
    "id": 1,
    "title": "Apartamento Moderno en Centro"
  }
}
```

**⚠️ Validaciones:**
- El inquilino debe tener rol `INQUILINO`
- Si NO se envía `application_id`: el inquilino debe tener al menos una solicitud aprobada
- Si se envía `application_id`: la solicitud debe existir y pertenecer al inquilino
- El inquilino no puede tener ya un contrato activo
- La propiedad debe estar disponible

**Importante:**
- El contrato se crea con estado `BORRADOR`
- Se genera automáticamente un `contract_number` único
- La propiedad pasa a estado `RESERVADO`
- El inquilino recibe notificación para firmar
- **Flujo recomendado:** Usar el sistema de solicitudes (`PATCH /:slug/applications/:id/approve`)

---

### 1.4 Obtener Detalle de Contrato

**Endpoint:** `GET /:slug/admin/contracts/:id`
**Auth:** Requerida (ADMIN)

**URL Params:**
- `id` - ID del contrato

**Response (200):**
```json
{
  "id": 1,
  "contract_number": "CTR-2026-0001",
  "status": "ACTIVO",
  "start_date": "2026-02-01",
  "end_date": "2027-02-01",
  "key_delivery_date": "2026-02-01",
  "monthly_rent": 1200.00,
  "currency": "USD",
  "payment_day": 5,
  "deposit_amount": 2400.00,
  "payment_method": "Transferencia bancaria",
  "late_fee_percentage": 5.00,
  "grace_days": 3,
  "included_services": [
    "Internet",
    "Cable TV",
    "Expensas"
  ],
  "tenant_responsibilities": "Mantener la propiedad en buen estado...",
  "owner_responsibilities": "Realizar reparaciones necesarias...",
  "prohibitions": "No se permiten mascotas, no fumadores",
  "coexistence_rules": "Respetar horarios de descanso...",
  "renewal_terms": "El contrato se renueva automáticamente...",
  "termination_terms": "Cualquiera de las partes puede rescindir...",
  "jurisdiction": "Buenos Aires, Argentina",
  "auto_renew": true,
  "renewal_notice_days": 30,
  "auto_increase_percentage": 10.00,
  "bank_name": "Banco Galicia",
  "bank_account_number": "123-456-789",
  "bank_account_type": "Ahorros",
  "bank_account_holder": "Carlos González",
  "tenant_signature_date": "2026-02-01T10:30:00Z",
  "tenant_signature_ip": "192.168.1.100",
  "admin_signature_date": "2026-02-01T09:00:00Z",
  "admin_signature_ip": "192.168.1.1",
  "created_at": "2026-02-01T08:00:00Z",
  "updated_at": "2026-02-01T10:30:00Z",
  "tenant": {
    "id": 5,
    "name": "María González",
    "email": "maria.gonzalez@email.com",
    "phone": "+5491198765432",
    "tenant_id": 5
  },
  "property": {
    "id": 1,
    "title": "Apartamento Moderno en Centro",
    "addresses": [
      {
        "street_address": "Av. Libertador 1234, Piso 5, Depto A",
        "city": "Buenos Aires",
        "state": "Capital Federal",
        "country": "Argentina"
      }
    ],
    "owners": [
      {
        "name": "Carlos González",
        "primary_email": "carlos@email.com",
        "phone_number": "+5491198765432"
      }
    ]
  }
}
```

---

### 1.5 Actualizar Contrato

**Endpoint:** `PATCH /:slug/admin/contracts/:id`
**Auth:** Requerida (ADMIN)

**Request Body (todos los campos son opcionales):**
```json
{
  "monthly_rent": 1300.00,
  "payment_day": 10,
  "deposit_amount": 2600.00,
  "late_fee_percentage": 7,
  "included_services": [
    "Internet",
    "Cable TV",
    "Expensas",
    "Agua"
  ]
}
```

**Response (200):**
```json
{
  "id": 1,
  "contract_number": "CTR-2026-0001",
  "monthly_rent": 1300.00,
  "payment_day": 10,
  "deposit_amount": 2600.00,
  "late_fee_percentage": 7.00,
  "updated_at": "2026-02-05T11:00:00.000Z"
}
```

**⚠️ Restricciones:**
- No se puede modificar si el contrato está `ACTIVO`
- Solo se pueden actualizar contratos en estado `BORRADOR`
- Después de actualizar, se requiere nueva firma del inquilino

---

### 1.6 Cambiar Estado del Contrato

**Endpoint:** `PATCH /:slug/admin/contracts/:id/status`
**Auth:** Requerida (ADMIN)

**Request Body:**
```json
{
  "status": "ACTIVO",
  "reason": "Contrato firmado por ambas partes"
}
```

**Estados válidos:**
- `BORRADOR` - Contrato en preparación
- `ACTIVO` - Contrato vigente
- `FINALIZADO` - Contrato terminado

**Ejemplo de transiciones:**
```
BORRADOR → ACTIVO (cuando el inquilino firma)
ACTIVO → FINALIZADO (cuando finaliza el contrato o se rescinde)
```

**Response (200):**
```json
{
  "id": 1,
  "status": "ACTIVO",
  "updated_at": "2026-02-05T11:30:00.000Z"
}
```

**Efectos secundarios:**
- Al pasar a `ACTIVO`: la propiedad cambia a `OCUPADO`
- Al pasar a `FINALIZADO`: la propiedad cambia a `DISPONIBLE`

---

### 1.7 Renovar Contrato

**Endpoint:** `POST /:slug/admin/contracts/:id/renew`
**Auth:** Requerida (ADMIN)

**Request Body:** (Vacío, no requiere parámetros)

**Response (201):**
```json
{
  "id": 2,
  "contract_number": "CTR-2026-0002",
  "status": "BORRADOR",
  "start_date": "2027-02-02",
  "end_date": "2028-02-02",
  "monthly_rent": 1320.00,
  "currency": "USD",
  "tenant_id": 5,
  "property_id": 1,
  "renewed_from": 1,
  "created_at": "2026-02-05T12:00:00.000Z",
  "tenant": {
    "id": 5,
    "name": "María González"
  },
  "property": {
    "id": 1,
    "title": "Apartamento Moderno en Centro"
  }
}
```

**Comportamiento:**
- Crea un nuevo contrato basado en el anterior
- Ajusta las fechas automáticamente (comienza el día después de finalizar el anterior)
- Aplica el aumento automático si está configurado (`auto_increase_percentage`)
- Mantiene el mismo inquilino y propiedad
- Estado inicial: `BORRADOR` (requiere firma)

---

### 1.8 Descargar PDF del Contrato

**Endpoint:** `GET /:slug/admin/contracts/:id/pdf`
**Auth:** Requerida (ADMIN)

**Response:**
- **Content-Type:** `application/pdf`
- **Content-Disposition:** `attachment; filename="CTR-2026-0001.pdf"`

**Ejemplo con cURL:**
```bash
curl -X GET http://localhost:3000/mi-inmobiliaria/admin/contracts/1/pdf \
  -H "Authorization: Bearer YOUR_TOKEN" \
  --output contrato.pdf
```

**Ejemplo en JavaScript:**
```javascript
const response = await fetch('http://localhost:3000/mi-inmobiliaria/admin/contracts/1/pdf', {
  headers: { 'Authorization': `Bearer ${token}` }
});

// Descargar archivo
const blob = await response.blob();
const url = window.URL.createObjectURL(blob);
const a = document.createElement('a');
a.href = url;
a.download = 'CTR-2026-0001.pdf';
document.body.appendChild(a);
a.click();
```

---

## 2. Portal de Inquilinos - Mis Contratos

### 2.1 Listar Mis Contratos

**Endpoint:** `GET /:slug/tenant/contracts`
**Auth:** Requerida (USER)

**Query Params:**
- `status` (opcional) - Filtrar por estado

**Response (200):**
```json
[
  {
    "id": 1,
    "contract_number": "CTR-2026-0001",
    "status": "ACTIVO",
    "start_date": "2026-02-01",
    "end_date": "2027-02-01",
    "monthly_rent": 1200.00,
    "currency": "USD",
    "payment_day": 5,
    "tenant_signature_date": "2026-02-01T10:30:00Z",
    "property": {
      "id": 1,
      "title": "Apartamento Moderno en Centro",
      "addresses": [
        {
          "street_address": "Av. Libertador 1234, Piso 5, Depto A",
          "city": "Buenos Aires",
          "country": "Argentina"
        }
      ]
    }
  }
]
```

**Nota:** Solo retorna los contratos del inquilino autenticado.

---

### 2.2 Obtener Mi Contrato Actual

**Endpoint:** `GET /:slug/tenant/contracts/current`
**Auth:** Requerida (USER)

**Response (200):**
```json
{
  "id": 1,
  "contract_number": "CTR-2026-0001",
  "status": "ACTIVO",
  "start_date": "2026-02-01",
  "end_date": "2027-02-01",
  "monthly_rent": 1200.00,
  "currency": "USD",
  "payment_day": 5,
  "property": {
    "id": 1,
    "title": "Apartamento Moderno en Centro"
  }
}
```

**Nota:** Retorna el contrato con estado `ACTIVO`. Si no hay ninguno, retorna `null`.

---

### 2.3 Ver Detalle de Mi Contrato

**Endpoint:** `GET /:slug/tenant/contracts/:id`
**Auth:** Requerida (USER)

**Response (200):**
```json
{
  "id": 1,
  "contract_number": "CTR-2026-0001",
  "status": "ACTIVO",
  "start_date": "2026-02-01",
  "end_date": "2027-02-01",
  "monthly_rent": 1200.00,
  "currency": "USD",
  "payment_day": 5,
  "deposit_amount": 2400.00,
  "payment_method": "Transferencia bancaria",
  "late_fee_percentage": 5.00,
  "grace_days": 3,
  "included_services": [
    "Internet",
    "Cable TV",
    "Expensas"
  ],
  "tenant_responsibilities": "Mantener la propiedad en buen estado...",
  "owner_responsibilities": "Realizar reparaciones necesarias...",
  "prohibitions": "No se permiten mascotas, no fumadores",
  "bank_name": "Banco Galicia",
  "bank_account_number": "123-456-789",
  "bank_account_holder": "Carlos González",
  "tenant_signature_date": "2026-02-01T10:30:00Z",
  "property": {
    "id": 1,
    "title": "Apartamento Moderno en Centro",
    "addresses": [
      {
        "street_address": "Av. Libertador 1234, Piso 5, Depto A",
        "city": "Buenos Aires",
        "country": "Argentina"
      }
    ]
  }
}
```

**⚠️ Seguridad:** El inquilino solo puede ver sus propios contratos. Si intenta acceder a un contrato de otro inquilino, recibirá un error 403.

---

### 2.4 Firmar Contrato (Aceptación)

**Endpoint:** `POST /:slug/tenant/contracts/:id/sign`
**Auth:** Requerida (USER)

**Request Body:** (Vacío o con confirmación)
```json
{}
```

**Response (200):**
```json
{
  "message": "Contrato firmado exitosamente",
  "contract": {
    "id": 1,
    "status": "ACTIVO",
    "tenant_signature_date": "2026-02-05T14:30:00Z",
    "tenant_signature_ip": "192.168.1.100"
  }
}
```

**Efectos de la firma:**
1. El contrato cambia de `BORRADOR` a `ACTIVO`
2. Se registra la fecha y hora de firma
3. Se registra la IP del inquilino
4. La propiedad cambia de `RESERVADO` a `OCUPADO`
5. Se envía notificación al administrador

**Validaciones:**
- Solo se pueden firmar contratos en estado `BORRADOR`
- Solo el inquilino asignado puede firmar
- No se puede firmar si ya está firmado

---

### 2.5 Descargar PDF de Mi Contrato

**Endpoint:** `GET /:slug/tenant/contracts/:id/pdf`
**Auth:** Requerida (USER)

**Response:**
- **Content-Type:** `application/pdf`
- **Content-Disposition:** `attachment; filename="CTR-2026-0001.pdf"`

**⚠️ Seguridad:** El inquilino solo puede descargar sus propios contratos.

---

## 3. Estados del Contrato

### 3.1 Ciclo de Vida del Contrato

```
BORRADOR → ACTIVO → FINALIZADO
```

### 3.2 Descripción de Estados

| Estado | Descripción | Acciones Permitidas |
|--------|-------------|---------------------|
| `BORRADOR` | Contrato creado pero no firmado | Editar, Firmar, Eliminar |
| `ACTIVO` | Contrato vigente y firmado | Ver, Descargar PDF, Finalizar |
| `FINALIZADO` | Contrato terminado | Ver, Descargar PDF |

### 3.3 Transiciones de Estado

**De BORRADOR a ACTIVO:**
- Se activa cuando el inquilino firma el contrato
- La propiedad cambia de `RESERVADO` a `OCUPADO`
- El inquilino recibe acceso a funcionalidades de mantenimiento

**De ACTIVO a FINALIZADO:**
- Se activa cuando:
  - El contrato llega a su fecha de finalización (`end_date`)
  - El administrador cambia manualmente el estado
  - El contrato se rescinde por mutuo acuerdo
- La propiedad cambia de `OCUPADO` a `DISPONIBLE`

---

## 4. Flujo Completo de Creación y Firma

### 4.1 Desde el Panel de Administración

**Paso 1: Crear Contrato**
```javascript
POST /:slug/admin/contracts
{
  "tenant_id": 5,
  "property_id": 1,
  "start_date": "2026-02-01",
  "end_date": "2027-02-01",
  "monthly_rent": 1200.00
}
```

**Resultado:**
- Contrato creado con estado `BORRADOR`
- Propiedad cambia a `RESERVADO`
- Se envía notificación al inquilino

---

**Paso 2: El Inquilino Firma**
```javascript
POST /:slug/tenant/contracts/:id/sign
```

**Resultado:**
- Contrato cambia a `ACTIVO`
- Propiedad cambia a `OCUPADO`
- Se envía notificación al administrador

---

**Paso 3: (Opcional) Renovar Contrato**
```javascript
POST /:slug/admin/contracts/:id/renew
```

**Resultado:**
- Nuevo contrato creado basado en el anterior
- Estado `BORRADOR` (requiere nueva firma)

---

### 4.2 Diagrama de Secuencia

```
Admin          Sistema         Inquilino
  |               |                |
  |--- Crear ---->|                |
  |   Contrato    |                |
  |<-- BORRADOR --|                |
  |               |--- Notificar ->|
  |               |   (Nuevo       |
  |               |   Contrato)    |
  |               |                |
  |               |<-- Firmar -----|
  |               |                |
  |<-- Notificar -|                |
  |   (Firmado)   |                |
  |               |                |
```

---

## Ejemplos de Implementación en Frontend

### Ejemplo 1: Lista de Contratos (Admin)

```javascript
import React, { useState, useEffect } from 'react';
import { useAuth } from './AuthContext';

function AdminContractsList() {
  const { token } = useAuth();
  const [contracts, setContracts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ status: '' });

  useEffect(() => {
    fetchContracts();
  }, [filters]);

  const fetchContracts = async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filters.status) params.append('status', filters.status);

    try {
      const response = await fetch(
        `http://localhost:3000/mi-inmobiliaria/admin/contracts?${params}`,
        {
          headers: { 'Authorization': `Bearer ${token}` }
        }
      );

      const data = await response.json();
      setContracts(data);

    } catch (error) {
      console.error('Error:', error);

    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status) => {
    const colors = {
      'BORRADOR': 'warning',
      'ACTIVO': 'success',
      'FINALIZADO': 'default'
    };
    return <span className={`badge badge-${colors[status]}`}>{status}</span>;
  };

  return (
    <div className="contracts-list">
      <div className="page-header">
        <h1>Gestión de Contratos</h1>
        <a href="/admin/contracts/new" className="btn-primary">
          + Nuevo Contrato
        </a>
      </div>

      {/* Filtros */}
      <div className="filters-bar">
        <select
          value={filters.status}
          onChange={(e) => setFilters({ status: e.target.value })}
        >
          <option value="">Todos los estados</option>
          <option value="BORRADOR">Borrador</option>
          <option value="ACTIVO">Activo</option>
          <option value="FINALIZADO">Finalizado</option>
        </select>
      </div>

      {/* Tabla */}
      {loading ? (
        <div>Cargando...</div>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>N° Contrato</th>
              <th>Inquilino</th>
              <th>Propiedad</th>
              <th>Inicio</th>
              <th>Fin</th>
              <th>Alquiler</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {contracts.map(contract => (
              <tr key={contract.id}>
                <td>
                  {contract.contract_number}
                  {contract.application_id && (
                    <span className="badge badge-info" title={`Vinculado a solicitud #${contract.application_id}`}>
                      ✓ Solicitud
                    </span>
                  )}
                </td>
                <td>{contract.tenant.name}</td>
                <td>{contract.property.title}</td>
                <td>{new Date(contract.start_date).toLocaleDateString()}</td>
                <td>{new Date(contract.end_date).toLocaleDateString()}</td>
                <td>${contract.monthly_rent}</td>
                <td>{getStatusBadge(contract.status)}</td>
                <td>
                  <a href={`/admin/contracts/${contract.id}`} className="btn-view">
                    Ver
                  </a>
                  {contract.status === 'BORRADOR' && (
                    <a href={`/admin/contracts/${contract.id}/edit`} className="btn-edit">
                      Editar
                    </a>
                  )}
                  <a
                    href={`/admin/contracts/${contract.id}/pdf`}
                    className="btn-download"
                    target="_blank"
                  >
                    PDF
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default AdminContractsList;
```

---

### Ejemplo 2: Formulario de Creación de Contrato

```javascript
import React, { useState, useEffect } from 'react';
import { useAuth } from './AuthContext';

function CreateContractForm() {
  const { token } = useAuth();
  const [tenants, setTenants] = useState([]);
  const [properties, setProperties] = useState([]);
  const [formData, setFormData] = useState({
    tenant_id: '',
    property_id: '',
    application_id: '',
    start_date: '',
    end_date: '',
    monthly_rent: '',
    deposit_amount: '',
    currency: 'BOB',
    payment_day: 5,
    payment_method: '',
    included_services: []
  });

  useEffect(() => {
    // Cargar inquilinos (solo INQUILINO, preferiblemente con solicitud aprobada)
    fetch('http://localhost:3000/mi-inmobiliaria/users/tenants?status=approved&hasActiveContract=false', {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(res => res.json())
      .then(data => setTenants(data));

    // Cargar propiedades disponibles
    fetch('http://localhost:3000/mi-inmobiliaria/admin/properties?status=DISPONIBLE', {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(res => res.json())
      .then(data => setProperties(data));
  }, [token]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      const response = await fetch('http://localhost:3000/mi-inmobiliaria/admin/contracts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(formData)
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Error al crear contrato');
      }

      const contract = await response.json();
      alert('Contrato creado exitosamente. El inquilino recibirá una notificación para firmar.');
      window.location.href = `/admin/contracts/${contract.id}`;

    } catch (error) {
      alert(error.message);
    }
  };

  const handleServiceToggle = (service) => {
    setFormData(prev => ({
      ...prev,
      included_services: prev.included_services.includes(service)
        ? prev.included_services.filter(s => s !== service)
        : [...prev.included_services, service]
    }));
  };

  return (
    <form onSubmit={handleSubmit} className="contract-form">
      <h1>Crear Nuevo Contrato (Manual)</h1>

      {/* Información básica */}
      <section className="form-section">
        <h2>Información Básica</h2>

        <div className="form-group">
          <label>Inquilino *</label>
          <select
            value={formData.tenant_id}
            onChange={(e) => setFormData({ ...formData, tenant_id: e.target.value })}
            required
          >
            <option value="">Seleccionar inquilino...</option>
            {tenants.map(tenant => (
              <option key={tenant.id} value={tenant.id}>
                {tenant.name} - {tenant.email}
                {tenant.approved_applications > 0 && ' ✓ Solicitud aprobada'}
                {tenant.active_contracts > 0 && ' ⚠ Tiene contrato activo'}
              </option>
            ))}
          </select>
          <small>
            Nota: Solo se muestran inquilinos con solicitud aprobada y sin contrato activo.
          </small>
        </div>

        <div className="form-group">
          <label>Propiedad *</label>
          <select
            value={formData.property_id}
            onChange={(e) => setFormData({ ...formData, property_id: e.target.value })}
            required
          >
            <option value="">Seleccionar propiedad...</option>
            {properties.map(property => (
              <option key={property.id} value={property.id}>
                {property.title} - {property.addresses?.[0]?.city}
              </option>
            ))}
          </select>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>Fecha de Inicio *</label>
            <input
              type="date"
              value={formData.start_date}
              onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
              required
            />
          </div>

          <div className="form-group">
            <label>Fecha de Finalización *</label>
            <input
              type="date"
              value={formData.end_date}
              onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
              required
            />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>Alquiler Mensual *</label>
            <input
              type="number"
              value={formData.monthly_rent}
              onChange={(e) => setFormData({ ...formData, monthly_rent: e.target.value })}
              required
              placeholder="1200.00"
            />
          </div>

          <div className="form-group">
            <label>Moneda</label>
            <select
              value={formData.currency}
              onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
            >
              <option value="BOB">BOB</option>
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
            </select>
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>Depósito</label>
            <input
              type="number"
              value={formData.deposit_amount}
              onChange={(e) => setFormData({ ...formData, deposit_amount: e.target.value })}
              placeholder="1200.00 (1 mes de renta por defecto)"
            />
          </div>

          <div className="form-group">
            <label>Día de Pago</label>
            <input
              type="number"
              min="1"
              max="31"
              value={formData.payment_day}
              onChange={(e) => setFormData({ ...formData, payment_day: e.target.value })}
            />
          </div>
        </div>

        <div className="form-group">
          <label>Método de Pago</label>
          <input
            type="text"
            value={formData.payment_method}
            onChange={(e) => setFormData({ ...formData, payment_method: e.target.value })}
            placeholder="Ej: Transferencia bancaria"
          />
        </div>
      </section>

      {/* Servicios incluidos */}
      <section className="form-section">
        <h2>Servicios Incluidos</h2>

        <div className="checkbox-group">
          {['Internet', 'Cable TV', 'Expensas', 'Agua', 'Luz', 'Gas'].map(service => (
            <label key={service} className="checkbox-item">
              <input
                type="checkbox"
                checked={formData.included_services.includes(service)}
                onChange={() => handleServiceToggle(service)}
              />
              {service}
            </label>
          ))}
        </div>
      </section>

      {/* Botones */}
      <div className="form-actions">
        <button type="submit" className="btn-primary">
          Crear Contrato
        </button>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => window.history.back()}
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}

export default CreateContractForm;
```

---

### Ejemplo 3: Vista de Contrato para Inquilino con Firma

```javascript
import React, { useState, useEffect } from 'react';
import { useAuth } from './AuthContext';

function TenantContractDetail({ contractId }) {
  const { token } = useAuth();
  const [contract, setContract] = useState(null);
  const [loading, setLoading] = useState(true);
  const [signing, setSigning] = useState(false);

  useEffect(() => {
    fetchContract();
  }, [contractId]);

  const fetchContract = async () => {
    try {
      const response = await fetch(
        `http://localhost:3000/mi-inmobiliaria/tenant/contracts/${contractId}`,
        {
          headers: { 'Authorization': `Bearer ${token}` }
        }
      );

      if (!response.ok) {
        throw new Error('Contrato no encontrado');
      }

      const data = await response.json();
      setContract(data);

    } catch (error) {
      alert(error.message);

    } finally {
      setLoading(false);
    }
  };

  const handleSign = async () => {
    if (!confirm('¿Estás seguro de firmar este contrato? Esta acción es irreversible.')) {
      return;
    }

    setSigning(true);

    try {
      const response = await fetch(
        `http://localhost:3000/mi-inmobiliaria/tenant/contracts/${contractId}/sign`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          }
        }
      );

      if (!response.ok) {
        throw new Error('Error al firmar contrato');
      }

      const data = await response.json();
      alert('¡Contrato firmado exitosamente!');
      fetchContract(); // Recargar para ver el estado actualizado

    } catch (error) {
      alert(error.message);

    } finally {
      setSigning(false);
    }
  };

  const downloadPDF = async () => {
    try {
      const response = await fetch(
        `http://localhost:3000/mi-inmobiliaria/tenant/contracts/${contractId}/pdf`,
        {
          headers: { 'Authorization': `Bearer ${token}` }
        }
      );

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${contract.contract_number}.pdf`;
      document.body.appendChild(a);
      a.click();

    } catch (error) {
      alert('Error al descargar PDF');
    }
  };

  if (loading) return <div>Cargando...</div>;
  if (!contract) return <div>Contrato no encontrado</div>;

  const canSign = contract.status === 'BORRADOR';
  const isSigned = contract.status === 'ACTIVO' || contract.status === 'FINALIZADO';

  return (
    <div className="contract-detail">
      <div className="page-header">
        <h1>Contrato {contract.contract_number}</h1>
        <span className={`badge badge-${contract.status === 'ACTIVO' ? 'success' : 'warning'}`}>
          {contract.status}
        </span>
      </div>

      {/* Información principal */}
      <section className="contract-info">
        <div className="info-card">
          <h3>Propiedad</h3>
          <p><strong>{contract.property.title}</strong></p>
          <p>{contract.property.addresses[0].street_address}</p>
          <p>{contract.property.addresses[0].city}, {contract.property.addresses[0].country}</p>
        </div>

        <div className="info-card">
          <h3>Fechas</h3>
          <p><strong>Inicio:</strong> {new Date(contract.start_date).toLocaleDateString()}</p>
          <p><strong>Fin:</strong> {new Date(contract.end_date).toLocaleDateString()}</p>
          {isSigned && (
            <p><strong>Firmado el:</strong> {new Date(contract.tenant_signature_date).toLocaleString()}</p>
          )}
        </div>

        <div className="info-card">
          <h3>Alquiler</h3>
          <p><strong>Monto:</strong> ${contract.monthly_rent} {contract.currency}</p>
          <p><strong>Día de pago:</strong> Día {contract.payment_day}</p>
          {contract.deposit_amount && (
            <p><strong>Depósito:</strong> ${contract.deposit_amount} {contract.currency}</p>
          )}
        </div>
      </section>

      {/* Servicios incluidos */}
      {contract.included_services?.length > 0 && (
        <section className="included-services">
          <h3>Servicios Incluidos</h3>
          <ul>
            {contract.included_services.map((service, index) => (
              <li key={index}>✓ {service}</li>
            ))}
          </ul>
        </section>
      )}

      {/* Responsabilidades */}
      {contract.tenant_responsibilities && (
        <section className="responsibilities">
          <h3>Mis Responsabilidades</h3>
          <p>{contract.tenant_responsibilities}</p>
        </section>
      )}

      {/* Prohibiciones */}
      {contract.prohibitions && (
        <section className="prohibitions">
          <h3>Prohibiciones</h3>
          <p>{contract.prohibitions}</p>
        </section>
      )}

      {/* Datos bancarios */}
      {contract.bank_name && (
        <section className="bank-info">
          <h3>Datos para Transferencia</h3>
          <p><strong>Banco:</strong> {contract.bank_name}</p>
          <p><strong>Cuenta:</strong> {contract.bank_account_type} - {contract.bank_account_number}</p>
          <p><strong>Titular:</strong> {contract.bank_account_holder}</p>
        </section>
      )}

      {/* Acciones */}
      <div className="actions">
        {canSign && (
          <button
            className="btn-sign"
            onClick={handleSign}
            disabled={signing}
          >
            {signing ? 'Firmando...' : '🖊️ Firmar Contrato'}
          </button>
        )}

        <button
          className="btn-download"
          onClick={downloadPDF}
        >
          📥 Descargar PDF
        </button>
      </div>

      {isSigned && (
        <div className="signature-info">
          <p>✅ Contrato firmado el {new Date(contract.tenant_signature_date).toLocaleString()}</p>
        </div>
      )}
    </div>
  );
}

export default TenantContractDetail;
```

---

## Notas Importantes para el Frontend

### 1. Seguridad
- Los inquilinos SOLO pueden ver sus propios contratos
- Validar siempre que el usuario tenga permisos antes de mostrar/permitir acciones
- Usar el token JWT para identificar al usuario actual

### 2. Estados del Contrato
- Muestra los estados con colores diferentes para mejor UX
- No permitas editar contratos `ACTIVO` o `FINALIZADO`
- Solo los contratos `BORRADOR` pueden ser firmados

### 3. Flujo Recomendado
- **Usa el sistema de solicitudes** como flujo principal
- La creación manual de contratos debe usarse solo en casos especiales
- Muestra un indicador cuando un contrato esté vinculado a una solicitud (`application_id`)

### 4. Listado de Inquilinos
- Usa el endpoint `GET /:slug/users/tenants` para obtener inquilinos
- Filtra por `status=approved` para mostrar solo inquilinos con solicitud aprobada
- Filtra por `hasActiveContract=false` para inquilinos disponibles
- Muestra métricas como `application_count` y `active_contracts`

### 5. PDF Generation
- El PDF se genera en el servidor
- Descarga el archivo y ábrelo en una nueva pestaña o inicia la descarga
- Considera mostrar un preview antes de permitir la firma

### 6. Notificaciones
- Cuando se crea un contrato, el inquilino recibe notificación
- Cuando el inquilino firma, el admin recibe notificación
- Implementa un sistema de notificaciones en tiempo real si es posible

### 7. Validaciones
- Fecha de fin debe ser posterior a fecha de inicio
- El alquiler debe ser mayor a 0
- El inquilino debe tener rol `INQUILINO`
- Para creación manual: el inquilino debe tener una solicitud aprobada
- Un inquilino no puede tener más de un contrato activo

### 8. Campos Actualizados
- `application_id`: ID de la solicitud que originó el contrato (null si fue creación manual)
- `currency`: Default ahora es "BOB" en lugar de "USD"
- `deposit_amount`: Ya no tiene default automático, debe especificarse

---

## Resumen de Endpoints

### Para Administradores
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| `GET` | `/:slug/admin/contracts/dashboard` | Métricas de contratos |
| `GET` | `/:slug/admin/contracts` | Listar todos los contratos |
| `GET` | `/:slug/admin/contracts/:id` | Ver detalle de contrato |
| `POST` | `/:slug/admin/contracts` | Crear contrato manual (casos especiales) |
| `PATCH` | `/:slug/admin/contracts/:id` | Actualizar contrato |
| `PATCH` | `/:slug/admin/contracts/:id/status` | Cambiar estado |
| `POST` | `/:slug/admin/contracts/:id/renew` | Renovar contrato |
| `GET` | `/:slug/admin/contracts/:id/pdf` | Descargar PDF |

### Para Inquilinos
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| `GET` | `/:slug/tenant/contracts` | Listar mis contratos |
| `GET` | `/:slug/tenant/contracts/current` | Ver mi contrato actual |
| `GET` | `/:slug/tenant/contracts/:id` | Ver detalle de mi contrato |
| `POST` | `/:slug/tenant/contracts/:id/sign` | Firmar contrato |
| `GET` | `/:slug/tenant/contracts/:id/pdf` | Descargar PDF de mi contrato |

### Endpoints de Usuarios Relacionados
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| `GET` | `/:slug/users/tenants` | Listar inquilinos (con filtros) |
| `GET` | `/:slug/users/tenants/:id` | Ver detalle de inquilino |

---

**Fin de la Documentación de Contratos**
