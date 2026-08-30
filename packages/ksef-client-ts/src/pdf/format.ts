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

/** `"007"` → `"7"`, `"000"` → `"0"`. */
function trimLeadingZeros(digits: string): string {
  return digits.replace(/^0+(?=\d)/, '');
}

/**
 * The shape KSeF's decimal types take, same as {@link sumDecimal} reads.
 *
 * The number formatters work on this parse rather than on `Number`, because
 * TKwotowy allows 18 digits — more than a double holds — so a round trip
 * through binary floating point silently rewrites the value before it is ever
 * printed: `9999999999999999.99` came out as `10 000 000 000 000 000,00`. That
 * also threw away what the decimal-safe totals summation had just preserved.
 */
const DECIMAL = /^([+-]?)(\d+)(?:\.(\d+))?$/;

function parseDecimal(raw: string): { negative: boolean; int: string; frac: string } | null {
  const m = DECIMAL.exec(raw.trim());
  if (!m) return null;
  return { negative: m[1] === '-', int: m[2] ?? '0', frac: m[3] ?? '' };
}

/**
 * The digits of `int.frac` restated with exactly `scale` fraction digits,
 * rounding half away from zero. A value already within scale is only padded, so
 * nothing that fits the schema is ever touched.
 */
function rescale(int: string, frac: string, scale: number): string {
  if (frac.length <= scale) return int + frac.padEnd(scale, '0');
  const kept = int + frac.slice(0, scale);
  return frac.charCodeAt(scale) - 48 >= 5 ? (BigInt(kept) + 1n).toString() : kept;
}

/** `"1234.5"` → `"1 234,50"` (Polish monetary style, 2 decimals). */
export function formatMoney(raw: string): string {
  const parsed = parseDecimal(raw);
  if (parsed === null) return raw;
  const digits = rescale(parsed.int, parsed.frac, 2).padStart(3, '0');
  const intPart = trimLeadingZeros(digits.slice(0, digits.length - 2));
  const frac = digits.slice(digits.length - 2);
  // Nobody writes -0,00 on an invoice; a value that rounds to nothing is zero.
  const sign = parsed.negative && /[1-9]/.test(digits) ? '-' : '';
  return `${sign}${groupThousands(intPart)},${frac}`;
}

/** `"1234.5"` → `"1 234,5"` (grouped, no forced decimals). */
export function formatNumber(raw: string): string {
  const parsed = parseDecimal(raw);
  if (parsed === null) return raw;
  const frac = parsed.frac.replace(/0+$/, '');
  const intPart = trimLeadingZeros(parsed.int);
  const sign = parsed.negative && /[1-9]/.test(intPart + frac) ? '-' : '';
  const grouped = groupThousands(intPart);
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

/**
 * Decimal-safe sum of monetary strings, used by totals rows that aggregate
 * several VAT buckets (a KSeF invoice has no single "total net" field).
 *
 * Values are summed in minor units so 0.1 + 0.2 stays 0.30, and the result keeps
 * the widest scale seen among the inputs. Blank/whitespace entries are treated
 * as an absent bucket and skipped; if nothing parseable remains the result is
 * `''`, so a document that carries no totals at all renders blank rather than a
 * fabricated `0,00`. A non-empty value that is not a decimal makes the whole sum
 * unrepresentable and also yields `''` — a blank cell is safer than a wrong one.
 */
export function sumDecimal(values: string[]): string {
  const present = values.filter((v) => v.trim() !== '');
  if (present.length === 0) return '';

  const parsed: Array<{ sign: bigint; int: string; frac: string }> = [];
  for (const value of present) {
    const m = /^([+-]?)(\d+)(?:\.(\d+))?$/.exec(value.trim());
    if (!m) return '';
    parsed.push({ sign: m[1] === '-' ? -1n : 1n, int: m[2] ?? '0', frac: m[3] ?? '' });
  }

  const scale = parsed.reduce((max, p) => Math.max(max, p.frac.length), 0);
  const total = parsed.reduce(
    (acc, p) => acc + p.sign * BigInt(p.int + p.frac.padEnd(scale, '0')),
    0n,
  );

  const sign = total < 0n ? '-' : '';
  const digits = (total < 0n ? -total : total).toString().padStart(scale + 1, '0');
  const intPart = digits.slice(0, digits.length - scale);
  const fracPart = digits.slice(digits.length - scale);
  return scale === 0 ? `${sign}${intPart}` : `${sign}${intPart}.${fracPart}`;
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
