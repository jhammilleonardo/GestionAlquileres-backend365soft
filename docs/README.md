# Documentacion Backend

Esta carpeta es la fuente vigente de documentacion del backend. Cada documento
tiene un proposito concreto para evitar READMEs enormes y contradictorios.

## Base Tecnica

- [Guia de desarrollo](getting-started.md)
- [Arquitectura](architecture.md)
- [Provisioning y upgrades](provisioning.md)
- [Configuracion](configuration.md)
- [Testing y calidad](testing.md)
- [Seguridad](security.md)

## ADRs

- [ADR-001 Schema por tenant](adr/ADR-001-schema-per-tenant.md)
- [ADR-002 Monolito modular](adr/ADR-002-monolito-modular.md)
- [ADR-003 Stack NestJS](adr/ADR-003-nestjs-stack.md)
- [ADR-004 Multer local y S3](adr/ADR-004-multer-local-s3.md)

## Modulos

- [Indice por modulo](modules/README.md)
- [Tenants, auth y usuarios](modules/tenants-auth-users.md)
- [Properties, catalogo, unidades y reservas](modules/properties-catalog-units-reservations.md)
- [Applications y contracts](modules/applications-contracts.md)
- [Payments, QR, webhooks y split payments](modules/payments-qr.md)
- [Maintenance, inspections y vendors](modules/maintenance-inspections-vendors.md)
- [Owners, owner portal, statements y reports](modules/owners-statements-reports.md)
- [Expenses, blacklist, notifications, tenant config, website y audit logs](modules/operations-admin.md)

## Operacion

- [Produccion](ops/production.md)
- [CI/CD](ops/ci-cd.md)
- [Runbooks](ops/runbooks.md)

## Politica

Si se crea o modifica un modulo, se actualiza el documento del modulo
correspondiente. Si el cambio afecta arquitectura, configuracion, seguridad,
testing u operacion, se actualiza el documento transversal correspondiente.
