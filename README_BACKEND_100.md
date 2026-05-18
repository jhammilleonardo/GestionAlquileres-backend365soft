# Roadmap Para Llevar El Backend Al 100%

Actualizado: 2026-05-18

Este documento define que falta para considerar el backend listo con una
arquitectura sólida, mantenible, segura y preparada para escalar. No reemplaza a
`README.md`; es una guía técnica de cierre para desarrollo.

## Diagnóstico Ejecutivo

El backend ya mejoró bastante respecto al análisis inicial:

- El aislamiento multi-tenant ya tiene una dirección clara:
  `TenantContextMiddleware` resuelve contexto y `TenantConnectionInterceptor`
  configura la conexión por request.
- `TenantsService` dejó de concentrar toda la creación de schemas y tablas.
- El provisioning de tenants quedó separado e idempotente.
- Ya existen mejoras importantes en pagos, webhooks, contratos, propiedades,
  split payment y auth.
- Swagger ya está configurado en `main.ts` y disponible en `/docs`.

Pero todavía no se debe considerar al 100%. Aún hay deuda técnica en módulos
grandes, patrones mixtos de acceso a schema, falta de tests de integración y
limpieza transversal de lint/tipos.

## Definición De "100%"

El backend estará al 100% cuando cumpla estos criterios:

1. `npm run build` pasa siempre.
2. `npm run lint:check` pasa completo, sin deuda ignorada.
3. Unit tests e integración pasan en CI.
4. No hay `SET search_path` manual en servicios de negocio salvo en un helper
   central o en `QueryRunner` dedicado con justificación.
5. Los módulos grandes están divididos por responsabilidad real.
6. Las operaciones de escritura compuestas son transaccionales.
7. El provisioning de tenants crea todo lo necesario para un tenant nuevo sin
   depender de upgrades posteriores.
8. Los upgrades de startup son idempotentes, observables y no destructivos.
9. Los flujos críticos tienen pruebas de integración contra PostgreSQL real.
10. La documentación de API y arquitectura refleja el código real.
11. Seguridad mínima de producción: rate limit, lockout por cuenta, JWT seguro,
    CORS, Helmet, validación estricta, webhooks idempotentes y logs sin datos
    sensibles.
12. Frontend y backend tienen contratos consistentes para auth, tenant context,
    pagos, QR y errores.

## Estado Actual Por Área

| Área                 | Estado      | Riesgo | Comentario                                                                                      |
| -------------------- | ----------- | ------ | ----------------------------------------------------------------------------------------------- |
| Multi-tenancy HTTP   | Avanzado    | Medio  | Middleware ya no muta `search_path`; interceptor concentra conexión por request.                |
| Provisioning tenants | Avanzado    | Medio  | Separado en servicios idempotentes; falta test de integración con DB real.                      |
| Auth                 | Avanzado    | Medio  | Sin `SET search_path`; lockout por cuenta y eventos básicos implementados.                      |
| Properties           | Avanzado    | Medio  | Fachada mínima; create, update, lookup, catálogo, owners, leads, details y stats separados.     |
| Applications         | En progreso | Medio  | Fachada reducida; consultas, estado, aprobación, documentos, fee y screening separados.         |
| Contracts            | Avanzado    | Medio  | Lecturas y flujos clave separados; escrituras compuestas ya son transaccionales.                |
| Payments             | Avanzado    | Medio  | Fachada reducida; subservicios separados; webhooks y procesamiento QR tienen e2e.               |
| Split Payment        | Bueno       | Bajo   | Atómico, testeado y sin `SET search_path` manual.                                               |
| Maintenance          | Avanzado    | Medio  | Fachada dividida; creación, update, lookup, mensajes, etapas, vendors y stats separados.        |
| Owner Portal         | Bueno       | Bajo   | Ownership validado en propiedades, liquidaciones, PDF y autorización de mantenimiento Bolivia.  |
| Reports              | Bueno       | Bajo   | SQL alineado con entidades; Excel/PDF y reportes principales cubiertos con tests/e2e.           |
| Swagger/OpenAPI      | Parcial     | Medio  | Existe `/docs`, pero faltan DTOs/decoradores consistentes en todos los módulos.                 |
| Lint global          | Pendiente   | Alto   | `lint:check` todavía arrastra deuda transversal.                                                |
| Integración DB       | Avanzado    | Medio  | Ya cubre auth, provisioning, isolation, properties, webhooks, QR, maintenance, owner y reports. |

