# Produccion

## Validacion De Configuracion

En `NODE_ENV=production`, `ProductionReadinessService` valida configuracion
critica antes de aceptar trafico.

Variables importantes:

- `JWT_SECRET` fuerte.
- `DB_PASSWORD` real.
- `FRONTEND_URLS` con HTTPS y dominios finales.
- `STORAGE_DRIVER=s3`, salvo excepcion explicita.
- `MONITORING_PROVIDER=webhook`.
- `LIFECYCLE_NOTIFICATION_PROVIDER` real o excepcion explicita.
- `POSTGRES_BACKUP_ENABLED=true`.
- `LOG_AGGREGATION_ENABLED=true`.
- `SECRET_ROTATION_POLICY_ACK=true`.
- `RATE_LIMIT_POLICY_ACK=true`.
- `PROVISIONING_RUNBOOK_ACK=true`.

## Health

- `GET /health` verifica conectividad con PostgreSQL.
- El orquestador debe usar health checks.
- Alertas externas deben vigilar disponibilidad y errores 5xx.

## Logs

Enviar stdout/stderr del contenedor a un agregador. Alertas minimas:

- backend caido;
- `/health` no responde;
- errores 5xx elevados;
- errores capturados por `ErrorMonitoringService`;
- fallas de crons;
- disco alto si existe storage local temporal.

## Backups

Politica minima:

- backup diario;
- retencion 7 diarios, 4 semanales, 12 mensuales;
- restauracion probada al menos una vez por release mayor;
- cifrado en reposo;
- acceso restringido.

## TLS Y Proxy

TLS debe terminar en proxy/plataforma. Si aplica:

- `TRUST_PROXY=true`
- `TLS_TERMINATED_BY_PROXY=true`

No exponer `/docs` en produccion salvo necesidad controlada.

