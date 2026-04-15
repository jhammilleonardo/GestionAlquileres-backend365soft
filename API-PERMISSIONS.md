# API Documentation - Roles y Permisos

Documentación del sistema de roles y permisos granulares. Controla qué puede hacer cada usuario dentro de su tenant.

**Base URL:** `http://localhost:3000`
**Auth:** Todos los endpoints requieren `Authorization: Bearer <token>`

---

## Índice

1. [Roles del sistema](#1-roles-del-sistema)
2. [Módulos disponibles](#2-módulos-disponibles)
3. [Cómo funciona el PermissionsGuard](#3-cómo-funciona-el-permissionsguard)
4. [Permisos por rol](#4-permisos-por-rol)
5. [Tabla employee_permissions](#5-tabla-employee_permissions)
6. [Decorador @RequirePermission](#6-decorador-requirepermission)
7. [Gestión de permisos de EMPLEADO](#7-gestión-de-permisos-de-empleado)
8. [Errores comunes](#8-errores-comunes)

---

## 1. Roles del sistema

El enum `user_role_enum` existe en cada schema de tenant con los siguientes valores:

| Rol | Descripción | Permisos |
|-----|-------------|----------|
| `SUPERADMIN` | Administrador global de la plataforma | Acceso total a todo |
| `ADMIN` | Administrador de la empresa | Acceso total dentro de su tenant |
| `EMPLEADO` | Empleado de la empresa | Configurables por el ADMIN módulo a módulo |
| `TECNICO` | Técnico de mantenimiento | Hardcodeado: solo `maintenance` (view, create, edit) |
| `INQUILINO` | Inquilino registrado | Sin acceso a endpoints de admin |

> **SUPERADMIN** es un rol global — no pertenece a ningún tenant específico.
> **ADMIN**, **EMPLEADO**, **TECNICO** e **INQUILINO** son roles por tenant.

---

## 2. Módulos disponibles

Los módulos sobre los que se pueden configurar permisos:

| Módulo | Descripción |
|--------|-------------|
| `properties` | Propiedades e inmuebles |
| `units` | Unidades dentro de propiedades |
| `users` | Gestión de usuarios |
| `contracts` | Contratos de arrendamiento |
| `payments` | Pagos y comprobantes |
| `maintenance` | Solicitudes de mantenimiento |
| `reports` | Reportes financieros |
| `config` | Configuración del tenant |
| `employees` | Empleados y sus permisos |
| `owners` | Propietarios de inmuebles |
| `inspections` | Inspecciones de propiedades |
| `violations` | Infracciones |
| `expenses` | Gastos por propiedad |
| `vendors` | Proveedores externos |
| `messages` | Mensajería interna |

---

## 3. Cómo funciona el PermissionsGuard

El guard `PermissionsGuard` se aplica junto a `JwtAuthGuard` en los endpoints que requieren control de acceso por módulo.

```typescript
@Get('properties')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermission('properties', 'view')
getAll() { ... }
```

**Flujo de evaluación:**

```
Request llega al endpoint
        │
        ▼
¿Tiene @RequirePermission? ──No──▶ Acceso permitido
        │ Sí
        ▼
¿Hay usuario en el request? ──No──▶ 403 No autenticado
        │ Sí
        ▼
¿Role es ADMIN o SUPERADMIN? ──Sí──▶ Acceso permitido
        │ No
        ▼
¿Role es TECNICO? ──Sí──▶ ¿módulo=maintenance y acción=view|create|edit?
        │                         │ Sí → Acceso permitido
        │                         │ No → 403 Forbidden
        │ No
        ▼
¿Role es EMPLEADO? ──Sí──▶ Consulta employee_permissions en DB
        │                         │ can_<action>=true → Acceso permitido
        │                         │ can_<action>=false o sin fila → 403 Forbidden
        │ No (INQUILINO u otro)
        ▼
403 Rol no autorizado
```

---

## 4. Permisos por rol

### ADMIN / SUPERADMIN
Acceso total. No se consulta ninguna tabla. El guard devuelve `true` inmediatamente.

### TECNICO — Permisos hardcodeados

Solo tiene acceso al módulo `maintenance` con las siguientes acciones:

| Módulo | view | create | edit | delete |
|--------|------|--------|------|--------|
| `maintenance` | ✅ | ✅ | ✅ | ❌ |
| cualquier otro | ❌ | ❌ | ❌ | ❌ |

Este comportamiento está definido en el código y **no es configurable** desde el panel de admin. Si el negocio requiere cambiar esto, se modifica directamente en `permissions.guard.ts`.

### EMPLEADO — Permisos configurables

El ADMIN configura exactamente qué puede hacer cada empleado. Se almacena en la tabla `employee_permissions` (una fila por módulo por empleado).

Acciones disponibles:

| Acción | Columna en DB | Descripción |
|--------|--------------|-------------|
| `view` | `can_view` | Ver listados y detalles |
| `create` | `can_create` | Crear nuevos registros |
| `edit` | `can_edit` | Modificar registros existentes |
| `delete` | `can_delete` | Eliminar registros |

### INQUILINO
No tiene acceso a ningún endpoint protegido con `@RequirePermission`. Tiene su propio portal en `/:slug/portal/*`.

---

## 5. Tabla employee_permissions

Existe en cada schema de tenant. Una fila por combinación usuario-módulo.

```sql
CREATE TABLE employee_permissions (
  id            SERIAL PRIMARY KEY,
  user_id       INTEGER NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  module        VARCHAR NOT NULL,
  can_view      BOOLEAN NOT NULL DEFAULT false,
  can_create    BOOLEAN NOT NULL DEFAULT false,
  can_edit      BOOLEAN NOT NULL DEFAULT false,
  can_delete    BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMP NOT NULL DEFAULT now(),
  updated_at    TIMESTAMP NOT NULL DEFAULT now(),
  UNIQUE (user_id, module)
);
```

Un empleado sin fila en esta tabla para un módulo **no tiene acceso** a ese módulo.

---

## 6. Decorador @RequirePermission

Importar desde `src/common/decorators/require-permission.decorator.ts`.

```typescript
import { RequirePermission } from '../common/decorators/require-permission.decorator';

// Sintaxis
@RequirePermission(module: PermissionModule, action: PermissionAction)

// Ejemplos
@RequirePermission('properties', 'view')    // Ver propiedades
@RequirePermission('payments', 'create')    // Registrar pagos
@RequirePermission('contracts', 'edit')     // Editar contratos
@RequirePermission('reports', 'delete')     // Eliminar reportes
```

**Valores válidos para `module`:** ver sección 2.

**Valores válidos para `action`:** `'view'` | `'create'` | `'edit'` | `'delete'`

**Uso completo en un controller:**

```typescript
import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermission } from '../common/decorators/require-permission.decorator';

@Controller(':slug/admin/payments')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PaymentsController {

  @Get()
  @RequirePermission('payments', 'view')
  findAll() { ... }

  @Post()
  @RequirePermission('payments', 'create')
  create() { ... }
}
```

> **Nota:** Si un endpoint no tiene `@RequirePermission`, el guard lo deja pasar. Siempre decorar endpoints sensibles.

---

## 7. Gestión de permisos de EMPLEADO

Los permisos se configuran al crear o actualizar un empleado. Ver `API-ADMIN.md` sección Empleados para los endpoints completos.

**Ejemplo de body al crear empleado con permisos:**

```json
{
  "name": "María López",
  "email": "maria@empresa.com",
  "password": "pass123",
  "permissions": [
    {
      "module": "properties",
      "can_view": true,
      "can_create": false,
      "can_edit": false,
      "can_delete": false
    },
    {
      "module": "maintenance",
      "can_view": true,
      "can_create": true,
      "can_edit": true,
      "can_delete": false
    },
    {
      "module": "payments",
      "can_view": true,
      "can_create": false,
      "can_edit": false,
      "can_delete": false
    }
  ]
}
```

Solo se envían los módulos que se quieren configurar. Los módulos no incluidos en el array quedan sin acceso.

---

## 8. Errores comunes

```json
// 403 — TECNICO intentando acceder a un módulo que no es maintenance
{
  "statusCode": 403,
  "message": "TECNICO no tiene acceso a payments:view",
  "error": "Forbidden"
}

// 403 — EMPLEADO sin permiso para esa acción
{
  "statusCode": 403,
  "message": "Sin permiso para contracts:delete",
  "error": "Forbidden"
}

// 403 — INQUILINO intentando acceder a admin
{
  "statusCode": 403,
  "message": "Rol no autorizado para esta acción",
  "error": "Forbidden"
}

// 403 — Request sin usuario (token inválido o expirado)
{
  "statusCode": 403,
  "message": "No autenticado",
  "error": "Forbidden"
}
```
