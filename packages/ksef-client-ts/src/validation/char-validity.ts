/**
 * Level 1a — Character validity pre-parse check.
 *
 * KSeF API v2.4.0 rejects invoice XML that contains either:
 *   - XML processing instructions outside the `<?xml ... ?>` prolog, or
 *   - Unicode code points discouraged by W3C XML 1.0 §2.2.
 *
 * Strict server-side enforcement on KSeF production begins 2026-07-16.
 * Running this check before `xmlToObject()` catches issues client-side
 * with precise offsets instead of relying on a generic server rejection.
 */

import type { InvoiceValidationError } from './invoice-validator.js';

/**
 * W3C XML 1.0 §2.2 discouraged Unicode code-point ranges (sorted, non-overlapping).
 * Characters in any of these ranges are rejected by KSeF v2.4.0+.
 */
export const DISCOURAGED_UNICODE_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0x7F, 0x84], [0x86, 0x9F], [0xFDD0, 0xFDEF],
  [0x1FFFE, 0x1FFFF], [0x2FFFE, 0x2FFFF], [0x3FFFE, 0x3FFFF],
  [0x4FFFE, 0x4FFFF], [0x5FFFE, 0x5FFFF], [0x6FFFE, 0x6FFFF],
  [0x7FFFE, 0x7FFFF], [0x8FFFE, 0x8FFFF], [0x9FFFE, 0x9FFFF],
  [0xAFFFE, 0xAFFFF], [0xBFFFE, 0xBFFFF], [0xCFFFE, 0xCFFFF],
  [0xDFFFE, 0xDFFFF], [0xEFFFE, 0xEFFFF], [0xFFFFE, 0xFFFFF],
  [0x10FFFE, 0x10FFFF],
];

/**
 * Scan raw XML string for disallowed processing instructions and discouraged
 * Unicode code points. Returns accumulated errors; empty array means the
 * document is acceptable at this level.
 */
export function validateCharValidity(xml: string): InvoiceValidationError[] {
  return [...findProcessingInstructions(xml), ...findDiscouragedUnicode(xml)];
}

// ─── Processing instructions ────────────────────────────────────────────────

const PI_TARGET_RE = /^<\?(\S+)/;

interface ProcessingInstructionToken {
  token: string;
  index: number;
}

function findProcessingInstructionTokens(xml: string): ProcessingInstructionToken[] {
  const tokens: ProcessingInstructionToken[] = [];

  for (let i = 0; i < xml.length;) {
    if (xml.startsWith('<!--', i)) {
      const end = xml.indexOf('-->', i + 4);
      i = end === -1 ? xml.length : end + 3;
      continue;
    }
    if (xml.startsWith('<![CDATA[', i)) {
      const end = xml.indexOf(']]>', i + 9);
      i = end === -1 ? xml.length : end + 3;
      continue;
    }
    if (xml.startsWith('<?', i)) {
      const end = xml.indexOf('?>', i + 2);
      if (end === -1) break;
      tokens.push({ token: xml.slice(i, end + 2), index: i });
      i = end + 2;
      continue;
    }
    i += 1;
  }

  return tokens;
}

function findProcessingInstructions(xml: string): InvoiceValidationError[] {
  const errors: InvoiceValidationError[] = [];
  const matches = findProcessingInstructionTokens(xml);
  if (matches.length === 0) return errors;

  // W3C XML 1.0 §2.8 + Appendix F: the XML declaration, if present, must be
  // the very first thing in the document entity — no preceding whitespace,
  // comments, or PIs. A single UTF-8 BOM (U+FEFF) is allowed to precede it.
  const firstMatch = matches[0]!;
  const firstTarget = firstMatch.token.match(PI_TARGET_RE)?.[1];
  const hasBom = xml.charCodeAt(0) === 0xFEFF;
  const prologPosition = hasBom ? 1 : 0;
  const firstIsProlog = firstMatch.index === prologPosition && firstTarget === 'xml';

  for (let i = 0; i < matches.length; i++) {
    if (i === 0 && firstIsProlog) continue;
    const m = matches[i]!;
    const target = m.token.match(PI_TARGET_RE)?.[1] ?? '?';
    errors.push({
      code: 'XML_PROCESSING_INSTRUCTION',
      message: `Processing instruction <?${target}?> at offset ${m.index} is not allowed (only <?xml ... ?> prolog is permitted)`,
      path: `offset:${m.index}`,
    });
  }

  return errors;
}

// ─── Discouraged Unicode code points ────────────────────────────────────────

function findDiscouragedUnicode(xml: string): InvoiceValidationError[] {
  const errors: InvoiceValidationError[] = [];
  const seenRanges = new Set<number>();

  let utf16Offset = 0;
  for (const ch of xml) {
    const cp = ch.codePointAt(0)!;
    const idx = rangeIndex(cp);
    if (idx >= 0 && !seenRanges.has(idx)) {
      seenRanges.add(idx);
      errors.push({
        code: 'XML_DISCOURAGED_UNICODE',
        message: `Discouraged Unicode character U+${cp.toString(16).toUpperCase().padStart(4, '0')} found at offset ${utf16Offset} (W3C XML 1.0 §2.2 rejects this range)`,
        path: `offset:${utf16Offset}`,
      });
    }
    utf16Offset += ch.length;
  }

  return errors;
}

/** Binary-search the sorted range table. Returns the range index, or -1 if `cp` is not in any range. */
function rangeIndex(cp: number): number {
  let lo = 0;
  let hi = DISCOURAGED_UNICODE_RANGES.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const [start, end] = DISCOURAGED_UNICODE_RANGES[mid]!;
    if (cp < start) hi = mid - 1;
    else if (cp > end) lo = mid + 1;
    else return mid;
  }
  return -1;
}
