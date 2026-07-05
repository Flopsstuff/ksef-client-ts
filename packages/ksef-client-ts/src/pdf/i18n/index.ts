/**
 * Label localization. Only `pl` and `en` bundles are maintained; `pl+en` is
 * produced on the fly by concatenation with a configurable separator, so there
 * is no third bundle to keep in sync. A missing key falls back to Polish, then
 * to the key itself.
 */
import type { Locale, LabelBundle } from './types.js';
import { pl } from './pl.js';
import { en } from './en.js';

export type { Locale, LabelBundle } from './types.js';
export { pl } from './pl.js';
export { en } from './en.js';

const BUNDLES: Record<'pl' | 'en', LabelBundle> = { pl, en };

export interface LabelOptions {
  /** Separator for the `pl+en` bilingual locale. Default `' / '`. */
  bilingualSeparator?: string;
  /** Per-template label overrides (highest precedence). */
  overrides?: LabelBundle;
}

function resolveOne(key: string, locale: 'pl' | 'en', overrides?: LabelBundle): string {
  const override = overrides?.[key];
  if (override !== undefined) return override;
  const fromBundle = BUNDLES[locale][key];
  if (fromBundle !== undefined) return fromBundle;
  // Fall back to Polish, then to the raw key.
  return pl[key] ?? key;
}

/**
 * Resolve a label key for the given locale. For `pl+en`, resolves both and
 * joins them with the separator (default `' / '`).
 */
export function resolveLabel(key: string, locale: Locale, opts: LabelOptions = {}): string {
  if (locale === 'pl+en') {
    const sep = opts.bilingualSeparator ?? ' / ';
    return `${resolveOne(key, 'pl', opts.overrides)}${sep}${resolveOne(key, 'en', opts.overrides)}`;
  }
  return resolveOne(key, locale, opts.overrides);
}

/** A bound resolver capturing locale + options, handed to block renderers. */
export type LabelResolver = (key: string) => string;

export function makeLabelResolver(locale: Locale, opts: LabelOptions = {}): LabelResolver {
  return (key: string) => resolveLabel(key, locale, opts);
}
