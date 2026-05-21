# Config Module

## Responsabilidad

Centralizar lectura de variables de entorno y configuracion de runtime.

## Archivos Clave

- `src/common/config/config.module.ts`
- `src/common/config/config.service.ts`
- `.env.example`
- `.env.production.example`

## Reglas

- No leer `process.env` directamente en servicios de dominio si existe
  configuracion compartida.
- Produccion debe validar secretos y flags criticos.
- Cambios de variables deben documentarse en `docs/configuration.md`.

