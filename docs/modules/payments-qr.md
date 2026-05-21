# Payments, QR, Webhooks Y Split Payments

## Responsabilidad

Registrar pagos, aprobar/rechazar, exportar, procesar providers, manejar QR
MC4/SIP, webhooks e idempotencia.

## Componentes

- `PaymentsService`: fachada.
- `PaymentCreationService`: creacion admin/tenant.
- `PaymentCreationValidationService`: validacion de contrato.
- `PaymentCreationNotificationService`: notificaciones post-commit.
- `PaymentQueriesService`: listados, detalle y export.
- `PaymentStatusService`: transiciones.
- `PaymentApprovalService`: aprobacion y split payment.
- `PaymentStatusNotificationService`: notificaciones de estado.
- `PaymentWebhookService`: webhooks idempotentes.
- `PaymentMethodsService`: metodos habilitados por tenant.
- `PaymentRefundsService`: devoluciones.
- `QrPaymentService`: fachada QR.
- `QrProviderService`: integracion MC4.
- `QrPaymentPersistenceService`: persistencia QR.
- `QrPaymentProcessingService`: procesamiento idempotente QR -> pago.
- `SplitPaymentService`: distribucion a propietarios.

## Endpoints Principales

- `/:slug/admin/payments`
- `/:slug/admin/payments/:id/approve`
- `/:slug/admin/payments/:id/reject`
- `/:slug/admin/payments/:id/refund`
- `/:slug/tenant/payments`
- `/:slug/publico/webhooks/stripe`
- `/:slug/publico/webhooks/paypal`
- `/:slug/publico/webhooks/payu`
- `/:slug/admin/qr-payments`
- `/:slug/tenant/qr-payments`
- `/:slug/qr-payments/callback`

## Reglas

- Webhooks son idempotentes.
- QR pagado no puede crear pagos duplicados.
- Aprobacion y split payment se ejecutan en la misma transaccion.
- Providers externos se activan por env vars.
- Nunca guardar datos sensibles de tarjeta sin cumplir PCI.

