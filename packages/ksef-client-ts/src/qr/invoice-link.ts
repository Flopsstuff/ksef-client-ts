/**
 * Code I ("invoice") verification-link assembly — the half of
 * {@link VerificationLinkService} that is pure string and date work.
 *
 * It lives apart from the class so the PDF renderer can build a Code I URL
 * without pulling `node:crypto` into its module graph. Only Code II needs a
 * signature, and only the class does that; `./pdf` never calls it.
 */

/** Standard base64 → base64url: `+/` swapped out, padding dropped. */
export function base64ToBase64Url(base64: string): string {
  return base64
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Build the invoice verification URL (Code I).
 * Format: `{baseQrUrl}/invoice/{NIP}/{DD-MM-YYYY}/{hash_base64url}`
 */
export function buildInvoiceVerificationUrl(
  baseQrUrl: string,
  nip: string,
  issueDate: Date | string,
  invoiceHashBase64: string,
): string {
  const date = typeof issueDate === 'string' ? new Date(issueDate) : issueDate;
  if (Number.isNaN(date.getTime())) {
    throw new Error(
      `Invalid issueDate for verification URL: ${JSON.stringify(issueDate)} (expected a parseable date, e.g. "2026-06-08").`,
    );
  }
  // A day that does not exist does not fail to parse — it rolls forward, so
  // "2026-02-30" becomes 2026-03-02 and the code would verify a different
  // issue date than the invoice carries, visible only to whoever scans it.
  //
  // The written calendar fields are checked on their own terms rather than
  // against the parsed UTC date: with an offset the two legitimately differ
  // ("2026-01-01T00:30:00+01:00" is 2025-12-31 in UTC), so comparing them
  // would refuse real dates. This holds for a bare date and a timestamp
  // alike. A Date the caller built has no written form to check.
  if (typeof issueDate === 'string') {
    const written = /^(\d{4})-(\d{2})-(\d{2})/.exec(issueDate.trim());
    if (written) {
      const [year, month, day] = written.slice(1).map(Number) as [number, number, number];
      const asUtc = new Date(Date.UTC(year, month - 1, day));
      const real =
        asUtc.getUTCFullYear() === year &&
        asUtc.getUTCMonth() === month - 1 &&
        asUtc.getUTCDate() === day;
      if (!real) {
        throw new Error(
          `Invalid issueDate for verification URL: ${JSON.stringify(issueDate)} is not a real calendar date ` +
            `(there is no ${String(day).padStart(2, '0')}.${String(month).padStart(2, '0')}.${year}).`,
        );
      }
    }
  }
  const dd = String(date.getUTCDate()).padStart(2, '0');
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = date.getUTCFullYear();
  const dateStr = `${dd}-${mm}-${yyyy}`;

  return `${baseQrUrl}/invoice/${nip}/${dateStr}/${base64ToBase64Url(invoiceHashBase64)}`;
}
