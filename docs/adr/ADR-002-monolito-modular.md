# ADR-002: Monolito Modular

| Campo | Valor |
| --- | --- |
| Fecha | 2026-04-07 |
| Estado | Aceptado |

## Contexto

El backend tiene dominios conectados: solicitudes crean contratos, contratos
habilitan pagos, pagos alimentan reportes y propietarios, mantenimiento puede
depender de contrato/propiedad. Muchas operaciones necesitan transacciones
locales y consistencia fuerte.

## Decision

Se usa monolito modular con NestJS.

Cada dominio vive en su propio `Module`, controller, DTOs, services y tests.
La separacion se logra por limites de modulo y servicios especializados, no por
procesos separados.

## Consecuencias

Ventajas:

- Transacciones cross-dominio simples.
- Un solo pipeline y deploy.
- Menos infraestructura.
- Refactors de dominio mas baratos.

Costos:

- Se escala la aplicacion completa, no un modulo aislado.
- Requiere disciplina para evitar imports circulares y services gigantes.
- Una caida del proceso afecta todos los modulos.

## Estado Actual

Aceptado. Si un modulo de alto trafico exige escalado independiente en el
futuro, se evaluara extraerlo con un contrato explicito.