## Hallazgos Actuales Del Código

Conteo aproximado de servicios grandes:

```text
src/payments/payments.service.ts              333 líneas
src/payments/payment-creation.service.ts      341 líneas
src/payments/payment-status.service.ts        436 líneas
src/payments/payment-queries.service.ts       342 líneas
src/payments/payment-refunds.service.ts       109 líneas
src/payments/payment-webhook.service.ts        71 líneas
src/payments/payment-methods.service.ts        69 líneas
src/contracts/contracts.service.ts            543 líneas
src/contracts/contract-creation.service.ts    423 líneas
src/contracts/contract-queries.service.ts     193 líneas
src/contracts/contract-number.service.ts       39 líneas
src/contracts/contract-history.service.ts      42 líneas
src/contracts/contract-renewal.service.ts     235 líneas
src/contracts/contract-signing.service.ts     212 líneas
src/properties/properties.service.ts          236 líneas
src/properties/property-update.service.ts     282 líneas
src/properties/property-creation.service.ts   188 líneas
src/properties/property-lookup.service.ts     188 líneas
src/properties/property-catalog.service.ts     70 líneas
src/properties/property-search.service.ts     174 líneas
src/properties/property-public-catalog.service.ts 255 líneas
src/properties/property-owners.service.ts     393 líneas
src/applications/applications.service.ts      144 líneas
src/applications/application-creation.service.ts 261 líneas
src/applications/application-approval.service.ts 206 líneas
src/applications/application-documents.service.ts 78 líneas
src/applications/application-screening-fee.service.ts 38 líneas
src/applications/application-screening.service.ts 318 líneas
src/applications/application-queries.service.ts 85 líneas
src/applications/application-status.service.ts 78 líneas
src/payments/qr/qr-payment.service.ts         285 líneas
src/payments/qr/qr-provider.service.ts        194 líneas
src/payments/qr/qr-payment-processing.service.ts 160 líneas
src/payments/qr/qr-payment-persistence.service.ts 308 líneas
src/tenants/tenant-provisioning.service.ts    346 líneas
src/tenants/tenants.service.ts                197 líneas
src/maintenance/maintenance.service.ts       273 líneas
src/maintenance/maintenance-creation.service.ts 273 líneas
src/maintenance/maintenance-update.service.ts 162 líneas
src/maintenance/maintenance-lookup.service.ts 165 líneas
src/maintenance/maintenance-messages.service.ts 286 líneas
src/maintenance/maintenance-stage.service.ts 254 líneas
src/maintenance/maintenance-vendors.service.ts 121 líneas
src/maintenance/maintenance-stats.service.ts 87 líneas
```

`TenantsService` ya está en un tamaño sano. Los siguientes candidatos a
refactor son `properties`, `payments`, `contracts`, `applications` y
`maintenance`.

Patrones que aún deben reducirse:

- `SET search_path` ya no aparece en servicios de negocio; queda concentrado en
  el interceptor global y en tests que verifican que los servicios no lo usen.
- `PropertiesService.update` principal ya es transaccional para propiedad y
  direcciones; `updateDetails` y `getStats` ya fueron aislados en servicios
  dedicados con schema explicito.
- `console.log` / `console.error` ya fue limpiado en `maintenance`; revisar
  otros controllers y servicios.
- Uso amplio de `any` en algunos controllers y tests. `maintenance` ya tiene
  filtros/filas SQL principales tipados; `reports` ya tiene DTO numérico para
  `property_id`, filas SQL tipadas y exportación Excel/PDF sin `any` explícito.
