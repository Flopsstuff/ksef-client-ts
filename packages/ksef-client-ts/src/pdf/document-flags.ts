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
 * The settlement invoice of art. 106f ust. 3 — the one issued after the goods
 * are delivered, against advances already invoiced. Its lines state the *full*
 * order value while `P_15` states only what is still owed, so a page that calls
 * `P_15` "the amount due" leaves a reader comparing it against line items many
 * times larger and doubting both.
 */
const SETTLEMENT_INVOICE_TYPES = new Set(['ROZ']);

/**
 * Which of `P_15`'s three readings this document supports. `P_15` does not mean
 * the same thing on every invoice, so a template cannot name it with one fixed
 * label:
 *
 * - on an advance invoice it is the payment the document records as received,
 *   and telling that reader to pay it again is the worst thing an invoice PDF
 *   can do;
 * - on a settlement invoice (`ROZ`) it is what remains to be paid after the
 *   advances, next to lines that state the whole order;
 * - when the document carries `Rozliczenie.DoZaplaty` — `P_15` plus surcharges
 *   minus deductions — the payable figure is that one, so `P_15` is only the
 *   total receivable;
 * - otherwise it is both, and reads as the amount due.
 *
 * Exactly one flag is true, so a template lists one row per reading and the
 * right one prints.
 */
export function p15Flags(root: unknown): Record<string, boolean> {
  const kind = get(root, 'Fa.RodzajFaktury');
  const advance = ADVANCE_INVOICE_TYPES.has(kind);
  // `Rozliczenie` states the payable — or the overpayment — outright, so it
  // outranks the invoice type: whatever `P_15` means here, it is not the figure
  // the reader acts on.
  // `P_15` stops being the figure to act on as soon as the document states one
  // itself — the payable or the overpayment under `Rozliczenie` — or records
  // that part of it has already been paid, which leaves the remainder owed.
  const settled =
    !advance &&
    (has(root, 'Fa.Rozliczenie.DoZaplaty') ||
      has(root, 'Fa.Rozliczenie.DoRozliczenia') ||
      get(root, 'Fa.Platnosc.ZnacznikZaplatyCzesciowej') === '1');

  // A settlement invoice comes in two shapes. Plain, `P_15` *is* what is left
  // to pay. But when it also documents payments received before delivery, the
  // schema defines the remainder as `P_15` minus the sum of those `P_15Z`
  // fields — so `P_15` is then the whole amount, and the figure the reader owes
  // has to be computed.
  const settlement = !advance && !settled && SETTLEMENT_INVOICE_TYPES.has(kind);
  const documentsPayments = settlement && has(root, 'Fa.ZaliczkaCzesciowa');

  return {
    p15IsAdvancePaid: advance,
    p15IsAmountTotal: settled || documentsPayments,
    p15IsRemainder: settlement && !documentsPayments,
    p15IsAmountDue: !advance && !settled && !settlement,
    // Gates the computed row: the remainder exists only where the schema
    // defines it as a difference.
    settlementRemainder: documentsPayments,
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
