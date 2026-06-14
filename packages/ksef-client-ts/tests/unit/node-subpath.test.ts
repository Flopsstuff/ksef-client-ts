/**
 * /node subpath resolution tests (FLO-246).
 *
 * Verifies that:
 *  1. All moved symbols export correctly from `ksef-client-ts/node` (ESM + CJS).
 *  2. The moved symbols are absent from the root `ksef-client-ts` entry.
 */
import { createRequire } from 'node:module';
import { describe, it, expect } from 'vitest';

// ESM import of the /node subpath (exercises the "import" condition in exports map)
import {
  FileOfflineInvoiceStorage,
  FileHwmStore,
  validateAgainstXsd,
  resolveXsdFor,
  FA_XSD_PATHS,
  PEF_XSD_PATHS,
  libxmljsAvailable,
  isMissingLibxmljsError,
} from 'ksef-client-ts/node';

// CJS require of the /node subpath (exercises the "require" condition in exports map)
const nodeRequire = createRequire(import.meta.url);
const cjsNode = nodeRequire('ksef-client-ts/node') as Record<string, unknown>;

// Root barrel — moved symbols must be absent here
import * as rootExports from 'ksef-client-ts';

const MOVED_SYMBOLS = [
  'FileOfflineInvoiceStorage',
  'FileHwmStore',
  'validateAgainstXsd',
  'resolveXsdFor',
  'FA_XSD_PATHS',
  'PEF_XSD_PATHS',
  'libxmljsAvailable',
  'isMissingLibxmljsError',
] as const;

describe('ksef-client-ts/node subpath — ESM resolution', () => {
  it('exports FileOfflineInvoiceStorage', () => {
    expect(FileOfflineInvoiceStorage).toBeDefined();
  });

  it('exports FileHwmStore', () => {
    expect(FileHwmStore).toBeDefined();
  });

  it('exports validateAgainstXsd', () => {
    expect(validateAgainstXsd).toBeDefined();
  });

  it('exports resolveXsdFor', () => {
    expect(resolveXsdFor).toBeDefined();
  });

  it('exports FA_XSD_PATHS', () => {
    expect(FA_XSD_PATHS).toBeDefined();
    expect(FA_XSD_PATHS).toHaveProperty('FA2');
    expect(FA_XSD_PATHS).toHaveProperty('FA3');
  });

  it('exports PEF_XSD_PATHS', () => {
    expect(PEF_XSD_PATHS).toBeDefined();
    expect(PEF_XSD_PATHS).toHaveProperty('PEF');
    expect(PEF_XSD_PATHS).toHaveProperty('PEF_KOR');
  });

  it('exports libxmljsAvailable', () => {
    expect(libxmljsAvailable).toBeDefined();
    expect(typeof libxmljsAvailable).toBe('boolean');
  });

  it('exports isMissingLibxmljsError', () => {
    expect(isMissingLibxmljsError).toBeDefined();
    expect(typeof isMissingLibxmljsError).toBe('function');
  });
});

describe('ksef-client-ts/node subpath — CJS resolution', () => {
  for (const symbol of MOVED_SYMBOLS) {
    it(`exports ${symbol}`, () => {
      expect(cjsNode[symbol]).toBeDefined();
    });
  }
});

describe('ksef-client-ts root barrel — moved symbols absent', () => {
  for (const symbol of MOVED_SYMBOLS) {
    it(`does not export ${symbol}`, () => {
      expect((rootExports as Record<string, unknown>)[symbol]).toBeUndefined();
    });
  }
});
