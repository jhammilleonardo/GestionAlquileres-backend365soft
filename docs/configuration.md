# Configuracion

La referencia de variables esta en `.env.example` y `.env.production.example`.
Los secretos reales no deben commitearse.

## Base

- `NODE_ENV`: `development`, `test`, `staging` o `production`.
- `PORT`: puerto HTTP.
- `FRONTEND_URLS`: origins CORS separados por coma.
- `TRUST_PROXY`: activar si TLS termina en proxy o plataforma.
- `SWAGGER_ENABLED`: expone `/docs`.
- `SWAGGER_FAIL_FAST`: hace fallar el arranque si Swagger no puede generarse.
- `TYPEORM_LOGGING`: logs SQL; mantener `false` salvo depuracion puntual.

## Base De Datos

- `DB_HOST`
- `DB_PORT`
- `DB_USERNAME`
- `DB_PASSWORD`
- `DB_DATABASE`

En produccion el password no puede ser de desarrollo y debe vivir en gestor de
secretos.

## Seguridad

- `JWT_SECRET`: minimo recomendado 64 caracteres aleatorios.
- `JWT_EXPIRATION`
- `RATE_LIMIT_POLICY_ACK`
- `SECRET_ROTATION_POLICY_ACK`

## Storage

- `STORAGE_DRIVER=local`: desarrollo.
- `STORAGE_DRIVER=s3`: produccion recomendada.
- `AWS_REGION`
- `AWS_BUCKET_NAME`
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_SIGNED_URL_EXPIRES_SECONDS`

## Pagos

- MC4/SIP Bolivia: `MC4_ENABLED`, URLs, API keys y `MC4_CALLBACK_SECRET`.
- Stripe: `STRIPE_ENABLED`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`.
- PayPal: `PAYPAL_ENABLED`, client credentials, webhook id y base URL.
- PayU: merchant/account/API credentials.

Los providers solo deben activarse cuando sus credenciales reales esten
configuradas.

## Observabilidad Y Notificaciones Externas

- `MONITORING_PROVIDER=logger|webhook`.
- `MONITORING_WEBHOOK_URL`.
- `LIFECYCLE_NOTIFICATION_PROVIDER=stub|sendgrid|twilio|whatsapp_cloud`.
- Credenciales de SendGrid, Twilio o WhatsApp Cloud segun proveedor.

En produccion no usar `stub` salvo excepcion explicita.