- La primera limpieza transversal de superficie HTTP/common ya tipó
  `TenantRequest`, `CurrentTenant`, blacklist, users, notifications, health,
  storage, catálogo público, multer, metadata de pagos/notificaciones y
  `OptionalAuthGuard`, además de reemplazar `console.error` productivo en
  employees/properties por `Logger`.
- La limpieza de specs focalizados eliminó `any` explícito en
  `inspections.service.spec.ts`, `owner-statements.service.spec.ts` y
  `permissions.guard.spec.ts`, usando enums/retornos reales y mocks tipados.
- Servicios con demasiadas responsabilidades.
- Falta de pruebas de integración con PostgreSQL.

## Plan Por Fases

### Fase 1: Cerrar Multi-tenancy Y Schema Handling

Objetivo: que el manejo de schema sea consistente y verificable.

Tareas:

- Crear un helper central para ejecutar trabajo con schema explícito cuando se
  necesite fuera del interceptor.
- Reducir `SET search_path` restantes en servicios de negocio.
- Mantener `SET search_path` solo en:
  - `TenantConnectionInterceptor`.
  - Casos transaccionales con `QueryRunner` dedicado y documentado.
- Migrar queries cross-tenant a tablas calificadas:
  `${quoteIdent(schemaName)}.tabla`.
- Agregar tests para rutas sin tenant, rutas con tenant y trabajos background.

Criterios de aceptación:

- `rg -n "SET search_path" src` solo muestra interceptor, tests del interceptor
  y casos transaccionales justificados.
- No hay `SET search_path` en middleware.
- Auth global y jobs cross-tenant no cambian estado de conexiones compartidas.

### Fase 2: Refactor Completo De Properties

Objetivo: eliminar el mayor foco de deuda actual.

Estructura recomendada:

```text
properties/
├── properties.service.ts              # Orquestación CRUD mínima
├── property-creation.service.ts       # Creación transaccional
├── property-update.service.ts         # Update transaccional y notificaciones
├── property-lookup.service.ts         # Detalle de propiedad
├── property-catalog.service.ts        # Tipos/subtipos
├── property-search.service.ts         # Búsqueda/listado admin/tenant
├── property-public-catalog.service.ts # Catálogo público y vistas
├── property-owners.service.ts         # Owners y porcentajes
├── property-addresses.service.ts      # Direcciones con QueryRunner
├── property-leads.service.ts          # Leads/contactos
├── property-images.service.ts         # Imágenes y storage
├── property-details.service.ts        # Detalles dinámicos
├── property-stats.service.ts          # Dashboard/metricas
└── property-notifications.service.ts  # Notificaciones de cambios
```

Avance ya realizado:

- `PropertyUpdateService` concentra `update`, usa `QueryRunner`, valida
  tipo/subtipo, actualiza direcciones de forma atómica y emite notificaciones
  de cambio de estado después del commit.
- Si falla reemplazar direcciones despues del update, se hace rollback completo.
- Las notificaciones de cambio de estado se ejecutan despues del commit y con
  schema explicito.
- `PropertyNotificationsService` separa la notificacion del CRUD principal.
- `PropertyDetailsService` separa updates de detalles e imagenes, usa tabla
  calificada por schema y permite limpiar campos JSON con `null`.
- `PropertyStatsService` separa metricas y usa tabla calificada por schema.
- `PropertyAddressesService` separa creacion/reemplazo de direcciones y usa el
  mismo `QueryRunner` de create/update para mantener rollback atomico.
- `PropertiesService.findOne`, `remove` y validaciones previas de `create`
  usan schema calificado y ya no mutan `search_path` sobre conexiones
  compartidas.
- `PropertySearchService`, `PropertyOwnersService` y `PropertyLeadsService`
  usan schema calificado en rutas tenant-facing y dejaron de mutar
  `search_path` sobre conexiones compartidas.
