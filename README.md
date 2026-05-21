# 365Soft Backend

Backend NestJS multi-tenant para gestion de alquileres, propiedades,
contratos, pagos, mantenimiento, propietarios, reportes y operaciones
administrativas.

La documentacion vigente vive en `docs/`. La raiz queda intencionalmente
limpia para evitar duplicados y documentos viejos.

## Inicio Rapido

```bash
npm install
cp .env.example .env
docker compose up --build
```

Servicios locales principales:

- API: `http://localhost:3000`
- Swagger: `http://localhost:3000/docs`
- Health: `http://localhost:3000/health`
- pgAdmin: `http://localhost:5050`

## Comandos

```bash
npm run build
npm run lint:check
npm test -- --runInBand
npm run test:e2e -- --runInBand
git diff --check
```

## Documentacion

- [Indice general](docs/README.md)
- [Guia de desarrollo](docs/getting-started.md)
- [Arquitectura](docs/architecture.md)
- [Provisioning y upgrades](docs/provisioning.md)
- [Configuracion](docs/configuration.md)
- [Testing y calidad](docs/testing.md)
- [Seguridad](docs/security.md)
- [Produccion](docs/ops/production.md)
- [CI/CD](docs/ops/ci-cd.md)
- [Runbooks](docs/ops/runbooks.md)

## Reglas Base

- El aislamiento multi-tenant se hace por schema PostgreSQL.
- `TenantContextMiddleware` resuelve tenant y valida contexto.
- `TenantConnectionInterceptor` es el responsable de `search_path` por request.
- El proyecto no usa migraciones TypeORM CLI versionadas para tenants.
- Los cambios de schema tenant se hacen con provisioning/startup upgrades
  idempotentes dentro de Nest.
- Las integraciones externas reales deben estar detras de adapters y variables
  de entorno.
