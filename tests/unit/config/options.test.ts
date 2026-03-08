import { describe, it, expect } from 'vitest';
import { resolveOptions, Environment } from '../../../src/config/index.js';

describe('resolveOptions', () => {
  it('defaults to TEST environment with standard values', () => {
    const opts = resolveOptions();

    expect(opts.baseUrl).toBe(Environment.TEST.apiUrl);
    expect(opts.baseQrUrl).toBe(Environment.TEST.qrUrl);
    expect(opts.lighthouseUrl).toBe(Environment.TEST.lighthouseUrl);
    expect(opts.apiVersion).toBe('v2');
    expect(opts.timeout).toBe(30_000);
    expect(opts.customHeaders).toEqual({});
  });

  it('uses PRD environment when specified', () => {
    const opts = resolveOptions({ environment: 'PRD' });

    expect(opts.baseUrl).toBe(Environment.PRD.apiUrl);
    expect(opts.baseQrUrl).toBe(Environment.PRD.qrUrl);
    expect(opts.lighthouseUrl).toBe(Environment.PRD.lighthouseUrl);
  });

  it('uses DEMO environment when specified', () => {
    const opts = resolveOptions({ environment: 'DEMO' });

    expect(opts.baseUrl).toBe(Environment.DEMO.apiUrl);
  });

  it('custom baseUrl overrides environment apiUrl', () => {
    const opts = resolveOptions({ environment: 'PRD', baseUrl: 'https://custom.api' });

    expect(opts.baseUrl).toBe('https://custom.api');
  });

  it('custom baseQrUrl overrides environment qrUrl', () => {
    const opts = resolveOptions({ baseQrUrl: 'https://custom.qr' });

    expect(opts.baseQrUrl).toBe('https://custom.qr');
  });

  it('custom timeout overrides default 30000', () => {
    const opts = resolveOptions({ timeout: 60_000 });

    expect(opts.timeout).toBe(60_000);
  });

  it('custom apiVersion overrides default v2', () => {
    const opts = resolveOptions({ apiVersion: 'v3' });

    expect(opts.apiVersion).toBe('v3');
  });

  it('custom headers are passed through', () => {
    const headers = { 'X-Custom': 'value' };
    const opts = resolveOptions({ customHeaders: headers });

    expect(opts.customHeaders).toEqual(headers);
  });
});
