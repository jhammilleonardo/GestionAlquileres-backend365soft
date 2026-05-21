# QR Payments Module

## Responsabilidad

Generar, verificar, cancelar y procesar pagos QR MC4/SIP.

## Archivos Clave

- `src/payments/qr/qr-payment.module.ts`
- `src/payments/qr/qr-payment.controller.ts`
- `src/payments/qr/qr-payment.service.ts`
- `src/payments/qr/qr-provider.service.ts`
- `src/payments/qr/qr-payment-persistence.service.ts`
- `src/payments/qr/qr-payment-processing.service.ts`
- `src/payments/qr/dto/`

## Endpoints

- `POST /:slug/admin/qr-payments`
- `POST /:slug/admin/qr-payments/verificar`
- `GET /:slug/admin/qr-payments`
- `POST /:slug/admin/qr-payments/:id/cancelar`
- `POST /:slug/tenant/qr-payments`
- `POST /:slug/tenant/qr-payments/verificar`
- `GET /:slug/tenant/qr-payments`
- `POST /:slug/tenant/qr-payments/:id/cancelar`
- `POST /:slug/qr-payments/callback`

## Reglas

- Un QR pagado no puede crear pagos duplicados.
- Callback debe validar secreto/firma.
- Errores de proveedor no deben mutar estado como pagado.
- Procesamiento QR -> payment debe ser idempotente.

