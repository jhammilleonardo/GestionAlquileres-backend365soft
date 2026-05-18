# Backend Architecture Status

Actualizado: 2026-05-18

Este documento resume el estado tecnico real despues del refactor de seguridad,
multi-tenancy y provisioning. Su objetivo es evitar que el backend vuelva a
mezclar estrategias incompatibles de schema, migraciones y acceso a datos.

Plan de cierre detallado: `README_BACKEND_100.md`.

## Decisiones Vigentes

### Multi-tenancy

El backend usa aislamiento por schema PostgreSQL:

```text
Request -> TenantContextMiddleware -> TenantConnectionInterceptor -> Handler
```

Reglas actuales:

- `TenantContextMiddleware` solo resuelve `req.tenant` y valida que el JWT
  pertenezca al tenant solicitado.
- `TenantContextMiddleware` no debe ejecutar `SET search_path`.
- `TenantConnectionInterceptor` es el unico responsable de configurar
  `search_path` por request.
- El interceptor usa un `QueryRunner` dedicado para todas las requests, incluso
  rutas sin tenant, y deja `search_path=public` en ese caso.
- Las queries cross-tenant o de provisioning deben usar nombres de schema
  calificados con `quoteIdent(schemaName)`.
- Si un servicio abre su propio `QueryRunner` para una transaccion fuera del
  runner del interceptor, puede configurar `search_path` en ese runner dedicado,
  pero no debe hacerlo sobre conexiones compartidas del pool.

### Provisioning y "migraciones"

El proyecto no usa migraciones versionadas de TypeORM CLI. La estrategia vigente
es provisioning idempotente dentro de Nest:

- Nuevos tenants se crean con `TenantProvisioningService.provisionNewTenant`.
- Tenants existentes se reparan o actualizan al arranque con
  `TenantProvisioningService.runStartupUpgrades`.
- Los servicios de provisioning deben usar DDL idempotente:
  `CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`,
  `CREATE INDEX IF NOT EXISTS`, `ON CONFLICT`, etc.
- No introducir otro sistema de migraciones sin una decision explicita de
  arquitectura y plan de transicion.

## Estado de Refactor

### Resuelto

- `TenantsService` dejo de ser un God Object y quedo enfocado en metadata y
  ciclo de vida del tenant.
- `TenantProvisioningService` centraliza la orquestacion de provisioning de
  nuevos tenants y upgrades de arranque.
- `TenantPublicSchemaService` crea soporte global como `public.admin_index`.
- `TenantAdminIndexService` mantiene busqueda O(1) de admins por email.
- `TenantContextMiddleware` ya no muta `search_path`.
- `TenantConnectionInterceptor` aisla todas las requests con `QueryRunner`
  dedicado y resetea la conexion antes de devolverla al pool.
- `AuthService` dejo de depender de `SET search_path` para lectura/creacion de
  usuarios, owner login, `getMe`, `registerAdmin` y busqueda global de emails.
- `AuthSecurityService` agrega lockout por cuenta para admin login, tenant login
  y owner login. El estado vive en `public.auth_login_attempts`, claveado por
  `email + tenant_slug + login_context`, y se limpia despues de login exitoso.
- `public.auth_security_events` registra eventos básicos de autenticación:
  `LOGIN_SUCCESS`, `LOGIN_FAILURE`, `LOGIN_LOCKED` e
  `INACTIVE_USER_LOGIN`.
- `TenantContextMiddleware` registra `TENANT_MISMATCH` cuando el slug de la URL
  no coincide con el tenant del JWT o cuando el usuario del token no existe en
  el schema resuelto.
- `EmployeesService` registra `PERMISSIONS_CHANGED` para creación de empleados,
  cambios de permisos y desactivación de acceso, además del audit log tenant.
- `test/e2e/06-auth-security.e2e-spec.ts` valida con PostgreSQL real el
  lockout por cuenta y la auditoría de `TENANT_MISMATCH`.
- `test/e2e/07-provisioning-idempotency.e2e-spec.ts` valida con PostgreSQL real
  que un tenant nuevo nace con tablas públicas/tenant críticas y que
  `runStartupUpgrades()` es idempotente.
- `test/e2e/08-tenant-isolation.e2e-spec.ts` valida con PostgreSQL real que
  datos creados en tenant A no aparecen en tenant B y que un JWT de A no
  autoriza rutas de B.
- `test/e2e/09-properties-transaction-rollback.e2e-spec.ts` valida con
  PostgreSQL real que `PropertyCreationService` y `PropertyUpdateService`
  revierten cambios parciales cuando fallan owners o direcciones.
- `test/e2e/10-payment-webhook-idempotency.e2e-spec.ts` valida con PostgreSQL
  real que `PaymentWebhookService` registra un solo `webhook_events` para un
  reintento del proveedor y actualiza el pago por `reference_number`.
