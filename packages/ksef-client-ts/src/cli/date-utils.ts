const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Normalizes a CLI date argument to full ISO-8601 datetime with timezone.
 * Short dates (YYYY-MM-DD) are expanded; full datetimes are passed through.
 * Throws on invalid date values (e.g. 2024-13-45).
 */
export function normalizeCliDate(date: string, position: 'from' | 'to'): string {
  if (!DATE_ONLY_RE.test(date)) return date;

  if (isNaN(new Date(date).getTime())) {
    throw new Error(`Invalid date: "${date}". Expected a valid YYYY-MM-DD date.`);
  }

  // UTC (+00:00) is used intentionally for KSeF API consistency.
  // Users in CET/CEST should be aware that date-only inputs are normalized to UTC, not local time.
  return position === 'from'
    ? `${date}T00:00:00+00:00`
    : `${date}T23:59:59.999+00:00`;
}
