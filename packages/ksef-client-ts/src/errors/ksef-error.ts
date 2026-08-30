/**
 * Identifies a KSeF error across copies of this class.
 *
 * The package ships several entry points — `.`, `./node`, `./pdf` — each
 * bundled on its own, so an error thrown from `./pdf` is built from that
 * bundle's own copy of this class and fails an ordinary prototype test against
 * the root one. That would quietly break the single promise the hierarchy
 * makes: that one `instanceof KSeFError` catches everything the library throws.
 * A registered symbol is the same value in every copy, so the brand survives
 * the split.
 */
const KSEF_ERROR_BRAND: unique symbol = Symbol.for('ksef-client-ts.KSeFError');

export class KSeFError extends Error {
  /** @internal Cross-entry-point brand; see the note on the symbol. */
  readonly [KSEF_ERROR_BRAND] = true;

  constructor(message: string) {
    super(message);
    this.name = 'KSeFError';
  }

  /**
   * Answers for an error from any entry point, not just this copy of the class.
   *
   * Only the base class does so: a subclass falls back to the ordinary
   * prototype test, so `instanceof KSeFApiError` still tells one kind of
   * failure from another rather than matching every KSeF error alike. Catching
   * a specific subclass across entry points therefore means importing it from
   * the entry point that threw it.
   */
  static [Symbol.hasInstance](value: unknown): boolean {
    if (this !== KSeFError) return Function.prototype[Symbol.hasInstance].call(this, value);
    return typeof value === 'object' && value !== null && KSEF_ERROR_BRAND in value;
  }
}