- `test/e2e/11-qr-payment-processing-idempotency.e2e-spec.ts` valida con
  PostgreSQL real que `QrPaymentProcessingService` no duplica `payments` al
  reprocesar el mismo QR pagado y mantiene `qr_payments.pago_id`.
- `test/e2e/12-qr-status-provider-flow.e2e-spec.ts` valida con PostgreSQL real
  y proveedor MC4 simulado que `QrPaymentService.verificarEstadoQr` ejecuta el
  flujo completo `PENDIENTE -> PAGADO -> payment creado` sin duplicar pagos en
  reintentos.
- `test/e2e/12-qr-status-provider-flow.e2e-spec.ts` tambien cubre estados QR
  no pagados y errores del proveedor: respuesta `PENDIENTE`, codigo funcional
  no exitoso y error de transporte no crean payments ni asocian `pago_id`.
- `NotificationsService` permite crear notificaciones con tabla calificada por
  schema mediante `createForUserInSchema`.
- `SplitPaymentService` opera con tablas calificadas por schema y sin
  `SET search_path` manual.
- `ContractNumberService` usa secuencia PostgreSQL para `contract_number`.
- `PaymentsService` valida transiciones de estado e idempotencia de webhooks.
- `PropertyCreationService` concentra creación de propiedades y mantiene
  propiedad, direcciones y owners dentro de una sola transacción.
- `PropertyUpdateService` concentra updates de propiedades, valida
  tipo/subtipo, actualiza direcciones en la misma transacción y emite
  notificaciones después del commit con schema explicito.
- `PropertyNotificationsService` separa notificaciones de cambio de estado del
  CRUD principal de propiedades.
- `PropertyDetailsService` separa detalles e imagenes del CRUD principal y
  opera con tabla calificada por schema; los campos JSON pueden limpiarse con
  `null` y quedan cubiertos por tests.
- `PropertyStatsService` separa metricas y opera con tabla calificada por
  schema.
- `PropertyAddressesService` separa la escritura de direcciones y mantiene las
  operaciones dentro del `QueryRunner` transaccional de create/update.
- `PropertyLookupService` concentra `findOne`, direcciones, owners y formateo
  de detalle con tablas calificadas por schema.
- `PropertyCatalogService` concentra tipos/subtipos con tablas calificadas por
  schema.
- `PropertiesService.remove` usa tablas calificadas por schema y no muta
  `search_path` en conexiones compartidas.
- `PropertySearchService.findAll` evita N+1 con agregacion JSON.
- `PropertySearchService`, `PropertyOwnersService` y `PropertyLeadsService`
  usan tablas calificadas por schema y no mutan `search_path` en conexiones
  compartidas.
- `PropertyPublicCatalogService` concentra catálogo público, detalle público y
  registro de vistas con tablas calificadas por schema.
- `PropertyOwnersService` ahora protege reglas de ownership: asignación manual
  transaccional, un solo owner primario por propiedad, suma máxima de 100% y
  promoción automática de primario alternativo al eliminar el primario actual.
- `ApplicationsService` ya no usa `SET search_path`; lecturas, create,
  cambios de estado, documentos, screening y fee usan tablas calificadas por
  schema. Las notificaciones directas usan `createForUserInSchema`.
- `ApplicationQueriesService` concentra `findAll`, `findOne` y
  `findByApplicant` con tablas calificadas por schema.
- `ApplicationCreationService` concentra validación de solicitante, validación
  de propiedad disponible, verificación de blacklist, creación de solicitud y
  notificación a admins.
- `ApplicationStatusService` concentra cambios de estado y notificación al
  solicitante.
- `ApplicationApprovalService` concentra aprobación de solicitudes, armado de
  `CreateContractDto` y creación de contrato. La aprobación bloquea
  `rental_applications` con `FOR UPDATE` y actualiza solicitud + contrato con
  el mismo `QueryRunner`; si falla cualquier paso, todo hace rollback.
- `ApplicationScreeningService` concentra checklist de screening, decisiones
  finales (`APPROVED`, `REJECTED`, `REQUIRES_COSIGNER`) y notificaciones
  derivadas, dejando `ApplicationsService` como fachada.
- `ApplicationDocumentsService` concentra persistencia de archivos de
  solicitudes y actualización del arreglo `documents`.
- `ApplicationScreeningFeeService` concentra el registro de
  `screening_fee_paid`.
- `ContractQueriesService` concentra `findAll`, `findOne`, `getMetrics` y
  `getContractHistory` con tablas calificadas por schema.
- `ContractsService.generatePdf` usa tablas calificadas por schema.
- `ContractHistoryService` concentra escrituras en `contract_history` con
  schema calificado.
- `ContractRenewalService` concentra renovación de contratos y mantiene la
  secuencia, copia de términos, historial y audit log fuera de la fachada.
