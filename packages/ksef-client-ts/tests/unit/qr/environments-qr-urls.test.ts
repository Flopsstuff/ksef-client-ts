import { describe, it, expect } from 'vitest';
import { Environment } from '../../../src/config/environments.js';

describe('Environment QR URLs', () => {
  it('TEST environment has correct QR URL', () => {
    expect(Environment.TEST.qrUrl).toBe('https://qr-test.ksef.mf.gov.pl');
  });

  it('DEMO environment has correct QR URL', () => {
    expect(Environment.DEMO.qrUrl).toBe('https://qr-demo.ksef.mf.gov.pl');
  });

  it('PROD environment has correct QR URL', () => {
    expect(Environment.PROD.qrUrl).toBe('https://qr.ksef.mf.gov.pl');
  });
});
