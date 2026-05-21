# Guia De Desarrollo

## Requisitos

- Node.js 22 o superior.
- Docker y Docker Compose.
- PostgreSQL 18 si se ejecuta sin Docker.

## Setup Local Con Docker

```bash
npm install
cp .env.example .env
docker compose up --build
```

El compose levanta PostgreSQL, backend y pgAdmin. En desarrollo
`NODE_ENV=development` habilita Swagger y dev seed.

## Setup Local Sin Docker

1. Crear base de datos PostgreSQL.
2. Configurar `.env` desde `.env.example`.
3. Ejecutar:

```bash
npm run start:dev
```

## Verificacion

```bash
curl http://localhost:3000/health
curl http://localhost:3000/docs
```

## Flujo Recomendado Antes De Cerrar Cambios

```bash
npm run build
npm run lint:check
npm test -- --runInBand
npm run test:e2e -- --runInBand
git diff --check
```

Si se cambia provisioning, pagos, contratos, auth, storage o aislamiento tenant,
ejecutar e2e completo con PostgreSQL real.

