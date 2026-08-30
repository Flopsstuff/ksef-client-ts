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
