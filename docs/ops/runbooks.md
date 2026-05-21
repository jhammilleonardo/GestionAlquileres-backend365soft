# Runbooks

## Startup Upgrades

Antes de desplegar cambios de schema:

1. Ejecutar build, lint, unit y e2e.
2. Probar startup contra copia reciente de PostgreSQL.
3. Revisar logs de `TenantProvisioningService` y
   `TenantStartupUpgradeService`.
4. Confirmar DDL idempotente.
5. Tomar backup.
6. Desplegar una instancia.
7. Verificar `/health`, logs y Swagger si aplica.
8. Escalar replicas.

## Incidente De Tenant Isolation

1. Detener flujo afectado si hay fuga de datos.
2. Identificar endpoint y tenant origen/destino.
3. Revisar uso de `QueryRunner`, `search_path` y tablas calificadas.
4. Agregar e2e reproduciendo la fuga.
5. Corregir servicio.
6. Ejecutar suite e2e completa.
7. Revisar logs/audit events.

## Incidente De Pagos/Webhooks

1. Revisar `webhook_events`.
2. Confirmar `reference_number`, provider id y firma/token.
3. Verificar si hubo reintento duplicado.
4. Confirmar estado de `payments`, `qr_payments` y split payments.
5. No modificar manualmente montos sin audit log.
6. Agregar test de idempotencia si no existe.

## Incidente De Storage

1. Identificar driver `local` o `s3`.
2. Revisar si DB fallo despues de subir archivo.
3. Ejecutar compensacion si hay archivo huerfano.
4. Confirmar permisos de URL firmada o controller.
5. Agregar test de rollback/compensacion.

