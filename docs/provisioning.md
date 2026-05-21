# Provisioning Y Startup Upgrades

## Decision Vigente

El proyecto no usa migraciones TypeORM CLI versionadas para tenants. La
estrategia vigente es provisioning idempotente dentro de Nest.

Esto encaja con el modelo actual porque cada tenant tiene su propio schema y el
sistema debe poder:

- crear un tenant nuevo con todas sus tablas base;
- reparar tenants existentes al arrancar;
- aplicar columnas, indices y seeds de forma idempotente;
- evitar un sistema paralelo de migraciones que pueda desincronizar schemas.

## Flujo

- `TenantProvisioningService.provisionNewTenant`: crea schema y tablas para un
  tenant nuevo.
- `TenantProvisioningService.runStartupUpgrades`: ejecuta upgrades idempotentes
  sobre tenants existentes.
- `TenantStartupUpgradeService`: orquesta upgrades al iniciar.
- Servicios `tenant-*-provisioning.service.ts`: encapsulan DDL por dominio.
- `TenantPublicSchemaService`: prepara soporte en `public`.
- `TenantAdminIndexService`: mantiene indice publico de admins por email.

## Reglas De DDL

- Usar `CREATE TABLE IF NOT EXISTS`.
- Usar `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`.
- Usar `CREATE INDEX IF NOT EXISTS`.
- Usar `ON CONFLICT` para seeds.
- Usar `quoteIdent` para schemas, tablas o columnas dinamicas.
- No usar interpolacion directa de input externo.
- Evitar transacciones largas con DDL masivo.

## Cuando Considerar Migraciones Versionadas

Solo conviene migrar a un sistema versionado si el proyecto necesita historiales
formales por release, rollback controlado de DDL o auditoria estricta de schema.
Ese cambio debe ser explicito y con plan de transicion; no se debe mezclar
silenciosamente con los startup upgrades actuales.

