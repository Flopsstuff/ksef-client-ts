import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import {
  computeInvoiceHashBase64,
  resolveBaseQrUrl,
  deriveInvoiceQrUrl,
} from '../../../src/pdf/qr.js';
import { qrRenderer } from '../../../src/pdf/template/blocks/qr.js';
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
  function ctxWith(bindings: Record<string, string>): RenderContext {
    return {
      root: body,
      strict: false,
      label: (k: string) => k,
      bindings,
      flags: {},
    };
  }
  const noopRender = () => null;
  const block: QrBlock = { type: 'qr' };

  it('emits a qr node with default fit 100 when qrUrl is present', () => {
    const out = qrRenderer(block, ctxWith({ qrUrl: 'https://qr/invoice/x' }), noopRender);
    expect(out).toEqual({ qr: 'https://qr/invoice/x', fit: 100 });
  });

  it('honors a custom fit', () => {
    const out = qrRenderer({ type: 'qr', fit: 64 }, ctxWith({ qrUrl: 'https://qr/invoice/x' }), noopRender);
    expect(out).toEqual({ qr: 'https://qr/invoice/x', fit: 64 });
  });

  it('emits an empty text node when qrUrl binding is empty', () => {
    const out = qrRenderer(block, ctxWith({ qrUrl: '' }), noopRender);
    expect(out).toEqual({ text: '' });
  });

  it('emits an empty text node when qrUrl binding is absent', () => {
    const out = qrRenderer(block, ctxWith({}), noopRender);
    expect(out).toEqual({ text: '' });
  });
});
