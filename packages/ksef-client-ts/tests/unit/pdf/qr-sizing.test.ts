import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import * as QRCode from 'qrcode';
import { getBuiltinTemplate } from '../../../src/pdf/template/builtin/index.js';
import { VerificationLinkService } from '../../../src/qr/verification-link-service.js';
import type { Block, ColumnsBlock, QrBlock } from '../../../src/pdf/template/dsl.js';

/**
 * A QR is only as readable as its modules are wide, and that width is the box
 * divided by the module count — which is set by how much data the code carries,
 * not by the template. Code I is 41 modules; Code II carries a signature and
 * runs 57 modules over an EC key and 85 over RSA, both of which KSeF issues. So
 * one box size gives the two codes very different module widths, and a box that
 * suits Code I can leave Code II a smudge.
 *
 * Nothing else catches this: an unreadable code is still a structurally valid
 * PDF, so every render test passes while the page is useless. This measures the
 * built-in templates against real URLs of both kinds.
 */

/** Module count including the quiet zone — the divisor that decides readability. */
function span(url: string): number {
  return QRCode.create(url, { errorCorrectionLevel: 'M' }).modules.size + 8;
}

/**
 * Floor for a printed module, in points. 1pt is 0.35 mm — confirmed scannable
 * off a laser-printed page, and low enough that crossing it means the block was
 * mis-sized rather than deliberately shrunk.
 */
const MIN_MODULE_PT = 1;

const svc = new VerificationLinkService('https://qr-demo.ksef.mf.gov.pl');
const hash = crypto.randomBytes(32).toString('base64');

const pem = (type: 'ec' | 'rsa') =>
  (type === 'ec'
    ? crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' })
    : crypto.generateKeyPairSync('rsa', { modulusLength: 2048 })
  ).privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;

const codeII = (type: 'ec' | 'rsa') =>
  svc.buildCertificateVerificationUrl('Nip', '1111111111', '1111111111', '01F20A5D352AE590', hash, pem(type));

const CODE_I = svc.buildInvoiceVerificationUrl('1111111111', '2026-01-15', hash);
const CODE_II_EC = codeII('ec');
const CODE_II_RSA = codeII('rsa');

/** The `fit` each built-in template gives each code. */
function fits(templateName: string): Record<string, number> {
  const template = getBuiltinTemplate(templateName)!;
  const qrBlocks: QrBlock[] = [];
  const walk = (blocks: Block[]): void => {
    for (const b of blocks) {
      if (b.type === 'qr') qrBlocks.push(b);
      if (b.type === 'columns') walk((b as ColumnsBlock).columns);
      if (b.type === 'stack') walk(b.stack);
    }
  };
  walk(template.blocks);
  return Object.fromEntries(qrBlocks.map((b) => [b.code ?? 'invoice', b.fit ?? 100]));
}

const TEMPLATES = ['fa2-default', 'fa3-default'];

describe('built-in QR sizing', () => {
  it.each(TEMPLATES)('%s prints both codes', (name) => {
    expect(Object.keys(fits(name)).sort()).toEqual(['certificate', 'invoice']);
  });

  it.each(TEMPLATES)('%s gives the two codes the same footprint', (name) => {
    // The point of drawing the codes ourselves: the box is exact, so equal `fit`
    // means equal size on the page however much data each code carries.
    const fit = fits(name);
    expect(fit.invoice).toBe(fit.certificate);
  });

  it.each(TEMPLATES)('%s keeps every module above the floor', (name) => {
    const fit = fits(name);
    const cases: Array<[code: string, url: string]> = [
      ['invoice', CODE_I],
      ['certificate', CODE_II_EC],
    ];
    for (const [code, url] of cases) {
      const modulePt = fit[code]! / span(url);
      expect(modulePt, `${code} at fit ${fit[code]}`).toBeGreaterThanOrEqual(MIN_MODULE_PT);
    }
  });

  it.each(TEMPLATES)('%s puts Code II at roughly 1.5pt per module', (name) => {
    // The size the whole layout is pinned to: Code II is the denser code, so it
    // sets the box, and Code I is scaled up to match it.
    const modulePt = fits(name).certificate! / span(CODE_II_EC);
    expect(modulePt).toBeGreaterThan(1.4);
    expect(modulePt).toBeLessThan(1.7);
  });

  it('leaves Code I with the wider modules of the two', () => {
    // Same box, less data — Code I ends up comfortably above Code II, which is
    // the right way round: the code every invoice carries is the readable one.
    const fit = fits('fa3-default');
    expect(fit.invoice! / span(CODE_I)).toBeGreaterThan(fit.certificate! / span(CODE_II_EC));
  });

  it('an RSA-signed Code II is denser than the box comfortably allows', () => {
    // Both key types are legal (certyfikaty-KSeF.md), and RSA's signature is
    // four times longer. Pinned as a known limit rather than a passing grade:
    // it still clears the hard floor, but only just.
    const modulePt = fits('fa3-default').certificate! / span(CODE_II_RSA);
    expect(span(CODE_II_RSA)).toBeGreaterThan(span(CODE_II_EC));
    expect(modulePt).toBeGreaterThanOrEqual(MIN_MODULE_PT);
    expect(modulePt).toBeLessThan(1.4);
  });
});
