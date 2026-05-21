# CI/CD

El workflow vigente vive en `.github/workflows/backend-ci-cd.yml`.

## Jobs

### Quality

Ejecuta:

- `npm ci`
- `npm run build`
- `npm run lint:check`
- `npm test -- --runInBand`
- PostgreSQL service para e2e
- `npm run test:e2e -- --runInBand`
- `git diff --check`

### Docker Build

Construye la imagen como smoke test en PRs.

### Publish Image

Publica imagen a GHCR en ramas no PR, usando nombre normalizado en lowercase.

### Deploy Staging

Manual con `workflow_dispatch` y `deploy_staging=true`.

## Secrets Esperados

- `STAGING_HOST`
- `STAGING_USER`
- `STAGING_SSH_KEY`
- `STAGING_PATH`
- Variables de entorno reales del deploy si el servidor no usa gestor propio.

## Politica

- Pull request: build, lint, unit, e2e y Docker smoke.
- Main/deploy branch: publica imagen.
- Deploy automatico solo si se define una politica explicita por entorno.

