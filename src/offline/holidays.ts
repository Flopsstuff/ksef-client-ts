/**
 * Polish statutory public holidays.
 *
 * Polish law (Ordynacja podatkowa, art. 12 §5) excludes both weekends
 * and statutory holidays from business day counts. This module provides
 * the full list of Polish statutory holidays per year (14 since 2025,
 * 13 before), including moveable holidays derived from the Easter date.
 */

const holidayCache = new Map<number, Set<string>>();

/** Format a UTC date as 'YYYY-MM-DD'. */
function toDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Create a UTC date and return its key. */
function dateKey(year: number, month: number, day: number): string {
  return toDateKey(new Date(Date.UTC(year, month - 1, day)));
}

/** Add calendar days to a UTC date. */
function addDays(d: Date, n: number): Date {
  const result = new Date(d);
  result.setUTCDate(result.getUTCDate() + n);
  return result;
}

/**
 * Compute Easter Sunday for a given year using the
 * Anonymous Gregorian algorithm (Meeus/Jones/Butcher).
 * Returns a UTC Date.
 */
export function computeEasterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

/**
 * Get all Polish statutory holidays for a given year.
 * Returns a Set of ISO date strings ('YYYY-MM-DD').
 *
 * Source: Ustawa z dnia 18 stycznia 1951 r. o dniach wolnych od pracy
 * (Dz.U. z 2025 r., poz. 296)
 *
 * Fixed holidays:
 *   Jan 1  — Nowy Rok
 *   Jan 6  — Święto Trzech Króli (Epiphany)
 *   May 1  — Święto Państwowe
 *   May 3  — Święto Narodowe Trzeciego Maja
 *   Aug 15 — Wniebowzięcie NMP
 *   Nov 1  — Wszystkich Świętych
 *   Nov 11 — Narodowe Święto Niepodległości
 *   Dec 24 — Wigilia Bożego Narodzenia (since 2025, Dz.U. 2024 poz. 1965)
 *   Dec 25 — Boże Narodzenie (1st day)
 *   Dec 26 — Boże Narodzenie (2nd day)
 *
 * Moveable holidays (Easter-based):
 *   Easter Sunday    — Wielkanoc
 *   Easter Monday    — Poniedziałek Wielkanocny (Easter + 1)
 *   Pentecost Sunday — Zielone Świątki (Easter + 49, always Sunday)
 *   Corpus Christi   — Boże Ciało (Easter + 60)
 *
 * Count: 14 (year >= 2025), 13 (year <= 2024)
 */
export function getPolishHolidays(year: number): ReadonlySet<string> {
  const cached = holidayCache.get(year);
  if (cached) return cached;

  const easter = computeEasterSunday(year);

  const holidays = new Set<string>([
    // Fixed
    dateKey(year, 1, 1),
    dateKey(year, 1, 6),
    dateKey(year, 5, 1),
    dateKey(year, 5, 3),
    dateKey(year, 8, 15),
    dateKey(year, 11, 1),
    dateKey(year, 11, 11),
    dateKey(year, 12, 25),
    dateKey(year, 12, 26),
    // Wigilia — added by Dz.U. 2024 poz. 1965, effective from 2025
    ...(year >= 2025 ? [dateKey(year, 12, 24)] : []),
    // Moveable
    toDateKey(easter),
    toDateKey(addDays(easter, 1)),
    toDateKey(addDays(easter, 49)),
    toDateKey(addDays(easter, 60)),
  ]);

  holidayCache.set(year, holidays);
  return holidays;
}

/**
 * Check if a UTC date falls on a Polish statutory holiday.
 */
export function isPolishHoliday(date: Date): boolean {
  return getPolishHolidays(date.getUTCFullYear()).has(toDateKey(date));
}
