/**
 * Resolución de precios por temporada — función pura. Dado el rango de la
 * estadía y las temporadas de la unidad (rangos de fechas con override de
 * precio/noches mínimas), calcula el precio de CADA noche y las noches mínimas
 * efectivas. Sin BD ni efectos: testeable en aislamiento. Las temporadas no se
 * solapan (lo garantiza el servicio), así que cada noche resuelve a una sola.
 */

export interface SeasonRule {
  /** YYYY-MM-DD inclusivo. */
  start_date: string;
  /** YYYY-MM-DD inclusivo. */
  end_date: string;
  price_per_night: number | null;
  min_nights: number | null;
}

export interface StayPricing {
  nightlyDates: string[];
  /** Precio de cada noche de la estadía (en orden). */
  nightlyPrices: number[];
  /** Noches mínimas efectivas (las de la temporada del check-in, o la base). */
  effectiveMinNights: number;
}

/** Suma 'days' días a una fecha YYYY-MM-DD y devuelve YYYY-MM-DD (UTC). */
function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Temporada que cubre una fecha (comparación lexicográfica de YYYY-MM-DD). */
function seasonForDate(date: string, seasons: SeasonRule[]): SeasonRule | null {
  return (
    seasons.find(
      (season) => date >= season.start_date && date <= season.end_date,
    ) ?? null
  );
}

export function resolveStayPricing(
  checkinDate: string,
  nights: number,
  basePricePerNight: number,
  baseMinNights: number,
  seasons: SeasonRule[],
): StayPricing {
  const nightlyPrices: number[] = [];
  const nightlyDates: string[] = [];
  for (let i = 0; i < nights; i++) {
    const nightDate = addDays(checkinDate, i);
    nightlyDates.push(nightDate);
    const season = seasonForDate(nightDate, seasons);
    nightlyPrices.push(season?.price_per_night ?? basePricePerNight);
  }

  // Las noches mínimas las dicta la temporada en la que cae el check-in.
  const checkinSeason = seasonForDate(checkinDate, seasons);
  const effectiveMinNights = checkinSeason?.min_nights ?? baseMinNights;

  return { nightlyDates, nightlyPrices, effectiveMinNights };
}