- `PropertyCreationService` y `PropertyUpdateService` usan
  tablas calificadas por schema incluso dentro de `QueryRunner`; ya no ejecutan
  `SET search_path`.
- `PropertyCreationService` concentra validación de tipo/subtipo, creación de
  propiedad, direcciones y owners dentro de una sola transacción.
- `PropertyLookupService` concentra `findOne`, direcciones, owners y formateo
  de detalle con schema calificado.
- `PropertyCatalogService` concentra tipos/subtipos con schema calificado.
- `PropertyOwnersService` valida reglas de owners: un solo owner primario por
  propiedad, suma de ownership máxima de 100%, asignación manual transaccional y
  promoción automática de un primario alternativo si se elimina el primario
  actual.
- `PropertyPublicCatalogService` concentra catálogo público, detalle público y
  registro de vistas; `PropertySearchService` queda enfocado en búsquedas
  admin/tenant.

Tareas restantes:

- Separar `PropertyOwnersService` si sigue creciendo, especialmente validación
  de ownership y side effects de owners.
- Tipar filas SQL; reducir `any`.
- Evitar duplicación entre catálogo público, tenant portal y admin.
- Revisar si `PropertyPublicCatalogService` debe normalizar respuestas con DTOs
  explícitos para frontend.

Criterios de aceptación:

- `properties.service.ts` queda por debajo de 250-300 líneas.
- `create` y `update` son atómicos.
- No hay logs con SQL/valores sensibles.
- Tests cubren rollback cuando falla una escritura secundaria.

### Fase 3: Payments Y QR Payments

Objetivo: que pagos y QR sean consistentes, idempotentes y testeables.

Avance ya realizado:

- Reads admin/tenant de pagos (`getAllPayments`, `getAdminStats`,
  `getTenantPayments`, `getTenantStats`, `getPaymentById`) usan schema
  calificado y quedaron extraidos a `PaymentQueriesService`.
- Export CSV de pagos usa schema calificado desde `PaymentQueriesService`.
- Cambios de estado (`updatePaymentStatus`, `approvePayment`,
  `rejectPayment`) quedaron extraidos a `PaymentStatusService`.
- `approvePayment` actualiza pago y genera split con el mismo `QueryRunner`;
  si falla el split, la aprobacion hace rollback y no queda una liquidacion
  inconsistente.
- Notificaciones de aprobacion/rechazo usan schema explicito cuando existe
  `schema_name`.
- `PaymentsController` pasa `schema_name` explícito desde `req.tenant` y dejó
  de depender de estado implícito de la conexión.
- `createPayment`, `createPaymentAsAdmin` y procesamiento de QR pagado usan
  tablas calificadas por schema dentro de sus transacciones.
- `createPayment` y `createPaymentAsAdmin` quedaron extraidos a
  `PaymentCreationService`; `PaymentsService` conserva solo la fachada pública
  usada por controllers y procesadores.
- Métodos de pago disponibles quedaron extraidos a `PaymentMethodsService`, con
  lectura de `tenant_config` por schema calificado y filtro por enum permitido.
- `createRefund` usa tablas calificadas por schema, bloquea el pago con
  `FOR UPDATE`, valida reembolsos acumulados y solo marca `REFUNDED` cuando el
  reembolso total cubre el pago completo. La logica vive en
  `PaymentRefundsService`.
- Webhooks externos quedan centralizados en `PaymentWebhookService`, con
  registro idempotente en `webhook_events` y actualización de pago por
  `reference_number` usando schema calificado dentro de la misma transacción;
  si falla el update del pago, el evento también hace rollback para permitir
  reintento real del proveedor.
- Procesamiento automático de QR pagado quedó extraido a
  `QrPaymentProcessingService`; inserta en `payments` y actualiza
  `qr_payments` en una transacción con tablas calificadas por schema.
- Comunicación con MC4/SIP quedó extraida a `QrProviderService`, con respuestas
  tipadas para generación y consulta de estado.
