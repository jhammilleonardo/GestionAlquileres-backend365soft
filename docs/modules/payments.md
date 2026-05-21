# Payments Module

## Responsabilidad

Gestionar pagos manuales, pagos de inquilino, aprobacion, rechazo,
devoluciones, reportes, webhooks y metodos disponibles.

## Archivos Clave

- `src/payments/payments.module.ts`
- `src/payments/payments.controller.ts`
- `src/payments/payments.service.ts`
- `src/payments/payment-*.service.ts`
- `src/payments/webhooks/`
- `src/payments/processors/`
- `src/payments/dto/`

## Endpoints

- `/:slug/admin/payments`
- `/:slug/admin/payments/:id`
- `/:slug/admin/payments/:id/approve`
- `/:slug/admin/payments/:id/reject`
- `/:slug/admin/payments/:id/refund`
- `/:slug/admin/payments/export`
- `/:slug/tenant/payments`
- `/:slug/tenant/payments/methods`
- `/:slug/publico/webhooks/stripe`
- `/:slug/publico/webhooks/paypal`
- `/:slug/publico/webhooks/payu`

## Reglas

- Transiciones de estado validadas.
- Aprobacion y split payment en la misma transaccion.
- Webhooks idempotentes.
- Providers externos detras de processors.
- No guardar secretos ni datos PCI sensibles.

