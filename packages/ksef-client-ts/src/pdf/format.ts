/**
 * Value formatters referenced by DSL bindings (`format: 'money' | 'date' |
 * 'number' | 'nip' | 'paymentForm'`). Each is total: on unparseable input it
 * returns the raw string unchanged, so a formatter never throws mid-render.
 */
export type FormatterName = 'money' | 'date' | 'number' | 'nip' | 'paymentForm';

const NBSP = ' ';

function groupThousands(intPart: string): string {
  return intPart.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
}

/** `"1234.5"` → `"1 234,50"` (Polish monetary style, 2 decimals). */
export function formatMoney(raw: string): string {
  const n = Number(raw);
  if (raw.trim() === '' || Number.isNaN(n)) return raw;
  const fixed = Math.abs(n).toFixed(2);
  const dot = fixed.indexOf('.');
  const intPart = fixed.slice(0, dot);
  const frac = fixed.slice(dot + 1);
  const sign = n < 0 ? '-' : '';
  return `${sign}${groupThousands(intPart)},${frac}`;
}

/** `"1234.5"` → `"1 234,5"` (grouped, no forced decimals). */
export function formatNumber(raw: string): string {
  const n = Number(raw);
  if (raw.trim() === '' || Number.isNaN(n)) return raw;
  const [intPart, frac] = Math.abs(n).toString().split('.');
  const sign = n < 0 ? '-' : '';
  const grouped = groupThousands(intPart ?? '0');
  return frac ? `${sign}${grouped},${frac}` : `${sign}${grouped}`;
}

/** ISO `"2025-01-15"` (or a datetime) → `"15.01.2025"`; other inputs pass through. */
export function formatDate(raw: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw.trim());
  if (!m) return raw;
  return `${m[3]}.${m[2]}.${m[1]}`;
}

/** `"5213003700"` → `"521-300-37-00"`; non-10-digit inputs pass through. */
export function formatNip(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length !== 10) return raw;
  return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6, 8)}-${digits.slice(8, 10)}`;
}

/**
 * KSeF `FormaPlatnosci` enum code → Polish label (the codes are a Polish fiscal
 * enum, so the decoded name is Polish regardless of the render locale, matching
 * how the official visualizations print it). An unknown code passes through.
 */
const PAYMENT_FORMS: Record<string, string> = {
  '1': 'Gotówka',
  '2': 'Karta',
  '3': 'Bon',
  '4': 'Czek',
  '5': 'Kredyt',
  '6': 'Przelew',
  '7': 'Mobilna',
};
export function formatPaymentForm(raw: string): string {
  return PAYMENT_FORMS[raw.trim()] ?? raw;
}

const FORMATTERS: Record<FormatterName, (raw: string) => string> = {
  money: formatMoney,
  date: formatDate,
  number: formatNumber,
  nip: formatNip,
  paymentForm: formatPaymentForm,
};

/** Apply a named formatter; an unknown name returns the value unchanged. */
export function applyFormat(value: string, format: FormatterName | undefined): string {
  if (!format) return value;
  const fn = FORMATTERS[format];
  return fn ? fn(value) : value;
}
