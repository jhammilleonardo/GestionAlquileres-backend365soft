import { Money } from './money';

/**
 * Reparte un monto entre varias partes según `ratios`, garantizando que la
 * suma de las partes sea EXACTAMENTE igual al monto original (no se pierde ni
 * se crea un centavo). Es el algoritmo "largest remainder" que usan las libs
 * de dinero serias (dinero.js `allocate`).
 *
 * Cómo funciona:
 *   1. Se trabaja en unidad mínima entera (centavos) para evitar fracciones.
 *   2. Cada parte recibe el piso de su proporción.
 *   3. Los centavos sobrantes (por el redondeo hacia abajo) se reparten de a
 *      uno, empezando por las partes con mayor resto fraccionario.
 *
 * Ejemplo clásico: repartir 100.00 en [1/3, 1/3, 1/3] → 33.34 / 33.33 / 33.33
 * (suma exacta 100.00), en vez de 33.33 × 3 = 99.99 (se perdía 0.01).
 *
 * @param total  Monto a repartir.
 * @param ratios Pesos relativos de cada parte (no necesitan sumar 1 ni 100).
 * @returns      Array de Money del mismo largo que `ratios`, que suma `total`.
 */
export function allocate(total: Money, ratios: number[]): Money[] {
  if (ratios.length === 0) {
    throw new Error('allocate: se requiere al menos un ratio');
  }
  if (ratios.some((r) => r < 0)) {
    throw new Error('allocate: los ratios no pueden ser negativos');
  }

  const totalMinor = total.toMinorUnits();
  const ratioSum = ratios.reduce((a, b) => a + b, 0);

  if (ratioSum <= 0) {
    throw new Error('allocate: la suma de ratios debe ser mayor a cero');
  }

  // Reparto base: piso de cada proporción, en centavos enteros.
  const shares = ratios.map((ratio) =>
    Math.floor((totalMinor * ratio) / ratioSum),
  );
  let distributed = shares.reduce((a, b) => a + b, 0);
  let remainder = totalMinor - distributed;

  // Resto fraccionario de cada parte, para decidir a quién darle los centavos
  // sobrantes primero (mayor resto = más "merece" el centavo extra).
  const remainders = ratios.map((ratio, i) => ({
    index: i,
    frac: (totalMinor * ratio) / ratioSum - shares[i],
  }));
  remainders.sort((a, b) => b.frac - a.frac);

  // Repartir los centavos sobrantes de a uno. (remainder puede ser negativo si
  // el total era negativo: se ajusta restando.)
  const step = remainder >= 0 ? 1 : -1;
  let i = 0;
  while (remainder !== 0) {
    const target = remainders[i % remainders.length].index;
    shares[target] += step;
    remainder -= step;
    i++;
  }

  // Invariante de seguridad: la suma debe cuadrar exacta.
  distributed = shares.reduce((a, b) => a + b, 0);
  if (distributed !== totalMinor) {
    throw new Error(
      `allocate: descuadre interno (${distributed} != ${totalMinor}). No debería ocurrir.`,
    );
  }

  return shares.map((minor) => Money.fromMinorUnits(minor, total.currency));
}