- Persistencia de QR quedó extraida a `QrPaymentPersistenceService`: DDL
  idempotente de `qr_payments`, búsqueda por id/alias, creación pendiente,
  actualización de estado, cancelación con ownership y mapeo de salida.
- El procesamiento automático de QR pagado bloquea la fila `qr_payments` con
  `FOR UPDATE` y no duplica `payments` si el QR ya tiene `pago_id`.
- `QrPaymentService` quedó como orquestador del flujo: resuelve tenant,
  valida reglas de negocio, coordina proveedor externo, persistencia y
  procesamiento transaccional del pago.
- `QRBoliviaProcessor` quedó alineado con contratos tipados de QR y sin
  stringificación insegura de `metadata`.
- El pago generado por QR usa enums estándar del módulo (`RENT`, `QR_MC4`,
  `APPROVED`, `mc4_qr`) en lugar de literales incompatibles.
- `test/e2e/10-payment-webhook-idempotency.e2e-spec.ts` valida contra
  PostgreSQL real que un webhook duplicado actualiza el pago una sola vez y
  conserva un solo registro en `webhook_events`.
- `test/e2e/11-qr-payment-processing-idempotency.e2e-spec.ts` valida contra
  PostgreSQL real que reprocesar el mismo QR pagado no duplica `payments` y
  mantiene `qr_payments.pago_id`.
- `test/e2e/12-qr-status-provider-flow.e2e-spec.ts` valida contra PostgreSQL
  real y proveedor MC4 simulado que `verificarEstadoQr` ejecuta el flujo
  completo `PENDIENTE -> PAGADO -> payment creado` sin duplicar en reintentos.
- El mismo e2e valida conciliación negativa: QR `PENDIENTE`, código no exitoso
  del proveedor y error de transporte no crean `payments` ni asignan `pago_id`.

Tareas:

- Evaluar si conviene extraer `qr-payment-status.service` solo si crece la
  lógica de conciliación/estados; por ahora la orquestación queda pequeña.
- Eliminar `any` donde define contratos de negocio.
- Revisar contrato frontend/backend para `tenant-qr-payment.service.ts`.
- Mantener tests de conciliación negativa si se agregan nuevos estados o nuevos
  proveedores QR.

Criterios de aceptación:

- Webhooks y QR son idempotentes.
- Estados inválidos no pueden persistirse.
- Errores de proveedor externo quedan normalizados.
- QR no depende de `search_path` manual.

### Fase 4: Applications Y Contracts

Objetivo: reducir tamaño, duplicación y riesgo de cambios de negocio.

Tareas Applications:

- Extraer aprobación/rechazo a servicio dedicado. Avance: aprobación y
  creación de contrato quedó en `ApplicationApprovalService`; el flujo ahora
  bloquea la solicitud con `FOR UPDATE`, actualiza la solicitud y crea el
  contrato con el mismo `QueryRunner`.
- Extraer creación de solicitud. Avance: validación de solicitante, validación
  de propiedad, verificación de blacklist, insert y notificación a admins viven
  en `ApplicationCreationService`.
- Separar screening, contrato generado y consultas. Avance: consultas viven en
  `ApplicationQueriesService`, cambios de estado en `ApplicationStatusService`,
  aprobación/contrato generado en `ApplicationApprovalService` y checklist con
  decisiones finales de screening en `ApplicationScreeningService`.
- Separar documentos y fee de screening. Avance: documentos viven en
  `ApplicationDocumentsService` y el registro del fee vive en
  `ApplicationScreeningFeeService`.
- Tipar `contractData` y eliminar `any`. Avance: `ApplicationApprovalService`
  arma un `CreateContractDto` tipado y no usa `any`.
- Mantener acceso tenant con schema calificado. Avance: `findAll`, `findOne`,
  `findByApplicant`, create, status, documentos, screening y fee ya usan schema
  calificado.
