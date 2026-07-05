/** Label language for the rendered PDF. `pl+en` is built by concatenation. */
export type Locale = 'pl' | 'en' | 'pl+en';

/**
 * Known label keys referenced by built-in templates. Custom templates may use
 * additional keys via per-template overrides; unknown keys fall back to their
 * own string. Keeping this a string-keyed record (not a closed union) lets
 * custom templates introduce labels without a type change, while the built-in
 * bundles below document the canonical set.
 */
export type LabelBundle = Record<string, string>;
