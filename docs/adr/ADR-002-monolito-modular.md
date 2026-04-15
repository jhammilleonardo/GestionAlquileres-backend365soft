# ADR-002: Monolito modular vs Microservicios

| Campo | Valor |
|-------|-------|
| **Fecha** | 2026-04-07 |
| **Autores** | Equipo 365Soft |
| **Estado** | Aceptado |

---

## Contexto

Al diseñar la arquitectura del backend se evaluó si construirlo como microservicios independientes (un servicio por dominio: propiedades, contratos, pagos, mantenimiento, etc.) o como un monolito modular dentro de un único proceso NestJS.

El sistema gestiona ~20 módulos de negocio con múltiples dependencias cruzadas: aprobar una solicitud de alquiler genera un contrato, que habilita pagos, que actualiza el estado del inquilino, que dispara notificaciones. Estas operaciones deben ser transaccionales.

---

## Decisión

Se eligió **monolito modular con NestJS**.

Cada dominio de negocio es un módulo NestJS independiente (`PropertiesModule`, `ContractsModule`, `PaymentsModule`, etc.) con su propio controller, service y entidades. Los módulos se comunican a través de inyección de dependencias, no por red. La separación de responsabilidades está garantizada por la arquitectura de NestJS, no por límites de proceso.

---

## Consecuencias

### Positivas

- **Transacciones cross-dominio simples:** Operaciones como "aprobar solicitud → crear contrato → generar pago → notificar" se ejecutan en una sola transacción de PostgreSQL, sin sagas ni coordinadores distribuidos.
- **Un solo deploy:** CI/CD simple. Un pipeline construye y despliega un único artefacto.
- **Infraestructura mínima:** Sin API Gateway, service mesh, tracing distribuido ni brokers de mensajes. El equipo se enfoca en el producto.
- **Refactorización barata:** Los límites entre dominios aún evolucionan con el feedback de los clientes. Mover lógica entre módulos en un monolito es trivial comparado con renegociar contratos de API entre microservicios.
- **Migración posible en el futuro:** NestJS permite que un módulo se convierta en un microservicio independiente cuando sea necesario. La separación actual es el paso previo.

### Negativas

- **Deploy completo por cualquier cambio:** Si solo cambia el módulo de pagos, igual se redespliega toda la aplicación.
- **Escalado a nivel de instancia:** No se puede escalar solo el módulo de mantenimiento si recibe más carga. Se debe escalar toda la instancia.
- **Riesgo de acoplamiento creciente:** Sin disciplina, los módulos pueden volverse interdependientes. Se mitiga con revisiones de código que rechazan imports circulares.
- **Punto único de falla:** Si el proceso cae, todos los módulos caen. Se mitiga con múltiples instancias detrás de un load balancer.

---

## Estado

**Aceptado.** Se revisará en Fase 3 si el volumen de tenants o la carga justifican extraer módulos de alto tráfico (pagos, notificaciones) como microservicios independientes.