- Avance: `ApplicationQueriesService` concentra `findAll`, `findOne` y
  `findByApplicant`; `ApplicationStatusService` concentra cambios de estado y
  notificación al solicitante.
- Avance: `ContractsService.create` quedó como fachada y la creación completa
  vive en `ContractCreationService`, incluyendo validaciones, secuencia,
  escritura transaccional, historial y side effects post-commit.
- Siguiente corte recomendado: reducir `ContractCreationService` si crece más,
  separando validaciones y notificaciones de creación.

Tareas Contracts:

- Mantener generación por secuencia. Avance: quedó aislada en
  `ContractNumberService`.
- Separar métricas, renovaciones, firma, historial y audit logs. Avance:
  lecturas/métricas/historial de contratos quedaron en `ContractQueriesService`
  y escritura de `contract_history` quedó en `ContractHistoryService`;
  renovación quedó en `ContractRenewalService` y firma/activación quedó en
  `ContractSigningService`.
- Revisar duplicación de consultas `findOne` / `findAll`. Avance: consultas
  principales usan una sola implementación en `ContractQueriesService`.
- Hacer `create`, `update`, `signContract` y `renew` transaccionales cuando
  escriben contrato + propiedad + historial. Avance: `create`, `update`,
  `signContract` y `renew` usan `QueryRunner`; `update`, `signContract` y
  `renew` bloquean el contrato con `FOR UPDATE`; las escrituras de contrato,
  propiedad e historial quedan en una sola transacción y audit/notificaciones
  se ejecutan después del commit.
- Avance: `ContractsService.create` acepta un `QueryRunner` externo para
  participar en transacciones coordinadas, y puede diferir audit/notificaciones
  hasta que el orquestador confirme el commit.
- Avance: la implementación de creación vive en `ContractCreationService`;
  `ContractsService` conserva la API pública usada por controllers y otros
  módulos.
- Añadir tests para concurrencia de número de contrato con secuencia.
- Avance: `findAll`, `findOne`, `getMetrics`, `getContractHistory` y
  `generatePdf`, create, update, sign y renew usan schema calificado.

Criterios de aceptación:

- Servicios principales quedan como orquestadores.
- Reglas de negocio viven en métodos pequeños y testeables.
- Métricas usan queries agregadas y tipadas.

### Fase 5: Maintenance, Reports Y Limpieza De Tipos

Objetivo: bajar deuda transversal que impide lint global.

Tareas:

- Reemplazar `console.*` por `Logger`. Avance: completado en `maintenance`.
- Tipar filtros, filas SQL y payloads. Avance: filtros y filas principales de
  `maintenance` ya tipados.
- Eliminar `any` innecesario. Avance: `maintenance.service.ts` y
  `maintenance.controller.ts` quedaron sin `any` explícito.
- Avance adicional: controllers/common críticos quedaron tipados con
  `TenantRequest` o interfaces locales: blacklist, users, notifications,
  health, storage, catálogo público, multer y `OptionalAuthGuard`.
- Avance adicional: specs antiguos de inspections, owner statements y
  permissions guard quedaron sin `any` explícito.
- Separar notificaciones, consultas, mensajes, archivos, proveedores y etapas
  en maintenance. Avance: consultas separadas en `MaintenanceLookupService`,
  mensajes/adjuntos en `MaintenanceMessagesService` y estadísticas en
  `MaintenanceStatsService`; proveedores separados en
  `MaintenanceVendorsService`; pipeline de etapas y autorización separado en
  `MaintenanceStageService`.
- Atomicidad en maintenance. Avance: creación de solicitud + adjuntos y
  creación de mensajes + adjuntos usan transacciones tenant-aware con side
  effects después del commit.
- `MaintenanceMessagesService` normaliza respuestas de TypeORM (`rows` y
  `[rows, count]`) al enlazar adjuntos; esto evita duplicar adjuntos existentes
  y evita omitir adjuntos nuevos cuando `UPDATE ... RETURNING` no encuentra
  filas.
