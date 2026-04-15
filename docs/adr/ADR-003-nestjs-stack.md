# ADR-003: Justificación del stack — NestJS + Angular + TypeORM + PostgreSQL

| Campo | Valor |
|-------|-------|
| **Fecha** | 2026-04-07 |
| **Autores** | Equipo 365Soft |
| **Estado** | Aceptado |

---

## Contexto

Selección del stack tecnológico completo para la plataforma 365Soft. Se necesitaba un stack que permitiera:

- Desarrollo rápido en etapa temprana con equipo pequeño
- TypeScript end-to-end para reducir errores de integración entre frontend y backend
- Soporte nativo para la arquitectura schema-per-tenant (ADR-001)
- Escalabilidad suficiente para manejar múltiples países y procesadores de pago
- Experiencia previa del equipo para minimizar la curva de aprendizaje

Alternativas evaluadas por capa:

| Capa | Elegido | Alternativas descartadas |
|------|---------|--------------------------|
| Backend | NestJS | Express puro, Fastify, Hapi |
| Frontend | Angular | React, Vue, Svelte |
| ORM | TypeORM | Prisma, Drizzle, Sequelize |
| Base de datos | PostgreSQL | MySQL, MongoDB, CockroachDB |

---

## Decisión

**Backend:** NestJS 11 + TypeScript  
**Frontend:** Angular 21 + Angular Material + Tailwind CSS 4  
**ORM:** TypeORM 0.3  
**Base de datos:** PostgreSQL 18

---

## Consecuencias

### NestJS

**Positivas:**
- Arquitectura opinada con módulos, servicios, guards, middleware e interceptores. Reduce decisiones de diseño al equipo y fuerza consistencia entre desarrolladores.
- Decoradores declarativos (`@Controller`, `@UseGuards`, `@RequirePermission`) hacen el código legible sin contexto adicional.
- Integraciones oficiales con Passport (JWT), TypeORM, Swagger, Throttler y WebSockets reducen el glue code.
- `@nestjs/testing` permite probar módulos en aislamiento sin levantar el servidor completo.
- Compatible con el patrón monolito modular (ADR-002): cada módulo de negocio es un `@Module` independiente.

**Negativas:**
- Más opinionado que Express: ciertas customizaciones requieren conocer el ciclo de vida de NestJS.
- Overhead de boilerplate (module/controller/service) para módulos muy simples.

### Angular

**Positivas:**
- Framework completo: routing, formularios reactivos, HTTP client, i18n y testing incluidos. Sin necesidad de elegir y mantener librerías de terceros para cada funcionalidad.
- TypeScript nativo y strict mode: los modelos del backend pueden compartirse con el frontend como tipos, eliminando discrepancias de contrato.
- Standalone components (Angular 21): sin NgModules, el código es más directo y el tree-shaking más efectivo.
- Angular Material 3 provee componentes accesibles y consistentes, reduciendo el tiempo de desarrollo de UI.
- El equipo tiene experiencia previa en Angular, eliminando curva de aprendizaje.

**Negativas:**
- Bundle inicial más pesado que React o Vue para SPAs simples.
- Actualizaciones de versión mayor requieren migraciones periódicas (`ng update`).

### TypeORM

**Positivas:**
- Soporte nativo para cambiar el `search_path` de PostgreSQL por request, lo cual es el mecanismo central del multi-tenancy (ADR-001).
- `DataSource.query()` permite SQL raw cuando TypeORM no es suficiente (ej: DDL de schemas en tiempo de ejecución).
- Repositorios tipados para operaciones CRUD estándar.

**Negativas:**
- La gestión del `search_path` en el pool de conexiones requiere cuidado: cada request debe resetear el path a `public`. Resuelto en `TenantContextMiddleware`.
- Prisma tiene mejor inferencia de tipos y DX más moderna, pero no tenía soporte equivalente para schema switching al momento de la decisión.

### PostgreSQL

**Positivas:**
- Los schemas de PostgreSQL son el fundamento técnico de la arquitectura schema-per-tenant (ADR-001). MySQL y MongoDB no tienen un equivalente directo.
- JSONB nativo para campos como `payment_methods` y `notification_channels` en `tenant_config`, sin perder capacidades de indexación.
- Transacciones ACID para operaciones financieras críticas (pagos, contratos, liquidaciones).
- Enums nativos (`user_role_enum`) a nivel de schema, garantizando integridad en la base de datos sin depender solo del ORM.

**Negativas:**
- Más pesado operacionalmente que MySQL para equipos sin experiencia en PostgreSQL.
- Los schemas dinámicos requieren estrategia de migraciones propia (no usar `synchronize: true`).

---

## Estado

**Aceptado.** Stack en uso desde el inicio. No se contempla cambio de ninguna capa en el roadmap actual.
