import { PaymentMethod, PaymentMethodLabels } from './enums';

/**
 * Catálogo de los métodos de pago *configurables* por un tenant.
 *
 * Las claves son los códigos regionales en minúscula que se guardan en
 * `tenant_config.payment_methods` (los mismos que aprovisiona
 * `TenantConfigProvisioningService` y que consume `PaymentProcessorFactory`
 * para elegir el procesador). Este catálogo es la única fuente de verdad de la
 * etiqueta legible que ve el inquilino al construir el formulario de pago.
 *
 * Agregar un método nuevo: añadir su código regional aquí y, si necesita un
 * procesador real, registrarlo en `PaymentProcessorFactory`.
 */
export const REGIONAL_PAYMENT_METHOD_LABELS: Record<string, string> = {
  stripe: 'Tarjeta de crédito/débito',
  ach: 'ACH (transferencia bancaria EE.UU.)',
  paypal: 'PayPal',
  payu: 'Tarjeta (PayU)',
  tarjeta: 'Tarjeta de crédito/débito',
  transferencia: 'Transferencia bancaria',
  qr_accl: 'QR MC4 (Bolivia)',
  qr_mc4: 'QR MC4 (Bolivia)',
  efectivo: 'Efectivo',
  cheque: 'Cheque',
};

/**
 * Resuelve la etiqueta legible de un método de pago configurado. Busca, en orden:
 *   1. el catálogo regional (códigos en minúscula — el caso real de producción),
 *   2. el enum canónico `PaymentMethod` (códigos en mayúscula — datos legados),
 *   3. un fallback humanizado, para no descartar nunca un método que el admin
 *      configuró a propósito (descartarlo en silencio dejaba el formulario vacío).
 */
export function resolvePaymentMethodLabel(code: string): string {
  const trimmed = code.trim();

  const regional = REGIONAL_PAYMENT_METHOD_LABELS[trimmed.toLowerCase()];
  if (regional) {
    return regional;
  }

  const canonical = PaymentMethodLabels[trimmed.toUpperCase() as PaymentMethod];
  if (canonical) {
    return canonical;
  }

  return humanizeMethodCode(trimmed);
}

/** Convierte `un_codigo-raro` en `Un codigo raro` como último recurso. */
function humanizeMethodCode(code: string): string {
  const spaced = code.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