- `ContractSigningService` concentra firma/activación, validación de ownership,
  actualización de propiedad, notificaciones y audit log.
- `ContractCreationService`, `ContractsService.update`,
  `ContractRenewalService` y `ContractSigningService` usan `QueryRunner` y
  escriben contrato/propiedad/historial dentro de una sola transacción.
  `update`, `renew` y `signContract` bloquean el contrato con `FOR UPDATE`.
  Audit log y notificaciones quedan después del commit.
- `ContractCreationService.create` puede participar en una transacción externa y
  diferir audit/notificaciones; esto se usa al aprobar solicitudes para evitar
  estados parcialmente aprobados.
- `ContractsService.create` quedó como fachada pública hacia
  `ContractCreationService`, preservando compatibilidad con controllers y otros
  módulos.
- `PaymentQueriesService` concentra reads admin/tenant y export CSV con schema
  calificado; `PaymentsController` pasa `schema_name` explicito desde
  `req.tenant`.
- `PaymentCreationService` concentra `createPayment` y `createPaymentAsAdmin`
  con transacciones propias, schema calificado y notificaciones post-commit.
- `PaymentMethodsService` concentra métodos disponibles por tenant leyendo
  `tenant_config` con schema calificado y filtrando valores contra el enum.
- `PaymentStatusService` concentra cambios de estado de pagos y emite
  notificaciones con schema explicito cuando corresponde.
- `PaymentStatusService.approvePayment` aprueba el pago y ejecuta split payment
  con el mismo `QueryRunner`; si el split falla, la aprobacion se revierte.
- `PaymentRefundsService` concentra reembolsos con schema calificado, bloqueo
  `FOR UPDATE` y validacion de reembolso acumulado.
- `PaymentWebhookService` concentra idempotencia de webhooks externos en
  `webhook_events` y actualiza pagos por `reference_number` con schema
  calificado dentro de una sola transacción; si falla la actualización del pago,
  el evento se revierte para permitir reintento real.
- `ContractsService.create`, `update`, `signContract` y `renew` usan tablas
  calificadas por schema y ya no ejecutan `SET search_path`.
- `PaymentCreationService` y `QrPaymentProcessingService` usan tablas
  calificadas por schema dentro de sus transacciones.
- `QrPaymentProcessingService` concentra el procesamiento automático de QR
  pagado, incluyendo inserción en `payments` y actualización de `qr_payments`.
- `QrProviderService` concentra autenticación, generación y consulta de estado
  MC4/SIP con contratos de respuesta tipados.
- `QrPaymentPersistenceService` concentra DDL idempotente de `qr_payments`,
  queries por id/alias, creación pendiente, actualización de estado,
  cancelación con ownership y mapeo de salida.
- `QrPaymentProcessingService` bloquea `qr_payments` con `FOR UPDATE` antes de
  crear el pago, evitando duplicados cuando dos verificaciones procesan el
  mismo QR.
- `QrPaymentProcessingService` crea pagos QR usando enums estándar
  (`RENT`, `QR_MC4`, `APPROVED`, `mc4_qr`) y no literales incompatibles con el
  contrato del módulo.
- `QRBoliviaProcessor` evita stringificación insegura de metadata y conserva
  el contrato estándar de procesadores de pago.
- No quedan `SET search_path` en servicios de negocio. El uso restante esta en
  `TenantConnectionInterceptor` y en tests/documentacion que verifican la regla.
- `maintenance` ya no usa `console.*` ni `any` explicito en service/controller;
  filtros y filas SQL principales quedaron tipados.
- `MaintenanceCreationService` concentra la creacion de solicitudes; solicitud
  y adjuntos se guardan en una transaccion tenant-aware, y la notificacion corre
  despues del commit.
- `MaintenanceLookupService` concentra lecturas de mantenimiento (`findAll`,
  `findByTenant`, `findOne`, mensajes filtrados) y deja la fachada principal
  mas chica.
- `MaintenanceMessagesService` concentra creacion de mensajes, asociacion de
  adjuntos, subida de archivos y notificacion de mensajes. Crear mensaje y
  vincular/insertar adjuntos es transaccional.
- `MaintenanceMessagesService` normaliza respuestas de TypeORM (`rows` y
  `[rows, count]`) cuando enlaza adjuntos por `UPDATE ... RETURNING`, evitando
  duplicar adjuntos existentes u omitir adjuntos nuevos.
- `test/e2e/13-maintenance-messages-attachments.e2e-spec.ts` valida con
  PostgreSQL real que una solicitud con adjunto inicial puede recibir un mensaje
  admin que enlaza ese adjunto, agrega otro y notifica al tenant.
