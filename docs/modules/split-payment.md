# Split Payment Module

## Responsabilidad

Distribuir pagos aprobados entre propietarios segun ownership.

## Archivos Clave

- `src/split-payment/split-payment.module.ts`
- `src/split-payment/split-payment.service.ts`

## Reglas

- Ejecutar dentro de la transaccion de aprobacion cuando aplique.
- Respetar porcentajes de ownership.
- No aprobar pago si falla el split requerido.
- Usar schema calificado o `QueryRunner` del flujo llamador.

