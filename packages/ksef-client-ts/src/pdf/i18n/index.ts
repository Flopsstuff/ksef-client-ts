/**
 * Label localization. One bundle per language; the bilingual locales are
 * produced on the fly by concatenation with a configurable separator, so there
 * is no combined bundle to keep in sync — adding a language adds its bundle and
 * every pairing it can take part in. A missing key falls back to Polish, then to
 * the key itself.
 */
import type { Locale, BaseLocale, LabelBundle } from './types.js';
import { pl } from './pl.js';
import { en } from './en.js';
import { uk } from './uk.js';

export type { Locale, BaseLocale, LabelBundle } from './types.js';
export { pl } from './pl.js';
export { en } from './en.js';
export { uk } from './uk.js';

const BUNDLES: Record<BaseLocale, LabelBundle> = { pl, en, uk };

/**
 * Split a bilingual locale into its halves, in the order its name spells out.
 * Read from the name rather than from a table of pairs, so a new language needs
 * no second registration to be combinable with the others.
 */
function bilingualPair(locale: Locale): [BaseLocale, BaseLocale] | null {
  const [first, second, ...rest] = locale.split('+');
  if (second === undefined || rest.length > 0) return null;
  if (!(first! in BUNDLES) || !(second in BUNDLES)) return null;
  return [first as BaseLocale, second as BaseLocale];
}

export interface LabelOptions {
  /** Separator for the bilingual locales. Default `' / '`. */
  bilingualSeparator?: string;
  /** Per-template label overrides (highest precedence). */
  overrides?: LabelBundle;
}

function resolveOne(key: string, locale: BaseLocale, overrides?: LabelBundle): string {
  const override = overrides?.[key];
  if (override !== undefined) return override;
  const fromBundle = BUNDLES[locale][key];
  if (fromBundle !== undefined) return fromBundle;
  // Fall back to Polish, then to the raw key.
  return pl[key] ?? key;
}

/**
 * Resolve a label key for the given locale. A bilingual locale resolves both
 * halves in the order its name spells out and joins them with the separator
 * (default `' / '`).
 */
export function resolveLabel(key: string, locale: Locale, opts: LabelOptions = {}): string {
  const pair = bilingualPair(locale);
  if (pair) {
    const sep = opts.bilingualSeparator ?? ' / ';
    return `${resolveOne(key, pair[0], opts.overrides)}${sep}${resolveOne(key, pair[1], opts.overrides)}`;
  }
  return resolveOne(key, locale as BaseLocale, opts.overrides);
}

/** A bound resolver capturing locale + options, handed to block renderers. */
export type LabelResolver = (key: string) => string;

export function makeLabelResolver(locale: Locale, opts: LabelOptions = {}): LabelResolver {
  return (key: string) => resolveLabel(key, locale, opts);
}
