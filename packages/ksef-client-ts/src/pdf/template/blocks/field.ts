import { applyFormat } from '../../format.js';
import type { FieldDef } from '../dsl.js';

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
