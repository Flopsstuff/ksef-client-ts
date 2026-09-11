/**
 * Flags derived from the document itself, for templates to gate rows on.
 *
 * They live here rather than inline in the renderer because the reasoning is
 * about the FA schema, not about layout, and because a test can then check the
 * reading without going through a PDF.
 */
import { get, has, list } from './accessor.js';

/**
 * Invoice kinds whose `P_15` is a payment already received rather than an
 * amount still owed (`TRodzajFaktury`): an advance invoice documents the
 * receipt of a payment made before the sale. `KOR_ZAL` is not here: it
 * corrects an advance invoice, and its `P_15` is the correction, not the
 * payment.
 */
const ADVANCE_INVOICE_TYPES = new Set(['ZAL']);

/**
 * The settlement invoice of art. 106f ust. 3 — the one issued after the goods
 * are delivered, against advances already invoiced. Its lines state the *full*
 * order value while `P_15` states only what is still owed, so a page that calls
 * `P_15` "the amount due" leaves a reader comparing it against line items many
 * times larger and doubting both.
 */
const SETTLEMENT_INVOICE_TYPES = new Set(['ROZ']);

/**
 * The correcting kinds. On each of them the schema defines `P_15` as the
 * *correction of* the amount on the invoice being corrected — a signed delta,
 * often negative — so none of the other readings applies, whatever else the
 * document states: a correction that also carries `Rozliczenie` or records a
 * part payment is still a correction.
 */
const CORRECTION_INVOICE_TYPES = new Set(['KOR', 'KOR_ZAL', 'KOR_ROZ']);

/**
 * Which of `P_15`'s readings this document supports. `P_15` does not mean the
 * same thing on every invoice, so a template cannot name it with one fixed
 * label:
 *
 * - on a correcting invoice it is a signed correction of the amount on the
 *   invoice being corrected, and a reader told to "pay" a negative figure is
 *   left guessing;
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
  const correction = CORRECTION_INVOICE_TYPES.has(kind);
  const advance = !correction && ADVANCE_INVOICE_TYPES.has(kind);
  // `Rozliczenie` states the payable — or the overpayment — outright, so it
  // outranks the invoice type: whatever `P_15` means here, it is not the figure
  // the reader acts on.
  // `P_15` stops being the figure to act on as soon as the document states one
  // itself — the payable or the overpayment under `Rozliczenie` — or records
  // that part of it has already been paid, which leaves the remainder owed.
  const settled =
    !correction &&
    !advance &&
    (has(root, 'Fa.Rozliczenie.DoZaplaty') ||
      has(root, 'Fa.Rozliczenie.DoRozliczenia') ||
      get(root, 'Fa.Platnosc.ZnacznikZaplatyCzesciowej') === '1');

  // A settlement invoice comes in two shapes. Plain, `P_15` *is* what is left
  // to pay. But when it also documents payments received before delivery, the
  // schema defines the remainder as `P_15` minus the sum of those `P_15Z`
  // fields — so `P_15` is then the whole amount, and the figure the reader owes
  // has to be computed.
  const settlement = !correction && !advance && !settled && SETTLEMENT_INVOICE_TYPES.has(kind);
  const documentsPayments = settlement && has(root, 'Fa.ZaliczkaCzesciowa');

  return {
    p15IsCorrection: correction,
    p15IsAdvancePaid: advance,
    p15IsAmountTotal: settled || documentsPayments,
    p15IsRemainder: settlement && !documentsPayments,
    p15IsAmountDue: !correction && !advance && !settled && !settlement,
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
  const paidInPart = mark === '1';
  // What the instalments are paid against. The schema defines
  // `Rozliczenie.DoZaplaty` as `P_15` plus surcharges less deductions, so a
  // document that states it states the figure the reader owes — and a
  // remainder taken off `P_15` would be short by the surcharge while the page's
  // own `Do zapłaty` line, one row above, said otherwise. Nothing in FA stops
  // an invoice carrying surcharges from being settled in instalments, so the
  // two really do meet.
  const payableStated = has(root, 'Fa.Rozliczenie.DoZaplaty');
  return {
    paidInFull: get(root, 'Fa.Platnosc.Zaplacono') === '1' || mark === '2',
    paidInPart,
    paidInPartOfPayable: paidInPart && payableStated,
    paidInPartOfTotal: paidInPart && !payableStated,
  };
}

/**
 * What kind of document this is, for the parts of the page that name it rather
 * than compute from it — the title above all. `ZAL` and `ROZ` are the two an
 * ordinary reader must not confuse: one records money taken before the sale,
 * the other closes the sale against it, and both would otherwise be headed
 * simply "Faktura". A correction is named as one too, and a correction of an
 * advance or a settlement invoice says which — `KOR_ZAL` is not an advance
 * invoice, it is a correction of one, and the heading is where that is
 * cheapest to say.
 */
export function kindFlags(root: unknown): Record<string, boolean> {
  const kind = get(root, 'Fa.RodzajFaktury');
  return {
    isAdvanceInvoice: kind === 'ZAL',
    isSettlementInvoice: kind === 'ROZ',
    isCorrection: CORRECTION_INVOICE_TYPES.has(kind),
    isCorrectionOfAdvance: kind === 'KOR_ZAL',
    isCorrectionOfSettlement: kind === 'KOR_ROZ',
  };
}

/**
 * What a correction carries besides its own figures.
 *
 * A correction may restate the parties as they stood on the corrected invoice
 * (`Podmiot1K` for the seller, `Podmiot2K` for a buyer), and it may list its
 * items as pairs — the row as it was, marked as before, and the row as it now
 * is. A correction of an advance invoice keeps its items under the order
 * (`Fa.Zamowienie.ZamowienieWiersz`, marked `StanPrzedZ`) rather than under
 * `Fa.FaWiersz` (marked `StanPrzed`), so the two collections get a flag each.
 * All are optional and independent, and a `when` can test one path only, so
 * "either party restated" and "any row marked as before" are computed here
 * rather than written into a template.
 */
export function correctionFlags(root: unknown): Record<string, boolean> {
  return {
    partiesBefore: has(root, 'Fa.Podmiot1K') || has(root, 'Fa.Podmiot2K'),
    linesBefore: list(root, 'Fa.FaWiersz').some((row) => has(row, 'StanPrzed')),
    orderLinesBefore: list(root, 'Fa.Zamowienie.ZamowienieWiersz').some((row) => has(row, 'StanPrzedZ')),
  };
}

/** Every document-derived flag a template may gate on. */
export function documentFlags(root: unknown): Record<string, boolean> {
  return { ...p15Flags(root), ...paymentFlags(root), ...kindFlags(root), ...correctionFlags(root) };
}
