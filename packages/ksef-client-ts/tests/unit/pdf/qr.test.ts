import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import {
  computeInvoiceHashBase64,
  resolveBaseQrUrl,
  deriveInvoiceQrUrl,
} from '../../../src/pdf/qr.js';
import * as QRCode from 'qrcode';
import { qrRenderer } from '../../../src/pdf/template/blocks/qr.js';
import { blockRegistry } from '../../../src/pdf/template/blocks/index.js';
import { getBuiltinTemplate } from '../../../src/pdf/template/builtin/index.js';
import { interpretTemplate } from '../../../src/pdf/template/interpret.js';
import { makeLabelResolver } from '../../../src/pdf/i18n/index.js';
import type { Locale } from '../../../src/pdf/i18n/types.js';
import { VerificationLinkService } from '../../../src/qr/verification-link-service.js';
import { Environment } from '../../../src/config/environments.js';
import type { RenderContext } from '../../../src/pdf/template/interpret.js';
import type { QrBlock } from '../../../src/pdf/template/dsl.js';

/**
 * Minimal parsed body: seller NIP at the document root, issue date under `Fa`
 * (P_1 lives at Faktura/Fa/P_1, NOT the root) — the real parsed-Faktura shape.
 */
const body = { Podmiot1: { DaneIdentyfikacyjne: { NIP: '5213003700' } }, Fa: { P_1: '2025-01-15' } };

// A clean UTF-8 invoice payload with LF newlines and no BOM.
const CLEAN = '<Faktura>\n<P_2>FV/1</P_2>\n</Faktura>';

