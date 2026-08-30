/**
 * Flags derived from the document itself, for templates to gate rows on.
 *
 * They live here rather than inline in the renderer because the reasoning is
 * about the FA schema, not about layout, and because a test can then check the
 * reading without going through a PDF.
 */
import { get, has } from './accessor.js';

/**
 * Invoice kinds whose `P_15` is a payment already received rather than an
 * amount still owed (`TRodzajFaktury`): an advance invoice documents the
 * receipt of a payment made before the sale.
 */
const ADVANCE_INVOICE_TYPES = new Set(['ZAL', 'KOR_ZAL']);

/**
 * Which of `P_15`'s three readings this document supports. `P_15` does not mean
 * the same thing on every invoice, so a template cannot name it with one fixed
 * label:
 *
 * - on an advance invoice it is the payment the document records as received,
 *   and telling that reader to pay it again is the worst thing an invoice PDF
 *   can do;
 * - when the document carries `Rozliczenie.DoZaplaty` — `P_15` plus surcharges
 *   minus deductions — the payable figure is that one, so `P_15` is only the
 *   total receivable;
 * - otherwise it is both, and reads as the amount due.
 *
 * Exactly one flag is true, so a template lists one row per reading and the
 * right one prints.
 */
export function p15Flags(root: unknown): Record<string, boolean> {
  const advance = ADVANCE_INVOICE_TYPES.has(get(root, 'Fa.RodzajFaktury'));
  const settled = has(root, 'Fa.Rozliczenie.DoZaplaty');
  return {
    p15IsAdvancePaid: advance,
    p15IsAmountTotal: !advance && settled,
    p15IsAmountDue: !advance && !settled,
  };
}

/**
 * How much of the invoice the document says has been paid.
 *
 * `Platnosc` states this through a choice: either `Zaplacono` (a bare `1`
 * meaning settled in full, alongside `DataZaplaty`), or
 * `ZnacznikZaplatyCzesciowej` — `1` paid in part, `2` paid in full — alongside
 * up to 100 `ZaplataCzesciowa` entries. An invoice settled in instalments
 * therefore carries no `Zaplacono` at all, which is why a template bound to
 * that field alone showed nothing for it.
 *
 * The status is a flag rather than a printed value because `1` on the page
 * says nothing to a reader; the label is the fact.
 */
export function paymentFlags(root: unknown): Record<string, boolean> {
  const mark = get(root, 'Fa.Platnosc.ZnacznikZaplatyCzesciowej');
  return {
    paidInFull: get(root, 'Fa.Platnosc.Zaplacono') === '1' || mark === '2',
    paidInPart: mark === '1',
  };
}