- `test/e2e/13-maintenance-messages-attachments.e2e-spec.ts` valida con
  PostgreSQL real creación de solicitud con adjunto inicial, mensaje admin que
  enlaza/agrega adjuntos y notificación al tenant.
- Update de maintenance separado en `MaintenanceUpdateService`, con allowlist
  de columnas y notificaciones aisladas.
- Tipar exports de reports y respuestas de Excel/PDF. Avance: `ReportData`,
  filas por reporte, KPIs y exportador Excel/PDF quedaron tipados y cubiertos
  con unit tests.
- Alinear SQL de reports con el schema actual. Avance: `ReportsService` usa
  `properties.title`, columnas reales de `units`, estados reales de contratos,
  pagos y maintenance, y filtros parametrizados.
- Validar reports contra PostgreSQL real. Avance: e2e con tenant poblado cubre
  rent roll, vacancies, delinquency, PnL, KPIs y exportación Excel/PDF.

Criterios de aceptación:

- `maintenance.service.ts` queda dividido en servicios cohesivos.
- No hay logs con datos sensibles.
- `reports` tiene DTOs/tipos para cada reporte.
- Las consultas de reports se validan contra PostgreSQL real con un schema
  tenant poblado antes de tocar frontend. Cumplido con `15-reports-populated-tenant`.
- `npm run lint:check` empieza a bajar a cero por módulos.

### Fase 6: Seguridad De Producción

Objetivo: cerrar controles mínimos de producción.

Tareas:

- Implementar bloqueo de cuenta por intentos fallidos. Avance: `AuthSecurityService`
  usa estado global en `public.auth_login_attempts`, claveado por
  `email + tenant_slug + login_context`, con ventana temporal y desbloqueo
  automático por `locked_until`.
- Registrar eventos de seguridad:
  - login fallido. Avance: `LOGIN_FAILURE`.
  - lockout. Avance: `LOGIN_LOCKED`.
  - login exitoso. Avance: `LOGIN_SUCCESS`.
  - intento de usuario inactivo. Avance: `INACTIVE_USER_LOGIN`.
  - token inválido por tenant mismatch. Avance: `TENANT_MISMATCH` desde
    `TenantContextMiddleware`.
  - cambios de rol/permisos. Avance: `PERMISSIONS_CHANGED` para creación,
    actualización de permisos y desactivación de empleados.
- Revisar CORS por ambiente.
- Revisar secrets obligatorios en producción.
- Evitar stack traces detallados en respuestas HTTP.
- Definir política de retención de audit logs y webhook events.

Criterios de aceptación:

- Fuerza bruta queda controlada por IP y por cuenta.
- Eventos críticos tienen audit log.
- Producción no arranca con `JWT_SECRET` débil.

### Fase 7: Tests De Integración Y CI

Objetivo: comprobar lo que los unit tests no pueden comprobar.

Suites mínimas:

- Tenant isolation:
  - crear tenant A y B.
  - insertar datos en A.
  - verificar que B no los ve.
  - Avance: `08-tenant-isolation.e2e-spec.ts` crea dos tenants, inserta una
    propiedad en A, verifica aislamiento de listado en B y bloqueo de token A
    contra URL de B.
- Provisioning:
  - tenant nuevo contiene todas las tablas esperadas.
  - startup upgrades son idempotentes.
  - Avance: `07-provisioning-idempotency.e2e-spec.ts` valida tablas públicas,
    tablas críticas del tenant y doble ejecución de `runStartupUpgrades()`.
- Auth:
  - JWT de tenant A no sirve en tenant B.
  - admin login usa `public.admin_index`.
  - Avance: `06-auth-security.e2e-spec.ts` valida lockout por cuenta contra
    PostgreSQL real y audita `TENANT_MISMATCH`.
- Payments:
  - webhook duplicado no duplica efectos.
  - Avance: `10-payment-webhook-idempotency.e2e-spec.ts` valida idempotencia
    real de webhook sobre `webhook_events` y `payments`.
  - split payment rollback ante error.