function base64ToBase64Url(b64: string): string {
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

describe('computeInvoiceHashBase64 — byte-exact hash invariant', () => {
  it('hashes a Uint8Array and the equivalent clean UTF-8 string to the SAME hash', () => {
    const bytes = new TextEncoder().encode(CLEAN);
    const fromBytes = computeInvoiceHashBase64(bytes);
    const fromString = computeInvoiceHashBase64(CLEAN);

    expect(fromBytes).toBe(fromString);
    // Sanity: matches a raw node:crypto digest over the same bytes.
    expect(fromString).toBe(crypto.createHash('sha256').update(Buffer.from(CLEAN, 'utf8')).digest('base64'));
  });

  it('returns standard base64 (not base64url)', () => {
    const hash = computeInvoiceHashBase64(CLEAN);
    // 32-byte digest → 44-char base64 with a trailing '=' pad.
    expect(hash).toMatch(/^[A-Za-z0-9+/]+=*$/);
    expect(hash).toHaveLength(44);
  });

  it('changes the hash when a BOM is prepended', () => {
    const withBom = '﻿' + CLEAN;
    expect(computeInvoiceHashBase64(withBom)).not.toBe(computeInvoiceHashBase64(CLEAN));
  });

  it('changes the hash when newlines are CRLF instead of LF', () => {
    const crlf = CLEAN.replace(/\n/g, '\r\n');
    expect(computeInvoiceHashBase64(crlf)).not.toBe(computeInvoiceHashBase64(CLEAN));
  });

  it('changes the hash when the XML is pretty-printed', () => {
    const pretty = '<Faktura>\n  <P_2>FV/1</P_2>\n</Faktura>';
    expect(computeInvoiceHashBase64(pretty)).not.toBe(computeInvoiceHashBase64(CLEAN));
  });
});

describe('resolveBaseQrUrl', () => {
  it('override wins over env', () => {
    expect(resolveBaseQrUrl('prod', 'https://custom.example')).toBe('https://custom.example');
    expect(resolveBaseQrUrl(undefined, 'https://custom.example')).toBe('https://custom.example');
  });

  it('treats an empty-string override as no override (falls through to env)', () => {
    expect(resolveBaseQrUrl('test', '')).toBe(Environment.TEST.qrUrl);
  });

  it('maps env → qrUrl', () => {
    expect(resolveBaseQrUrl('prod')).toBe(Environment.PROD.qrUrl);
    expect(resolveBaseQrUrl('test')).toBe(Environment.TEST.qrUrl);
    expect(resolveBaseQrUrl('demo')).toBe(Environment.DEMO.qrUrl);
  });

  it('defaults to prod when env is undefined', () => {
    expect(resolveBaseQrUrl(undefined)).toBe(Environment.PROD.qrUrl);
  });
});

describe('deriveInvoiceQrUrl', () => {
  it('equals VerificationLinkService.buildInvoiceVerificationUrl for the same inputs', () => {
    const url = deriveInvoiceQrUrl({ rawInput: CLEAN, body, env: 'test' });

    const base = Environment.TEST.qrUrl;
    const hash = computeInvoiceHashBase64(CLEAN);
    const expected = new VerificationLinkService(base).buildInvoiceVerificationUrl(
      '5213003700',
      '2025-01-15',
      hash,
    );

    expect(url).toBe(expected);
  });

  it('honors an explicit baseQrUrl override', () => {
    const url = deriveInvoiceQrUrl({ rawInput: CLEAN, body, baseQrUrl: 'https://custom.example' });
    expect(url.startsWith('https://custom.example/invoice/5213003700/15-01-2025/')).toBe(true);
  });

  it('uses an invoiceHash override VERBATIM (does not recompute)', () => {
    const override = 'AAAA++//zz==';
    const withOverride = deriveInvoiceQrUrl({ rawInput: CLEAN, body, env: 'test', invoiceHash: override });
    const withoutOverride = deriveInvoiceQrUrl({ rawInput: CLEAN, body, env: 'test' });

    // URL carries the base64url form of the override, not the computed hash.
    expect(withOverride.endsWith(base64ToBase64Url(override))).toBe(true);
    expect(withOverride).not.toBe(withoutOverride);
  });

  it('passes strict through to the accessor (throws on a missing binding)', () => {
    expect(() => deriveInvoiceQrUrl({ rawInput: CLEAN, body: {}, strict: true })).toThrow();
  });

  it('embeds a real DD-MM-YYYY issue date read from Fa/P_1 (regression: not NaN-NaN-NaN)', () => {
    const url = deriveInvoiceQrUrl({ rawInput: CLEAN, body, env: 'prod' });
    expect(url).toContain('/invoice/5213003700/15-01-2025/');
    expect(url).not.toContain('NaN');
  });

  it('throws a clear error when the issue date is absent (never emits a NaN date)', () => {
    const noDate = { Podmiot1: { DaneIdentyfikacyjne: { NIP: '5213003700' } } };
    expect(() => deriveInvoiceQrUrl({ rawInput: CLEAN, body: noDate })).toThrow(/issue date/i);
  });
});

describe('qrRenderer', () => {
  function ctxWith(bindings: Record<string, string>, flags: Record<string, boolean> = {}): RenderContext {
    return {
      root: body,
      strict: false,
      label: (k: string) => k,
      bindings,
      flags,
    };
  }
  const noopRender = () => null;
  const block: QrBlock = { type: 'qr' };
  const CODE_I = 'https://qr/invoice/x';
  const CODE_II = 'https://qr/certificate/Nip/1/2/3/4/5';

  /**
   * A rendered code is always `{ width: 'auto', stack: [code, link?] }` — the
   * wrapper is what lets a `columns` row pin the codes to the right margin.
   */
  type QrNode = { width: string; stack: Array<Record<string, unknown>> };
  const codeOf = (node: unknown) => (node as QrNode).stack?.[0] as { svg: string; width: number; height: number };
  /** The SVG a given URL must produce — the code's identity, in one value. */
  const svgFor = (url: string) => codeOf(qrRenderer({ type: 'qr' }, ctxWith({ qrUrl: url }), noopRender)).svg;
  const svgOf = (node: unknown) => codeOf(node)?.svg;

  it('draws the code itself, as a square SVG of the requested side', () => {
    const code = codeOf(qrRenderer(block, ctxWith({ qrUrl: CODE_I }), noopRender));
    expect(code.width).toBe(100); // the default fit
    expect(code.height).toBe(100);
    expect(String(code.svg)).toContain('<svg');
    expect(code).not.toHaveProperty('qr'); // not pdfmake's own QR node
  });

  it('hugs its content, so a columns row can pin it to the right margin', () => {
    const out = qrRenderer(block, ctxWith({ qrUrl: CODE_I }), noopRender) as QrNode;
    expect(out.width).toBe('auto');
  });

  it('honors a custom fit exactly, with no rounding down', () => {
    // pdfmake's QR node quantizes to whole points per module, so it can only
    // produce a handful of sizes; drawing the modules ourselves means the side
    // is whatever was asked for.
    for (const fit of [64, 77, 103]) {
      const code = codeOf(qrRenderer({ type: 'qr', fit }, ctxWith({ qrUrl: CODE_I }), noopRender));
      expect(code.width).toBe(fit);
      expect(code.height).toBe(fit);
    }
  });

  it('surrounds the code with the quiet zone the QR standard requires', () => {
    const svg = codeOf(qrRenderer(block, ctxWith({ qrUrl: CODE_I }), noopRender)).svg;
    const [, span] = /viewBox="0 0 (\d+) \1"/.exec(svg)!;
    const modules = QRCode.create(CODE_I, { errorCorrectionLevel: 'M' }).modules.size;
    expect(Number(span)).toBe(modules + 8); // four modules of margin on each side
  });

  it('refuses a fit that would leave the modules unreadable', () => {
    const modules = QRCode.create(CODE_I, { errorCorrectionLevel: 'M' }).modules.size + 8;
    expect(() => qrRenderer({ type: 'qr', fit: modules - 1 }, ctxWith({ qrUrl: CODE_I }), noopRender)).toThrow(
      /QR too small/,
    );
    expect(() => qrRenderer({ type: 'qr', fit: modules }, ctxWith({ qrUrl: CODE_I }), noopRender)).not.toThrow();
  });

  it('encodes at 15% error correction, not the 7% default', () => {
    // An invoice is printed, folded and scanned off paper; `L` leaves no margin
    // for a crease across the code. A stronger level needs more modules, which
    // is how this is observable from the outside.
    // Measured on a real-length Code I URL: at the short test URL above, both
    // levels happen to land on the same QR version and the difference is
    // invisible.
    const url = 'https://qr.ksef.mf.gov.pl/invoice/1111111111/15-01-2026/QCGVZWPVMG32C3qH6CXWlMlsJRbDtkuul7N-H92YWsE';
    const svg = codeOf(qrRenderer(block, ctxWith({ qrUrl: url }), noopRender)).svg;
    const span = Number(/viewBox="0 0 (\d+)/.exec(svg)![1]);
    const atL = QRCode.create(url, { errorCorrectionLevel: 'L' }).modules.size + 8;
    const atM = QRCode.create(url, { errorCorrectionLevel: 'M' }).modules.size + 8;
    expect(span).toBe(atM);
    expect(atM).toBeGreaterThan(atL);
  });

  it('renders nothing when the qrUrl binding is empty', () => {
    expect(qrRenderer(block, ctxWith({ qrUrl: '' }), noopRender)).toBeNull();
  });

  it('renders nothing when the qrUrl binding is absent', () => {
    expect(qrRenderer(block, ctxWith({}), noopRender)).toBeNull();
  });

  describe('code selection', () => {
    const both = { qrUrl: CODE_I, certificateQrUrl: CODE_II };

    it('defaults to Code I', () => {
      expect(svgOf(qrRenderer(block, ctxWith(both), noopRender))).toBe(svgFor(CODE_I));
    });

    it('reads Code I explicitly', () => {
      const out = qrRenderer({ type: 'qr', code: 'invoice' }, ctxWith(both), noopRender);
      expect(svgOf(out)).toBe(svgFor(CODE_I));
    });

    it('reads Code II from its own binding', () => {
      const out = qrRenderer({ type: 'qr', code: 'certificate' }, ctxWith(both), noopRender);
      expect(svgOf(out)).toBe(svgFor(CODE_II));
    });

    it('drops Code II on an invoice that carries none', () => {
      // The built-in templates always ask for both, and the block sits in a
      // columns row: an empty node here would take an elastic column of its own
      // and push Code I off the right margin, so the node must disappear.
      const out = qrRenderer({ type: 'qr', code: 'certificate' }, ctxWith({ qrUrl: CODE_I }), noopRender);
      expect(out).toBeNull();
    });

    it('prints Code II even when Code I is missing', () => {
      const out = qrRenderer({ type: 'qr', code: 'certificate' }, ctxWith({ certificateQrUrl: CODE_II }), noopRender);
      expect(svgOf(out)).toBe(svgFor(CODE_II));
    });
  });

  describe('the clickable link', () => {
    it('is absent unless the render asks for it', () => {
      const out = qrRenderer(block, ctxWith({ qrUrl: CODE_I }), noopRender) as QrNode;
      expect(out.stack).toHaveLength(1); // the code alone, nothing under it
      expect(codeOf(out).svg).toBe(svgFor(CODE_I));
    });

    it('sits under the code and points at the same URL', () => {
      const out = qrRenderer(block, ctxWith({ qrUrl: CODE_I }, { qrLinks: true }), noopRender) as {
        stack: Array<Record<string, unknown>>;
      };
      expect(out.stack[0]).toMatchObject({ svg: svgFor(CODE_I) });
      expect(out.stack[1]).toMatchObject({ text: 'openLink', link: CODE_I });
    });

    it('lines up with the code rather than with the box around it', () => {
      // The code is inset by its quiet zone, so a link flush with the box edge
      // reads as shifted left of everything above it.
      const fit = 104;
      const out = qrRenderer({ type: 'qr', fit }, ctxWith({ qrUrl: CODE_I }, { qrLinks: true }), noopRender) as {
        stack: Array<{ margin?: number[] }>;
      };
      const span = QRCode.create(CODE_I, { errorCorrectionLevel: 'M' }).modules.size + 8;
      expect(out.stack[1].margin).toEqual([(fit / span) * 4, 0, 0, 0]);
    });

    it('indents each code by its own quiet zone, not by a fixed amount', () => {
      // Same box, more data: Code II's modules are narrower, so its quiet zone
      // is narrower and its link starts further left than Code I's.
      const at = (bindings: Record<string, string>, code: 'invoice' | 'certificate') =>
        (qrRenderer({ type: 'qr', code, fit: 104 }, ctxWith(bindings, { qrLinks: true }), noopRender) as {
          stack: Array<{ margin?: number[] }>;
        }).stack[1].margin![0];
      const denser = 'https://qr/certificate/Nip/1111111111/1111111111/SERIAL/'.padEnd(400, 'x');
      expect(at({ qrUrl: CODE_I }, 'invoice')).toBeGreaterThan(at({ certificateQrUrl: denser }, 'certificate'));
    });

    it('links Code II to the certificate URL, not the invoice one', () => {
      const out = qrRenderer(
        { type: 'qr', code: 'certificate' },
        ctxWith({ qrUrl: CODE_I, certificateQrUrl: CODE_II }, { qrLinks: true }),
        noopRender,
      ) as { stack: Array<Record<string, unknown>> };
      expect(out.stack[1]).toMatchObject({ link: CODE_II });
    });

    it('takes the style the template names for it', () => {
      const out = qrRenderer(
        { type: 'qr', linkStyle: 'qrLink' },
        ctxWith({ qrUrl: CODE_I }, { qrLinks: true }),
        noopRender,
      ) as { stack: Array<Record<string, unknown>> };
      expect(out.stack[1]).toMatchObject({ text: 'openLink', link: CODE_I, style: 'qrLink' });
    });

    it('adds no link to a code that is not printed', () => {
      expect(qrRenderer(block, ctxWith({ qrUrl: '' }, { qrLinks: true }), noopRender)).toBeNull();
    });
  });
});

/**
 * The row itself, not the renderer: a heading in an elastic column with the
 * codes beside it, so they sit against the right margin. This used to be judged
 * by eye across a handful of preview PDFs; it is a property, so it belongs here.
 */
describe('the QR row keeps the codes on the right margin', () => {
  const CODE_I = 'https://qr-demo.ksef.mf.gov.pl/invoice/1111111111/15-01-2026/HASH';
  const CODE_II = 'https://qr-demo.ksef.mf.gov.pl/certificate/Nip/1111111111/1111111111/SERIAL/HASH/SIG';

  /** Column widths of the built-in QR row, for a given pair of codes. */
  function widths(bindings: Record<string, string>, locale: Locale = 'pl'): string[] {
    const ctx: RenderContext = {
      root: {},
      strict: false,
      label: makeLabelResolver(locale, {}),
      bindings,
      flags: { qr: true, qrLinks: true },
    };
    const doc = interpretTemplate(getBuiltinTemplate('fa3-default')!, ctx, blockRegistry);
    const row = (doc.content as Array<Record<string, unknown>>)
      .filter((n) => Array.isArray(n.columns))
      .pop() as { columns: Array<{ width?: string; text?: string }> };
    // An absent width is pdfmake's elastic default; name it so the assertions read.
    return row.columns.map((c) => c.width ?? '*');
  }

  it('gives the heading the only elastic column when both codes are present', () => {
    expect(widths({ qrUrl: CODE_I, certificateQrUrl: CODE_II })).toEqual(['*', 'auto', 'auto']);
  });

  it('drops the empty column when only Code I is present', () => {
    // The regression this pins: an empty node here took an elastic column of its
    // own and left the single code stranded mid-page instead of at the margin.
    expect(widths({ qrUrl: CODE_I })).toEqual(['*', 'auto']);
  });

  it('drops it just the same when only Code II is present', () => {
    expect(widths({ certificateQrUrl: CODE_II })).toEqual(['*', 'auto']);
  });

  it('holds however wide the heading runs', () => {
    // A bilingual heading is twice the length; the codes must not move.
    for (const locale of ['pl', 'uk', 'pl+uk'] as const) {
      expect(widths({ qrUrl: CODE_I, certificateQrUrl: CODE_II }, locale)).toEqual(['*', 'auto', 'auto']);
    }
  });
});
