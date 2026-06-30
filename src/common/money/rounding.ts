import Decimal from 'decimal.js';

/**
 * Política de redondeo central del dominio monetario. Se define en UN solo
 * lugar para que cambiarla (por requisito legal/contable de algún país) no
 * implique tocar la lógica de negocio.
 *
 * Decisión actual:
 *   - Cargos al cliente (mora, comisión, prorrateo, descuentos): HALF_UP, que
 *     es la expectativa legal habitual en LatAm/EE.UU. (el medio centavo sube).
 *   - Distribuciones entre partes (splits, liquidaciones): NO se redondea por
 *     parte; se usa `allocate` (reparto de resto) para que la suma cuadre exacta.
 *
 * Si en el futuro se requiere "banker's rounding" (HALF_EVEN) para neutralidad
 * estadística, basta cambiar MONEY_ROUNDING aquí.
 */
export const MONEY_ROUNDING: Decimal.Rounding = Decimal.ROUND_HALF_UP;

/**
 * Clon local de Decimal con precisión amplia para los cálculos intermedios.
 * Las sumas/restas/multiplicaciones son exactas; la precisión solo acota
 * divisiones (porcentajes), que igual se truncan recién al redondear a la
 * escala de la moneda en los puntos definidos.
 */
export const MoneyDecimal = Decimal.clone({
  precision: 40,
  rounding: MONEY_ROUNDING,
  // Evita notación científica al serializar montos grandes/pequeños.
  toExpNeg: -9e15,
  toExpPos: 9e15,
});

export type MoneyDecimalInstance = InstanceType<typeof MoneyDecimal>;
