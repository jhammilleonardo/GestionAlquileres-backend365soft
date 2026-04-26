# API Documentation - Sistema de Notificaciones

Esta documentación está diseñada para el equipo de frontend que trabajará en el sistema de notificaciones. Las notificaciones son **in-app** por defecto. Cada tenant puede habilitar además canales **email** y **whatsapp** en `tenant_config.notification_channels` — actualmente esos canales tienen integración pendiente (stub de log).

**Base URL:** `http://localhost:3000`

**⚠️ IMPORTANTE - Formato de Rutas:**
Todas las rutas incluyen el **slug del tenant** como primer parámetro:
- `/:slug/notifications/*` - Rutas para notificaciones (tanto admin como inquilinos)

Ejemplo: `http://localhost:3000/mi-empresa/notifications`

El sistema detecta automáticamente el rol del usuario (ADMIN o USER) mediante el token JWT y muestra las notificaciones correspondientes.

---

## Índice

1. [Mis Notificaciones - Listado](#1-mis-notificaciones---listado)
2. [Ver Detalle de Notificación](#2-ver-detalle-de-notificación)
3. [Marcar como Leída](#3-marcar-como-leída)
4. [Marcar Todas como Leídas](#4-marcar-todas-como-leídas)
5. [Eliminar Notificación](#5-eliminar-notificación)
6. [Estadísticas de Notificaciones](#6-estadísticas-de-notificaciones)
7. [Tipos de Notificaciones](#7-tipos-de-notificaciones)
8. [Notificaciones Automáticas de Ciclo de Vida](#8-notificaciones-automáticas-de-ciclo-de-vida)
9. [Ejemplos de Implementación](#9-ejemplos-de-implementación)

---

## 1. Mis Notificaciones - Listado

### 1.1 Obtener Mis Notificaciones

Devuelve las notificaciones del usuario autenticado (admin o inquilino). El sistema detecta automáticamente tu rol.

**Endpoint:** `GET /:slug/notifications`
**Auth:** Requerida - `Authorization: Bearer <token>`

**URL Params:**
- `slug` - El slug del tenant (ejemplo: `mi-empresa`)

**Query Params (Todos opcionales):**
```
?is_read=false
&event_type=maintenance.request.created
&limit=20
&offset=0
```

**Descripción de filtros:**
- `is_read` - Filtra por estado de lectura (`true` o `false`)
- `event_type` - Filtra por tipo de evento específico
- `limit` - Cantidad de resultados (default: 20, max: 100)
- `offset` - Para paginación (default: 0)

---

### Ejemplos de Uso

#### Ejemplo 1: Todas mis notificaciones
```http
GET /mi-empresa/notifications
```
Devuelve todas las notificaciones del usuario (leídas y no leídas).

#### Ejemplo 2: Solo no leídas
```http
GET /mi-empresa/notifications?is_read=false
```
Devuelve solo las notificaciones pendientes de lectura.

#### Ejemplo 3: Notificaciones de mantenimiento
```http
GET /mi-empresa/notifications?event_type=maintenance.request.created
```
Devuelve solo las notificaciones de nuevas solicitudes de mantenimiento.

#### Ejemplo 4: Paginación
```http
GET /mi-empresa/notifications?limit=10&offset=0
```
Devuelve las primeras 10 notificaciones.

---

### Response (200)

```json
[
  {
    "id": 1,
    "user_id": 1,
    "event_type": "maintenance.request.created",
    "title": "Nueva solicitud de mantenimiento",
    "message": "El inquilino Juan Pérez ha creado una nueva solicitud de mantenimiento: Fuga en el baño principal",
    "metadata": {
      "ticket_number": "MNT-2024-7A3F9B2",
      "maintenance_request_id": 15,
      "property_id": 10,
      "property_title": "Apartamento 5B",
      "category": "PLOMERIA",
      "priority": "HIGH"
    },
    "is_read": false,
    "read_at": null,
    "created_at": "2024-02-03T14:30:00.000Z"
  },
  {
    "id": 2,
    "user_id": 1,
    "event_type": "maintenance.message.received",
    "title": "Nuevo mensaje en solicitud",
    "message": "El inquilino respondió a la solicitud MNT-2024-7A3F9B2: Los otros enchufes sí funcionan...",
    "metadata": {
      "ticket_number": "MNT-2024-7A3F9B2",
      "maintenance_request_id": 15,
      "sender_name": "Juan Pérez",
      "message_preview": "Los otros enchufes sí funcionan..."
    },
    "is_read": true,
    "read_at": "2024-02-03T15:00:00.000Z",
    "created_at": "2024-02-03T14:45:00.000Z"
  },
  {
    "id": 3,
    "user_id": 1,
    "event_type": "user.registered",
    "title": "Nuevo usuario registrado",
    "message": "María González se ha registrado en el sistema",
    "metadata": {
      "user_id": 8,
      "user_name": "María González",
      "user_email": "maria@email.com",
      "role": "USER"
    },
    "is_read": false,
    "read_at": null,
    "created_at": "2024-02-03T16:00:00.000Z"
  }
]
```

---

## 2. Ver Detalle de Notificación

### 2.1 Obtener Detalle Completo

**Endpoint:** `GET /:slug/notifications/:id`
**Auth:** Requerida

**URL Params:**
- `slug` - El slug del tenant
- `id` - El ID de la notificación (ej: 1)

**Response (200):**

```json
{
  "id": 1,
  "user_id": 1,
  "event_type": "maintenance.request.created",
  "title": "Nueva solicitud de mantenimiento",
  "message": "El inquilino Juan Pérez ha creado una nueva solicitud de mantenimiento: Fuga en el baño principal",
  "metadata": {
    "ticket_number": "MNT-2024-7A3F9B2",
    "maintenance_request_id": 15,
    "property_id": 10,
    "property_title": "Apartamento 5B",
    "category": "PLOMERIA",
    "priority": "HIGH",
    "description": "Hay una fuga constante en el lavamanos..."
  },
  "is_read": false,
  "read_at": null,
  "created_at": "2024-02-03T14:30:00.000Z"
}
```

**Nota:** El `metadata` contiene información adicional dependiendo del tipo de notificación. Útil para navegar a la página relacionada.

---

## 3. Marcar como Leída

### 3.1 Marcar una Notificación como Leída

**Endpoint:** `PATCH /:slug/notifications/:id/read`
**Auth:** Requerida

**URL Params:**
- `id` - El ID de la notificación

**Request Body:** No requerido

**Response (200):**

```json
{
  "id": 1,
  "is_read": true,
  "read_at": "2024-02-03T17:30:00.000Z",
  "message": "Notificación marcada como leída"
}
```

---

## 4. Marcar Todas como Leídas

### 4.1 Marcar Todas las Notificaciones como Leídas

Útil para el botón "Marcar todas como leídas".

**Endpoint:** `PATCH /:slug/notifications/read-all`
**Auth:** Requerida

**Request Body:** No requerido

**Response (200):**

```json
{
  "updated_count": 5,
  "message": "5 notificaciones marcadas como leídas"
}
```

---

## 5. Eliminar Notificación

### 5.1 Eliminar una Notificación

**Endpoint:** `DELETE /:slug/notifications/:id`
**Auth:** Requerida

**URL Params:**
- `id` - El ID de la notificación

**Response (200):**

```json
{
  "message": "Notificación eliminada exitosamente"
}
```

**Response (204):** No content (eliminación exitosa)

---

## 6. Estadísticas de Notificaciones

### 6.1 Obtener Contadores de Notificaciones

Útil para mostrar el badge de "notificaciones sin leer" en el header.

**Endpoint:** `GET /:slug/notifications/stats`
**Auth:** Requerida

**Response (200):**

```json
{
  "total": 25,
  "unread": 5,
  "by_type": {
    "maintenance.request.created": 2,
    "maintenance.message.received": 1,
    "maintenance.status.changed": 1,
    "user.registered": 1
  }
}
```

**Descripción de campos:**
- `total` - Total de notificaciones del usuario
- `unread` - Notificaciones no leídas
- `by_type` - Desglose por tipo de evento

---

## 7. Tipos de Notificaciones

### 7.1 Tipos de Eventos Disponibles

Los `event_type` identifican el tipo de notificación. Aquí están los disponibles actualmente:

#### 🛠️ Mantenimiento

| Event Type | Título Default | ¿Quién recibe? | Cuándo se dispara |
|------------|----------------|----------------|-------------------|
| `maintenance.request.created` | Nueva solicitud de mantenimiento | Admin | Inquilino crea solicitud |
| `maintenance.status.changed` | Estado de solicitud actualizado | Inquilino | Admin cambia estado |
| `maintenance.message.received` | Nuevo mensaje en solicitud | Admin e Inquilino | Alguien envía mensaje |
| `maintenance.assigned` | Solicitud asignada | Admin (asignado) | Admin asigna solicitud |
| `maintenance.completed` | Solicitud completada | Inquilino | Admin marca como completada |

#### 🏠 Propiedades

| Event Type | Título Default | ¿Quién recibe? | Cuándo se dispara |
|------------|----------------|----------------|-------------------|
| `property.status.changed` | Estado de propiedad actualizado | Admin | Propiedad cambia estado |
| `property.available` | Propiedad disponible | Admin | Propiedad marca DISPONIBLE |

#### 👥 Usuarios

| Event Type | Título Default | ¿Quién recibe? | Cuándo se dispara |
|------------|----------------|----------------|-------------------|
| `user.registered` | Nuevo usuario registrado | Admin | Nuevo usuario se registra |
| `user.password.changed` | Contraseña actualizada | Usuario (mismo) | Usuario cambia password |

#### 📋 Ciclo de Vida (automáticas — generadas por el sistema)

| Event Type | Título Default | ¿Quién recibe? | Cuándo se dispara |
|------------|----------------|----------------|-------------------|
| `contract.activated` | Tu contrato está activo | Inquilino | Al activar un contrato (status → ACTIVO) |
| `contract.expiring.60` | Tu contrato vence en 60 días | Admins + Inquilino | Cron diario 08:00 UTC — 60 días antes del vencimiento |
| `contract.expiring.30` | Tu contrato vence en 30 días | Admins + Inquilino | Cron diario 08:00 UTC — 30 días antes del vencimiento |
| `contract.expiring.15` | Contrato vence en 15 días | Admins **únicamente** | Cron diario 08:00 UTC — 15 días antes del vencimiento |
| `inspection.move_out.completed` | Resumen de inspección de salida | Propietario (si tiene cuenta) | Al completar una inspección de tipo `move_out` |
| `maintenance.unassigned_reminder` | Solicitudes de mantenimiento sin atender | Admins | Cron cada 6 horas — solicitudes sin asignar > 48 h |

> **Deduplicación:** Las notificaciones de ciclo de vida son idempotentes — el sistema no re-envía la misma notificación si ya fue enviada para ese contrato/inspección/solicitud.

---

### 7.2 Metadata por Tipo de Notificación

Cada tipo de notificación incluye información diferente en `metadata`:

#### maintenance.request.created
```json
{
  "ticket_number": "MNT-2024-7A3F9B2",
  "maintenance_request_id": 15,
  "property_id": 10,
  "property_title": "Apartamento 5B",
  "category": "PLOMERIA",
  "priority": "HIGH",
  "description": "Descripción del problema..."
}
```

#### maintenance.status.changed
```json
{
  "ticket_number": "MNT-2024-7A3F9B2",
  "maintenance_request_id": 15,
  "old_status": "NEW",
  "new_status": "IN_PROGRESS",
  "property_title": "Apartamento 5B"
}
```

#### maintenance.message.received
```json
{
  "ticket_number": "MNT-2024-7A3F9B2",
  "maintenance_request_id": 15,
  "sender_name": "Juan Pérez",
  "sender_id": 5,
  "message_preview": "Texto del mensaje...",
  "is_from_admin": false
}
```

#### user.registered
```json
{
  "user_id": 8,
  "user_name": "María González",
  "user_email": "maria@email.com",
  "role": "USER",
  "phone": "+5491198765432"
}
```

#### property.status.changed
```json
{
  "property_id": 10,
  "property_title": "Apartamento 5B",
  "old_status": "DISPONIBLE",
  "new_status": "OCUPADO"
}
```

#### contract.activated
```json
{
  "contract_id": 12,
  "contract_number": "CTR-2025-001",
  "start_date": "2025-01-01",
  "end_date": "2025-12-31"
}
```

#### contract.expiring.60 / contract.expiring.30 / contract.expiring.15
```json
{
  "contract_id": 12,
  "contract_number": "CTR-2025-001",
  "end_date": "2025-12-31",
  "days_left": 60
}
```

#### inspection.move_out.completed
```json
{
  "inspection_id": 8,
  "property_id": 3,
  "completed_date": "2025-06-01"
}
```

#### maintenance.unassigned_reminder
```json
{
  "maintenance_request_id": 7,
  "ticket_number": "MNT-2025-007",
  "property_title": "Casa 3"
}
```

---

## 8. Notificaciones Automáticas de Ciclo de Vida

El módulo `lifecycle-notifications` genera notificaciones automáticamente en dos contextos:

### 8.1 Disparadas por evento HTTP (dentro de un request)

Estas se generan cuando un usuario realiza una acción:

| Evento | Acción que la dispara | Destinatario |
|--------|----------------------|--------------|
| **Contrato activado** | Admin cambia estado del contrato a `ACTIVO`, o inquilino firma el contrato | Inquilino del contrato |
| **Inspección de salida completada** | Admin marca como completa una inspección de tipo `move_out` | Propietario de la propiedad (solo si tiene cuenta de usuario con rol `PROPIETARIO`) |

### 8.2 Disparadas por Cron (sin request HTTP)

Estas se ejecutan automáticamente en segundo plano:

| Cron | Horario | Qué hace |
|------|---------|----------|
| `runContractExpiryCheck` | Diariamente a las **08:00 UTC** | Revisa todos los contratos activos de todos los tenants y envía alertas de vencimiento a los 60, 30 y 15 días |
| `runMaintenanceUnassignedCheck` | Cada **6 horas** | Revisa solicitudes de mantenimiento en estado `NEW` sin técnico/vendor asignado por más de 48 horas |

### 8.3 Canales de notificación (`notification_channels`)

Cada tenant configura en `tenant_config.notification_channels` qué canales están activos:

```json
{
  "internal": true,
  "email": false,
  "whatsapp": false
}
```

- `internal: true` → se crea la notificación in-app (registro en tabla `notifications`)
- `email: true` → **stub** — actualmente loggea en consola; pendiente integración SendGrid
- `whatsapp: true` → **stub** — actualmente loggea en consola; pendiente integración Twilio

> El frontend solo necesita manejar notificaciones `internal`. Los canales email/whatsapp son transparentes para el frontend.

### 8.4 Tolerancia a fallos y reintentos

Las notificaciones de ciclo de vida están diseñadas para no bloquear el flujo principal:

- Los errores al enviar notificaciones **no propagan excepción** al caller (contratos, inspecciones)
- El cron itera todos los tenants y **continúa con el siguiente** si uno falla
- La deduplicación usa la tabla `lifecycle_notification_log` — si el cron no corrió un día y corre al día siguiente, detecta el rango de ±2 días para no re-enviar

---

## 9. Ejemplos de Implementación

### 8.1 Componente de Notificaciones en Header

```javascript
import { useState, useEffect } from 'react';

const NotificationBell = ({ tenantSlug }) => {
  const [stats, setStats] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    fetchStats();
    // Polling cada 30 segundos para nuevas notificaciones
    const interval = setInterval(fetchStats, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchStats = async () => {
    const token = localStorage.getItem('access_token');
    const response = await fetch(
      `http://localhost:3000/${tenantSlug}/notifications/stats`,
      {
        headers: { 'Authorization': `Bearer ${token}` }
      }
    );
    const data = await response.json();
    setStats(data);
  };

  const fetchNotifications = async () => {
    const token = localStorage.getItem('access_token');
    const response = await fetch(
      `http://localhost:3000/${tenantSlug}/notifications?is_read=false&limit=5`,
      {
        headers: { 'Authorization': `Bearer ${token}` }
      }
    );
    const data = await response.json();
    setNotifications(data);
  };

  const handleBellClick = async () => {
    if (!isOpen) {
      await fetchNotifications();
    }
    setIsOpen(!isOpen);
  };

  const markAsRead = async (notificationId) => {
    const token = localStorage.getItem('access_token');
    await fetch(
      `http://localhost:3000/${tenantSlug}/notifications/${notificationId}/read`,
      {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${token}` }
      }
    );

    // Actualizar estado local
    setNotifications(prev =>
      prev.map(n => n.id === notificationId ? { ...n, is_read: true } : n)
    );
    fetchStats();
  };

  const markAllAsRead = async () => {
    const token = localStorage.getItem('access_token');
    await fetch(
      `http://localhost:3000/${tenantSlug}/notifications/read-all`,
      {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${token}` }
      }
    );

    setNotifications([]);
    fetchStats();
  };

  const getNotificationIcon = (eventType) => {
    if (eventType.includes('maintenance')) return '🔧';
    if (eventType.includes('property')) return '🏠';
    if (eventType.includes('user')) return '👤';
    return '🔔';
  };

  const getNotificationColor = (eventType) => {
    if (eventType.includes('maintenance')) return 'text-blue-600';
    if (eventType.includes('property')) return 'text-green-600';
    if (eventType.includes('user')) return 'text-purple-600';
    return 'text-gray-600';
  };

  const handleNotificationClick = (notification) => {
    // Marcar como leída
    if (!notification.is_read) {
      markAsRead(notification.id);
    }

    // Navegar a la página relacionada según el tipo
    if (notification.event_type.includes('maintenance')) {
      const requestId = notification.metadata.maintenance_request_id;
      window.location.href = `/admin/maintenance/${requestId}`;
    } else if (notification.event_type.includes('property')) {
      const propertyId = notification.metadata.property_id;
      window.location.href = `/admin/properties/${propertyId}`;
    } else if (notification.event_type === 'user.registered') {
      const userId = notification.metadata.user_id;
      window.location.href = `/admin/users/${userId}`;
    } else if (notification.event_type.startsWith('contract.')) {
      const contractId = notification.metadata.contract_id;
      window.location.href = `/admin/contracts/${contractId}`;
    } else if (notification.event_type === 'inspection.move_out.completed') {
      const inspectionId = notification.metadata.inspection_id;
      window.location.href = `/admin/inspections/${inspectionId}`;
    }
  };

  return (
    <div className="notification-bell-container">
      {/* Botón de campana con badge */}
      <button
        onClick={handleBellClick}
        className="notification-bell"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
          <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
        </svg>

        {stats?.unread > 0 && (
          <span className="notification-badge">
            {stats.unread > 9 ? '9+' : stats.unread}
          </span>
        )}
      </button>

      {/* Dropdown de notificaciones */}
      {isOpen && (
        <div className="notification-dropdown">
          <div className="dropdown-header">
            <h3>Notificaciones</h3>
            {notifications.length > 0 && (
              <button onClick={markAllAsRead} className="mark-all-read">
                Marcar todas como leídas
              </button>
            )}
          </div>

          {notifications.length === 0 ? (
            <div className="no-notifications">
              <p>No tienes notificaciones pendientes</p>
            </div>
          ) : (
            <ul className="notification-list">
              {notifications.map(notification => (
                <li
                  key={notification.id}
                  className={`notification-item ${notification.is_read ? 'read' : 'unread'}`}
                  onClick={() => handleNotificationClick(notification)}
                >
                  <div className="notification-icon">
                    {getNotificationIcon(notification.event_type)}
                  </div>

                  <div className="notification-content">
                    <h4 className={getNotificationColor(notification.event_type)}>
                      {notification.title}
                    </h4>
                    <p className="notification-message">
                      {notification.message}
                    </p>
                    <span className="notification-time">
                      {formatRelativeTime(notification.created_at)}
                    </span>
                  </div>

                  {!notification.is_read && (
                    <div className="unread-indicator"></div>
                  )}
                </li>
              ))}
            </ul>
          )}

          <div className="dropdown-footer">
            <a href="/notifications">Ver todas las notificaciones</a>
          </div>
        </div>
      )}
    </div>
  );
};

// Helper para formatear tiempo relativo
const formatRelativeTime = (dateString) => {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Ahora';
  if (diffMins < 60) return `Hace ${diffMins} min`;
  if (diffHours < 24) return `Hace ${diffHours} h`;
  if (diffDays === 1) return 'Ayer';
  if (diffDays < 7) return `Hace ${diffDays} días`;
  return date.toLocaleDateString();
};
```

---

### 8.2 Página Completa de Notificaciones

```javascript
const NotificationsPage = ({ tenantSlug }) => {
  const [notifications, setNotifications] = useState([]);
  const [filter, setFilter] = useState('all'); // all, unread, read
  const [stats, setStats] = useState(null);

  useEffect(() => {
    fetchNotifications();
  }, [filter]);

  const fetchNotifications = async () => {
    const token = localStorage.getItem('access_token');

    let url = `http://localhost:3000/${tenantSlug}/notifications`;
    const params = new URLSearchParams();

    if (filter === 'unread') params.append('is_read', 'false');
    if (filter === 'read') params.append('is_read', 'true');

    if (params.toString()) {
      url += `?${params.toString()}`;
    }

    const response = await fetch(url, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    const data = await response.json();
    setNotifications(data);

    // Fetch stats
    const statsResponse = await fetch(
      `http://localhost:3000/${tenantSlug}/notifications/stats`,
      {
        headers: { 'Authorization': `Bearer ${token}` }
      }
    );
    const statsData = await statsResponse.json();
    setStats(statsData);
  };

  const deleteNotification = async (notificationId) => {
    if (!confirm('¿Eliminar esta notificación?')) return;

    const token = localStorage.getItem('access_token');
    await fetch(
      `http://localhost:3000/${tenantSlug}/notifications/${notificationId}`,
      {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      }
    );

    setNotifications(prev => prev.filter(n => n.id !== notificationId));
    fetchStats();
  };

  return (
    <div className="notifications-page">
      <div className="page-header">
        <h1>Mis Notificaciones</h1>

        {/* Filtros */}
        <div className="notification-filters">
          <button
            className={filter === 'all' ? 'active' : ''}
            onClick={() => setFilter('all')}
          >
            Todas ({stats?.total || 0})
          </button>
          <button
            className={filter === 'unread' ? 'active' : ''}
            onClick={() => setFilter('unread')}
          >
            No leídas ({stats?.unread || 0})
          </button>
          <button
            className={filter === 'read' ? 'active' : ''}
            onClick={() => setFilter('read')}
          >
            Leídas ({(stats?.total || 0) - (stats?.unread || 0)})
          </button>
        </div>
      </div>

      {/* Lista de notificaciones */}
      {notifications.length === 0 ? (
        <div className="empty-state">
          <p>No tienes notificaciones</p>
        </div>
      ) : (
        <div className="notifications-list">
          {notifications.map(notification => (
            <div
              key={notification.id}
              className={`notification-card ${notification.is_read ? 'read' : 'unread'}`}
            >
              <div className="notification-header">
                <div className="notification-info">
                  <span className="notification-type-badge">
                    {formatEventType(notification.event_type)}
                  </span>
                  <span className="notification-time">
                    {new Date(notification.created_at).toLocaleString()}
                  </span>
                </div>

                <div className="notification-actions">
                  {!notification.is_read && (
                    <button
                      onClick={() => markAsRead(notification.id)}
                      className="btn-mark-read"
                    >
                      Marcar como leída
                    </button>
                  )}
                  <button
                    onClick={() => deleteNotification(notification.id)}
                    className="btn-delete"
                  >
                    Eliminar
                  </button>
                </div>
              </div>

              <h3>{notification.title}</h3>
              <p>{notification.message}</p>

              {notification.metadata && (
                <div className="notification-metadata">
                  <pre>{JSON.stringify(notification.metadata, null, 2)}</pre>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const formatEventType = (eventType) => {
  const types = {
    'maintenance.request.created': '🔧 Nueva Solicitud',
    'maintenance.status.changed': '🔧 Estado Actualizado',
    'maintenance.message.received': '💬 Nuevo Mensaje',
    'maintenance.assigned': '📋 Asignado',
    'maintenance.completed': '✅ Completado',
    'property.status.changed': '🏠 Propiedad Actualizada',
    'property.available': '🏠 Propiedad Disponible',
    'user.registered': '👤 Nuevo Usuario',
    'user.password.changed': '🔒 Contraseña Cambiada',
    // Ciclo de vida
    'contract.activated': '📄 Contrato Activo',
    'contract.expiring.60': '⏳ Contrato Vence en 60 días',
    'contract.expiring.30': '⚠️ Contrato Vence en 30 días',
    'contract.expiring.15': '🚨 Contrato Vence en 15 días',
    'inspection.move_out.completed': '🏠 Inspección de Salida Completa',
    'maintenance.unassigned_reminder': '🔧 Mantenimiento Sin Atender',
  };
  return types[eventType] || eventType;
};
```

---

## Notas Importantes para el Frontend

### 1. Autenticación
- Todas las endpoints requieren token válido
- El sistema detecta automáticamente si eres ADMIN o USER
- Los admin solo ven notificaciones relevantes para admin
- Los inquilinos solo ven sus notificaciones

### 2. Polling vs WebSockets
**Actualmente:** Usa polling cada 30 segundos para verificar nuevas notificaciones
```javascript
setInterval(fetchStats, 30000);
```

**A futuro:** Se implementará WebSockets para notificaciones en tiempo real (Fase 2/3)

### 3. Metadata para Navegación
El campo `metadata` contiene IDs útiles para navegar:
```javascript
if (notification.event_type.includes('maintenance')) {
  const requestId = notification.metadata.maintenance_request_id;
  // Navegar a: /admin/maintenance/:id
}
```

### 4. No hay Panel de Preferencias (por ahora)
- Las notificaciones son automáticas
- No se pueden desactivar individualmente
- Fase 2: Se agregará panel de preferencias

### 5. Canales de Notificación
- **In-app** (`internal: true`): activo por defecto — el frontend lo consume con los endpoints de esta documentación
- **Email** (`email: true`): stub implementado — loggea en consola, pendiente integración SendGrid (Fase 3)
- **WhatsApp** (`whatsapp: true`): stub implementado — loggea en consola, pendiente integración Twilio (Fase 3)
- Los canales se configuran en `tenant_config.notification_channels` — el frontend no necesita manejarlos directamente

### 6. Multitenancy
- Cada tenant tiene sus propias notificaciones
- Las notificaciones de "mi-empresa" no se mezclan con "otra-empresa"
- El slug en la URL identifica el tenant

---

**Fin de la Documentación de Notificaciones**
