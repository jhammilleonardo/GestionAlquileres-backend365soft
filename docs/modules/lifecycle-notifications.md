# Lifecycle Notifications Module

## Responsabilidad

Enviar notificaciones externas de ciclo de vida por email o WhatsApp mediante
adapters configurables.

## Archivos Clave

- `src/lifecycle-notifications/lifecycle-notifications.module.ts`
- `src/lifecycle-notifications/lifecycle-notifications.service.ts`
- `src/lifecycle-notifications/lifecycle-external-notification.adapter.ts`

## Reglas

- Proveedor configurable por `LIFECYCLE_NOTIFICATION_PROVIDER`.
- `stub` solo para desarrollo o excepcion explicita.
- No inventar destinatario si usuario no tiene email/telefono.
- Errores externos deben registrarse en monitoring sin tumbar flujos criticos.

