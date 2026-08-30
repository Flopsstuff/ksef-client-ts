import { get, list } from '../../accessor.js';
import { applyFormat, sumDecimal } from '../../format.js';
import type { FieldDef, RepeatedSum } from '../dsl.js';

/**
 * Read one labelled field into its printable value: the binding, formatted, and
 * — when the field names a `suffixPath` — a second binding appended after a
 * space. An amount and its currency are one fact, and splitting them across two
 * lines leaves the reader to join them up.
 *
 * The suffix is read at the same strictness as the value it follows, so a typo
 * in it is caught wherever the value itself would be. It is dropped when it
 * resolves empty, and never read at all when the value does — an absent field
 * prints nothing, not a bare currency code.
 *
 * Reading is left to the caller: the same definition resolves against the
 * document root in one block and row-relative in another.
 */
export function readField(
  field: FieldDef,
  read: (path: string, optional: boolean) => string,
): string {
  const optional = field.optional === true;
  const value = applyFormat(read(field.path, optional), field.format);
  if (value === '' || field.suffixPath === undefined) return value;
  const suffix = read(field.suffixPath, optional);
  return suffix === '' ? value : `${value} ${suffix}`;
}

/**
 * `value` less the sum of one binding taken over every entry of a collection.
 *
 * This exists for a figure the FA schemas define as a difference rather than
 * state outright: on a settlement invoice that also documents payments received
 * before delivery, the schema says the difference between `P_15` and the sum of
 * the individual `P_15Z` fields is what remains to be paid. Nothing carries that
 * number, so a page that will not compute it cannot show it at all.
 *
 * Returns `''` when the base value is absent — a difference from nothing is not
 * zero, it is unknown — and `sumDecimal` already yields `''` if any operand is
 * unparseable, so a broken document prints a blank rather than a wrong figure.
 */
export function lessRepeatedSum(value: string, less: RepeatedSum, root: unknown): string {
  if (value.trim() === '') return '';
  const raw = repeatedSum(less, root).trim();
  if (raw === '') return value;
  return sumDecimal([value, raw.startsWith('-') ? raw.slice(1) : `-${raw}`]);
}

/**
 * The sum of one binding taken over every entry of a collection.
 *
 * `sum` adds up a fixed list of paths, which cannot express "every part payment
 * this invoice records" — the entries are not known to the template. Absent and
 * blank entries are skipped; an unparseable one makes the whole sum `''`, as it
 * does everywhere else here, because a blank is safer than a wrong total.
 */
export function repeatedSum(spec: RepeatedSum, root: unknown): string {
  if (spec.sum) return sumDecimal(spec.sum.map((path) => get(root, path)));
  const path = spec.path ?? '';
  if (spec.from === undefined) return get(root, path);
  return sumDecimal(list(root, spec.from).map((entry) => get(entry, path)));
}
