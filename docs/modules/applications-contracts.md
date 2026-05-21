# Applications Y Contracts

## Responsabilidad

Gestionar solicitudes de alquiler, screening, aprobacion, contratos, renovacion,
firma, PDFs e historial.

## Componentes Applications

- `ApplicationsService`: fachada.
- `ApplicationQueriesService`: lecturas.
- `ApplicationCreationService`: creacion y validaciones.
- `ApplicationStatusService`: cambios de estado.
- `ApplicationApprovalService`: aprobacion transaccional.
- `ApplicationApprovalContractFactoryService`: armado de contrato.
- `ApplicationApprovalSideEffectsService`: efectos post-commit.
- `ApplicationScreeningService`: checklist.
- `ApplicationScreeningDecisionService`: decision final.
- `ApplicationDocumentsService`: archivos.
- `ApplicationScreeningFeeService`: fee.

## Componentes Contracts

- `ContractsService`: fachada.
- `ContractCreationService`: orquestacion de creacion.
- `ContractCreationValidationService`: validaciones.
- `ContractCreationSideEffectsService`: audit y notificaciones post-commit.
- `ContractQueriesService`: lecturas y metricas.
- `ContractUpdateService`: updates y cambios de estado.
- `ContractRenewalService`: renovacion.
- `ContractSigningService`: firma.
- `ContractPdfService`: PDF y storage.
- `ContractHistoryService`: historial.
- `ContractNumberService`: numeracion segura.

## Endpoints Principales

- `/:slug/applications`
- `/:slug/applications/:id/approve`
- `/:slug/applications/:id/screening`
- `/:slug/admin/contracts`
- `/:slug/admin/contracts/:id/renew`
- `/:slug/admin/contracts/:id/pdf`
- `/:slug/tenant/contracts/current`
- `/:slug/tenant/contracts/:id/sign`

## Reglas

- Aprobacion de solicitud y creacion de contrato deben compartir transaccion.
- Contratos activos se bloquean con `FOR UPDATE` en cambios criticos.
- Numeracion usa secuencia PostgreSQL.
- Audit logs y notificaciones se ejecutan post-commit.
- PDFs se guardan via `StorageService`, no con singleton ni path directo.