- `MaintenanceStatsService` concentra estadisticas admin/tenant y usa
  `DataSource.query`, respetando el QueryRunner tenant-aware del request en vez
  de crear un QueryRunner propio sin contexto.
- `MaintenanceVendorsService` concentra asignacion de proveedor/tecnico y
  calificacion de proveedores.
- `MaintenanceStageService` concentra reglas de transicion, historial, fotos de
  etapa, autorizacion de propietario y notificacion de completado.
- `MaintenanceUpdateService` concentra updates permitidos y notificaciones de
  cambio de estado/asignacion/completado.
- `ReportsService` ya no usa columnas obsoletas (`p.name`, `deleted_at`,
  `beds`, `VACANT`) y alinea sus consultas con el schema actual:
  `properties.title`, columnas reales de `units`, estados reales de contratos,
  pagos y maintenance.
- `ReportFilterDto.property_id` ahora es numerico, como las entidades reales.
- `ReportsExportService` y `ReportsController` usan `ReportData`, filas
  tipadas por reporte y `ReportKpis` en lugar de `any` para Excel/PDF/JSON.
- Owner Portal valida ownership en propiedades, liquidaciones y PDF, restringe
  autorización de mantenimiento a propiedades propias en Bolivia y tiene e2e
  dedicado contra PostgreSQL real.
- Reports tiene e2e con tenant poblado para rent roll, vacancies, delinquency,
  PnL, KPIs y exportación Excel/PDF. El provisioning de tenant nuevo garantiza
  `contracts.unit_id` después de crear `units`.
- La superficie HTTP/common crítica redujo `any` explícito: `TenantRequest` y
  `CurrentTenant` quedaron tipados, y blacklist, users, notifications, health,
  storage, catálogo público, multer, metadata de pagos/notificaciones y
  `OptionalAuthGuard` usan tipos concretos o `unknown`.
- Specs antiguos de inspections, owner statements y permissions guard quedaron
  sin `any` explícito, usando enums reales, retornos tipados y mocks de
  `DataSource` tipados.
- `console.error` productivo en employees/properties fue reemplazado por
  `Logger`.

### Pendiente

- Continuar la division estructural de servicios grandes:
  `payments`, `contracts`, `properties` y `applications`.
- En `contracts`, el siguiente bloque recomendado es extraer `create` y
  `update` a servicios dedicados para reducir la fachada, manteniendo la
  transaccionalidad ya aplicada.
- En `payments`, webhooks externos, procesamiento QR, verificación QR pagada,
  estados no pagados y errores de proveedor ya tienen pruebas e2e de
  idempotencia/no mutación indebida.
- En `properties`, el siguiente bloque recomendado es normalizar respuestas del
  catálogo público con DTOs explícitos y vigilar si `PropertyOwnersService`
  debe dividirse si sigue creciendo.
- En `contracts`, el siguiente bloque recomendado es vigilar el tamaño de
  `ContractCreationService`; si crece más, separar validaciones y side effects
  de creación.
- En `maintenance`, ya hay e2e para pipeline de etapas y mensajes/adjuntos.
  Falta cubrir aislamiento tenant específico de maintenance y rollback de
  subida física de archivos si se simula storage.
- Ampliar audit logs de seguridad para otros cambios administrativos fuera de
  empleados, si aparecen nuevos módulos que modifiquen roles o permisos.
- Agregar tests de integracion con PostgreSQL real para errores/estados no
  pagados de otros procesadores, maintenance y casos restantes de idempotencia.
- Completar cobertura Swagger/OpenAPI en controllers y DTOs. Swagger ya esta
  configurado en `/docs`, pero no todos los contratos estan documentados con la
  misma precision.
- Ejecutar limpieza transversal de lint global. Hoy se validan archivos tocados
  y suites focalizadas porque el repo conserva deuda preexistente.

## Comandos de Verificacion Recomendados

Para cambios focalizados:

```bash
npx eslint <archivos-tocados>
npm run build
npm test -- --runInBand <specs-relacionados>
git diff --check
```

Para revisar deuda global:

```bash
npm run lint:check
```

Ese comando puede seguir fallando por deuda historica no relacionada con el
bloque en curso. No usarlo como unica senal para validar un refactor puntual
hasta completar la limpieza transversal.

## Reglas Para Nuevos Cambios

- No agregar `SET search_path` en middleware.
- No usar schemas sin `quoteIdent` en SQL dinamico.
- No crear tablas de tenant desde servicios de negocio; hacerlo desde servicios
  de provisioning idempotente.
- No cambiar `tenant.slug` despues del provisioning sin implementar un rename
  transaccional del schema fisico.
- Preferir queries calificadas por schema para trabajos cross-tenant,
  background jobs, auth global y provisioning.
- Mantener tests cerca del riesgo: middleware/interceptor para aislamiento,
  provisioning para DDL, services para reglas de negocio.
