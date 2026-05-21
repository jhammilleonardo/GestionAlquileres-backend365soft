# Billing Cron Module

## Responsabilidad

Ejecutar tareas programadas relacionadas con facturacion, recordatorios y ciclo
de vida financiero.

## Archivos Clave

- `src/billing-cron/billing-cron.module.ts`
- `src/billing-cron/billing-cron.service.ts`

## Reglas

- Cron debe ser idempotente.
- Errores deben pasar por `ErrorMonitoringService`.
- No asumir un solo tenant: iterar tenants de forma segura.
- Evitar trabajos largos sin logs de progreso.

