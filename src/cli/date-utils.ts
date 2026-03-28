const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Normalizes a CLI date argument to full ISO-8601 datetime with timezone.
 * Short dates (YYYY-MM-DD) are expanded; full datetimes are passed through.
 */
export function normalizeCliDate(date: string, position: 'from' | 'to'): string {
  if (!DATE_ONLY_RE.test(date)) return date;
  return position === 'from'
    ? `${date}T00:00:00+00:00`
    : `${date}T23:59:59+00:00`;
}
