/**
 * Label language for the rendered PDF. The bilingual locales are built by
 * concatenation and named for their order: `pl+en` puts Polish first, `en+pl`
 * English first.
 */
export type Locale = 'pl' | 'en' | 'pl+en' | 'en+pl';

/** The two single-language bundles a bilingual locale is composed from. */
export type BaseLocale = 'pl' | 'en';

/**
 * Known label keys referenced by built-in templates. Custom templates may use
 * additional keys via per-template overrides; unknown keys fall back to their
 * own string. Keeping this a string-keyed record (not a closed union) lets
 * custom templates introduce labels without a type change, while the built-in
 * bundles below document the canonical set.
 */
export type LabelBundle = Record<string, string>;
