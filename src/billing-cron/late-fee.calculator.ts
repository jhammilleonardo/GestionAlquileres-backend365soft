/**
 * Funciones puras para el cálculo de mora y ventanas de tiempo de cron.
 * Separadas del servicio para facilitar tests unitarios sin DI de NestJS.
 */

/** Calcula el monto de mora. Retorna 0 si algún argumento no es positivo. */
export function calculateLateFee(
  principalAmount: number,
  lateFeePercentage: number,
): number {
  if (principalAmount <= 0 || lateFeePercentage <= 0) return 0;
  return Math.round(principalAmount * (lateFeePercentage / 100) * 100) / 100;
}

/**
 * Determina si un pago está vencido considerando los días de gracia.
 * La mora aplica si: hoy > due_date + graceDays
 */
export function isPaymentOverdue(
  dueDate: Date | string,
  graceDays: number,
  today: Date,
): boolean {
  const due = new Date(dueDate);
  due.setDate(due.getDate() + graceDays);
  return today > due;
}

/**
 * Devuelve true si la hora local del tenant está en la ventana de medianoche (00:xx).
 * El cron corre cada hora — si la hora local es 0 (00:00–00:59) se ejecuta la tarea diaria.
 */
export function isMidnightWindowInTz(
  timezone: string,
  now: Date = new Date(),
): boolean {
  const hour = parseInt(
    new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      hour12: false,
    }).format(now),
    10,
  );
  return hour % 24 === 0; // normaliza el "24" que devuelve Intl para medianoche
}

/**
 * Devuelve true si es el primer día del mes en la zona horaria del tenant.
 * Combinado con isMidnightWindowInTz, identifica el inicio de mes exacto.
 */
export function isFirstDayOfMonthInTz(
  timezone: string,
  now: Date = new Date(),
): boolean {
  const day = parseInt(
    new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      day: 'numeric',
    }).format(now),
    10,
  );
  return day === 1;
}

/**
 * Retorna el mes y año del mes anterior en la zona horaria del tenant.
 * Usado para generar liquidaciones del mes recién cerrado.
 */
export function getPreviousMonthYear(
  timezone: string,
  now: Date = new Date(),
): { month: number; year: number } {
  const localStr = now.toLocaleString('en-US', { timeZone: timezone });
  const localDate = new Date(localStr);
  const prev = new Date(localDate.getFullYear(), localDate.getMonth() - 1, 1);
  return { month: prev.getMonth() + 1, year: prev.getFullYear() };
}
