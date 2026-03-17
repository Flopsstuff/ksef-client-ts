import { describe, it, expect } from 'vitest';
import {
  defaultPresignedUrlPolicy,
  validatePresignedUrl,
  PresignedUrlPolicy,
} from '../../../src/http/presigned-url-policy.js';
import { KSeFValidationError } from '../../../src/errors/ksef-validation-error.js';

function policy(overrides: Partial<PresignedUrlPolicy> = {}): PresignedUrlPolicy {
  return {
    allowedHosts: ['*.ksef.mf.gov.pl'],
    requireHttps: true,
    blockRedirectParams: true,
    rejectPrivateIps: true,
    ...overrides,
  };
}

describe('presigned-url-policy', () => {
  describe('defaultPresignedUrlPolicy', () => {
    it('returns the expected default values', () => {
      const p = defaultPresignedUrlPolicy();
      expect(p.allowedHosts).toEqual(['*.ksef.mf.gov.pl']);
      expect(p.requireHttps).toBe(true);
      expect(p.blockRedirectParams).toBe(true);
      expect(p.rejectPrivateIps).toBe(true);
    });
  });

  describe('HTTPS enforcement', () => {
    it('throws KSeFValidationError for HTTP when requireHttps is true', () => {
      expect(() =>
        validatePresignedUrl('http://storage.ksef.mf.gov.pl/file', policy()),
      ).toThrow(KSeFValidationError);
    });

    it('passes for HTTPS URL', () => {
      expect(() =>
        validatePresignedUrl('https://storage.ksef.mf.gov.pl/file', policy()),
      ).not.toThrow();
    });

    it('passes for HTTP when requireHttps is false', () => {
      expect(() =>
        validatePresignedUrl(
          'http://storage.ksef.mf.gov.pl/file',
          policy({ requireHttps: false }),
        ),
      ).not.toThrow();
    });
  });

  describe('host whitelist', () => {
    it('passes for exact host match', () => {
      expect(() =>
        validatePresignedUrl(
          'https://storage.ksef.mf.gov.pl/file',
          policy({ allowedHosts: ['storage.ksef.mf.gov.pl'] }),
        ),
      ).not.toThrow();
    });

    it('passes for wildcard subdomain match', () => {
      expect(() =>
        validatePresignedUrl(
          'https://download.ksef.mf.gov.pl/file',
          policy({ allowedHosts: ['*.ksef.mf.gov.pl'] }),
        ),
      ).not.toThrow();
    });

    it('throws for non-matching host', () => {
      expect(() =>
        validatePresignedUrl(
          'https://evil.example.com/file',
          policy({ allowedHosts: ['*.ksef.mf.gov.pl'] }),
        ),
      ).toThrow(KSeFValidationError);
    });

    it('throws for bare domain when wildcard requires subdomain', () => {
      expect(() =>
        validatePresignedUrl(
          'https://ksef.mf.gov.pl/file',
          policy({ allowedHosts: ['*.ksef.mf.gov.pl'] }),
        ),
      ).toThrow(KSeFValidationError);
    });
  });

  describe('redirect parameter blocking', () => {
    it('throws for redirect param', () => {
      expect(() =>
        validatePresignedUrl(
          'https://storage.ksef.mf.gov.pl/file?redirect=https://evil.com',
          policy(),
        ),
      ).toThrow(KSeFValidationError);
    });

    it('throws for callback param', () => {
      expect(() =>
        validatePresignedUrl(
          'https://storage.ksef.mf.gov.pl/file?callback=https://evil.com',
          policy(),
        ),
      ).toThrow(KSeFValidationError);
    });

    it('throws for return_url param', () => {
      expect(() =>
        validatePresignedUrl(
          'https://storage.ksef.mf.gov.pl/file?return_url=https://evil.com',
          policy(),
        ),
      ).toThrow(KSeFValidationError);
    });

    it('throws for next param', () => {
      expect(() =>
        validatePresignedUrl(
          'https://storage.ksef.mf.gov.pl/file?next=https://evil.com',
          policy(),
        ),
      ).toThrow(KSeFValidationError);
    });

    it('passes for safe query params', () => {
      expect(() =>
        validatePresignedUrl(
          'https://storage.ksef.mf.gov.pl/file?token=abc&expires=123',
          policy(),
        ),
      ).not.toThrow();
    });

    it('passes for redirect param when blockRedirectParams is false', () => {
      expect(() =>
        validatePresignedUrl(
          'https://storage.ksef.mf.gov.pl/file?redirect=https://evil.com',
          policy({ blockRedirectParams: false }),
        ),
      ).not.toThrow();
    });
  });

  describe('private IP rejection', () => {
    it('throws for loopback 127.0.0.1', () => {
      expect(() =>
        validatePresignedUrl(
          'https://127.0.0.1/file',
          policy({ allowedHosts: ['127.0.0.1'] }),
        ),
      ).toThrow(KSeFValidationError);
    });

    it('throws for private 10.x range', () => {
      expect(() =>
        validatePresignedUrl(
          'https://10.0.0.5/file',
          policy({ allowedHosts: ['10.0.0.5'] }),
        ),
      ).toThrow(KSeFValidationError);
    });

    it('throws for private 172.16.x range', () => {
      expect(() =>
        validatePresignedUrl(
          'https://172.16.0.1/file',
          policy({ allowedHosts: ['172.16.0.1'] }),
        ),
      ).toThrow(KSeFValidationError);
    });

    it('throws for private 192.168.x range', () => {
      expect(() =>
        validatePresignedUrl(
          'https://192.168.1.1/file',
          policy({ allowedHosts: ['192.168.1.1'] }),
        ),
      ).toThrow(KSeFValidationError);
    });

    it('throws for link-local 169.254.x range', () => {
      expect(() =>
        validatePresignedUrl(
          'https://169.254.1.1/file',
          policy({ allowedHosts: ['169.254.1.1'] }),
        ),
      ).toThrow(KSeFValidationError);
    });

    it('throws for IPv6 loopback ::1', () => {
      expect(() =>
        validatePresignedUrl(
          'https://[::1]/file',
          policy({ allowedHosts: ['[::1]'] }),
        ),
      ).toThrow(KSeFValidationError);
    });

    it('passes for public IP address', () => {
      expect(() =>
        validatePresignedUrl(
          'https://52.123.45.67/file',
          policy({ allowedHosts: ['52.123.45.67'] }),
        ),
      ).not.toThrow();
    });

    it('passes for private IP when rejectPrivateIps is false', () => {
      expect(() =>
        validatePresignedUrl(
          'https://10.0.0.5/file',
          policy({ allowedHosts: ['10.0.0.5'], rejectPrivateIps: false }),
        ),
      ).not.toThrow();
    });
  });

  describe('error messages', () => {
    it('includes HTTPS in message when protocol is wrong', () => {
      expect(() =>
        validatePresignedUrl('http://storage.ksef.mf.gov.pl/file', policy()),
      ).toThrow(/HTTPS/);
    });

    it('includes hostname in message when host is not allowed', () => {
      expect(() =>
        validatePresignedUrl('https://evil.example.com/file', policy()),
      ).toThrow(/evil\.example\.com/);
    });

    it('includes param name in message when redirect param is blocked', () => {
      expect(() =>
        validatePresignedUrl(
          'https://storage.ksef.mf.gov.pl/file?redirect=x',
          policy(),
        ),
      ).toThrow(/redirect/);
    });

    it('includes IP in message when private IP is rejected', () => {
      expect(() =>
        validatePresignedUrl(
          'https://192.168.1.1/file',
          policy({ allowedHosts: ['192.168.1.1'] }),
        ),
      ).toThrow(/192\.168\.1\.1/);
    });
  });
});