- Properties:
  - create/update rollback con direcciones/owners.
  - Avance: `09-properties-transaction-rollback.e2e-spec.ts` valida rollback
    real de create cuando falla owner existente y de update cuando falla el
    reemplazo de direcciones.
- Maintenance:
  - Avance: `04-maintenance-pipeline.e2e-spec.ts` valida pipeline de etapas.
  - Avance: `13-maintenance-messages-attachments.e2e-spec.ts` valida mensajes,
    adjuntos y notificación con PostgreSQL real.
- QR:
  - generación, persistencia, estado y error de proveedor.
  - Avance: `11-qr-payment-processing-idempotency.e2e-spec.ts` valida que el
    procesamiento de QR pagado sea idempotente y use enums estándar.
  - Avance: `12-qr-status-provider-flow.e2e-spec.ts` valida el flujo completo
    de `verificarEstadoQr` con proveedor simulado y reintento idempotente.

Criterios de aceptación:

- `npm run test:e2e` corre contra PostgreSQL de prueba.
- CI ejecuta build, lint, unit tests e integración.
- Se puede reproducir localmente con Docker Compose.

### Fase 8: Documentación Viva

Objetivo: que docs y código no se contradigan.

Tareas:

- Completar decoradores Swagger en controllers y DTOs.
- Revisar `/docs` con endpoints reales.
- Documentar errores estándar.
- Mantener `BACKEND_ARCHITECTURE_STATUS.md` actualizado.
- Mantener este roadmap hasta que quede cerrado.

Criterios de aceptación:

- Frontend puede consumir `/docs` como contrato confiable.
- Los README no contradicen provisioning/migraciones reales.

## Orden Recomendado De Trabajo

1. Properties update transaccional y división restante.
2. Payments y QR refactor estructural.
3. Applications y Contracts refactor estructural.
4. Maintenance y Reports.
5. Tests de integración con PostgreSQL.
6. Lint global hasta cero.
7. Swagger completo y revisión frontend/backend.

## Checklist De Cierre

Usar este checklist antes de considerar terminado el backend:

- [ ] `npm run build` pasa.
- [ ] `npm run lint:check` pasa.
- [ ] `npm test` pasa.
- [ ] `npm run test:e2e` pasa con PostgreSQL real.
- [ ] `git diff --check` pasa.
- [ ] No hay `console.log/error` en servicios productivos.
- [ ] No hay `any` en contratos de negocio críticos.
- [ ] No hay `SET search_path` manual no justificado.
- [ ] Todos los endpoints críticos están en Swagger.
- [ ] Tenants nuevos nacen completos.
- [ ] Startup upgrades son idempotentes.
- [x] Auth tiene lockout por cuenta.
- [x] Webhooks y QR son idempotentes. Avance: webhooks externos,
      procesamiento/consulta QR pagada, estados QR no pagados y errores de
      proveedor ya tienen e2e.
- [ ] Properties create/update son transaccionales. Avance: `create`,
      `update`, lookup, catálogo, details, stats, notificaciones y reglas de
      owners listos; falta revisar división interna de search/owners si crecen.
- [ ] Frontend probado contra auth, QR, payments y tenant context.

## Comandos Para Medir Avance

```bash
rg -n "SET search_path" src
rg -n "console\\.|TODO|FIXME|any\\)|: any|@ts-ignore|eslint-disable" src
wc -l src/properties/properties.service.ts src/payments/payments.service.ts src/contracts/contracts.service.ts src/applications/applications.service.ts src/payments/qr/qr-payment.service.ts
npm run build
npm run lint:check
npm test
npm run test:e2e
git diff --check
```

## Regla Final

No se busca "cero líneas largas" ni refactor por estética. El objetivo es que
cada módulo tenga límites claros, operaciones críticas sean atómicas, el
aislamiento tenant sea demostrable y los errores futuros sean difíciles de
introducir sin que fallen tests o lint.
