/**
 * Label language for the rendered PDF. A bilingual locale is any two base
 * locales joined by `+`, and it is named for its order: `pl+en` puts Polish
 * first, `en+pl` English first. Every ordered pair is valid, so an invoice can
 * be issued in Polish alongside the reader's own language.
 */
export type Locale =
  | BaseLocale
  | 'pl+en'
  | 'en+pl'
  | 'pl+uk'
  | 'uk+pl'
  | 'en+uk'
  | 'uk+en';

/** The single-language bundles a bilingual locale is composed from. */
export type BaseLocale = 'pl' | 'en' | 'uk';

/**
 * Known label keys referenced by built-in templates. Custom templates may use
 * additional keys via per-template overrides; unknown keys fall back to their
 * own string. Keeping this a string-keyed record (not a closed union) lets
 * custom templates introduce labels without a type change, while the built-in
 * bundles below document the canonical set.
 */
export type LabelBundle = Record<string, string>;
