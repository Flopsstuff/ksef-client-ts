import { describe, it, expect } from 'vitest';
import { Environment } from '../../../src/config/index.js';

describe('Environment configs', () => {
  it('TEST has correct apiUrl', () => {
    expect(Environment.TEST.apiUrl).toBe('https://api-test.ksef.mf.gov.pl');
  });

  it('DEMO has correct apiUrl', () => {
    expect(Environment.DEMO.apiUrl).toBe('https://api-demo.ksef.mf.gov.pl');
  });

  it('PRD has correct apiUrl', () => {
    expect(Environment.PRD.apiUrl).toBe('https://api.ksef.mf.gov.pl');
  });

  it('all environments have qrUrl', () => {
    expect(Environment.TEST.qrUrl).toBeTruthy();
    expect(Environment.DEMO.qrUrl).toBeTruthy();
    expect(Environment.PRD.qrUrl).toBeTruthy();
  });

  it('TEST and PRD have lighthouseUrl, DEMO does not', () => {
    expect(Environment.TEST.lighthouseUrl).toBeTruthy();
    expect(Environment.DEMO.lighthouseUrl).toBe('');
    expect(Environment.PRD.lighthouseUrl).toBeTruthy();
  });

  it('all URLs use HTTPS', () => {
    for (const env of Object.values(Environment)) {
      expect(env.apiUrl).toMatch(/^https:\/\//);
      expect(env.qrUrl).toMatch(/^https:\/\//);
      if (env.lighthouseUrl) {
        expect(env.lighthouseUrl).toMatch(/^https:\/\//);
      }
    }
  });

  it('DEMO has empty lighthouseUrl (not available)', () => {
    expect(Environment.DEMO.lighthouseUrl).toBe('');
  });

  it('has exactly 3 environments', () => {
    expect(Object.keys(Environment)).toEqual(['TEST', 'DEMO', 'PRD']);
  });
});
