# Testing Y Calidad

## Capas

- Unit tests: reglas de negocio, validaciones, transiciones y adapters.
- Integration/e2e: flujos con Nest y PostgreSQL real.
- Contract/API checks: Swagger y DTOs de salida.
- Operational checks: build, lint, diff check y health.

## Comandos

```bash
npm run build
npm run lint:check
npm test -- --runInBand
npm run test:e2e -- --runInBand
git diff --check
```

## E2E Criticos

La suite cubre flujos reales como:

- onboarding de tenant;
- solicitud -> contrato;
- aprobacion de pagos;
- mantenimiento;
- notificaciones de vencimiento;
- seguridad auth y lockout;
- provisioning idempotente;
- aislamiento tenant;
- rollback de propiedades;
- idempotencia de webhooks y QR;
- owner portal;
- reportes con tenant poblado;
- aislamiento de mantenimiento.

## Reglas

- Todo bug de aislamiento tenant debe tener e2e.
- Toda transaccion critica debe tener test de rollback.
- Toda idempotencia de webhook/proveedor debe tener test de reintento.
- Todo adapter externo debe poder probarse con doble/fake.
- No se debe bajar la barra de lint para cerrar rapido.

