import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import { VerificationLinkService } from '../../../src/qr/verification-link-service.js';

const BASE_QR_URL = 'https://qr-test.ksef.mf.gov.pl';

describe('VerificationLinkService', () => {
  const service = new VerificationLinkService(BASE_QR_URL);

  describe('buildInvoiceVerificationUrl', () => {
    const nip = '1234567890';
    const hash = Buffer.from('test-hash-data-for-invoice').toString('base64');

    it('should build correct URL format with Date object', () => {
      const date = new Date(Date.UTC(2024, 0, 15)); // Jan 15, 2024
      const url = service.buildInvoiceVerificationUrl(nip, date, hash);

      expect(url).toContain(`${BASE_QR_URL}/invoice/${nip}/15-01-2024/`);
    });

    it('should build correct URL format with ISO string', () => {
      const url = service.buildInvoiceVerificationUrl(nip, '2024-03-22T00:00:00Z', hash);

      expect(url).toContain(`${BASE_QR_URL}/invoice/${nip}/22-03-2024/`);
    });

    it('should format date as DD-MM-YYYY', () => {
      const date = new Date(Date.UTC(2024, 11, 5)); // Dec 5, 2024
      const url = service.buildInvoiceVerificationUrl(nip, date, hash);

      expect(url).toMatch(/\/05-12-2024\//);
    });

    it('throws on an unparseable date instead of emitting a NaN-NaN-NaN segment', () => {
      expect(() => service.buildInvoiceVerificationUrl(nip, '', hash)).toThrow(/Invalid issueDate/);
      expect(() => service.buildInvoiceVerificationUrl(nip, 'not-a-date', hash)).toThrow(/Invalid issueDate/);
    });

    // A date that does not exist parses fine and rolls forward, so the code
    // would carry a different issue date than the invoice — and only a scan
    // would reveal it.
    it('throws on a date that does not exist rather than rolling it forward', () => {
      expect(() => service.buildInvoiceVerificationUrl(nip, '2026-02-30', hash)).toThrow(
        /not a real calendar date/,
      );
      expect(() => service.buildInvoiceVerificationUrl(nip, '2026-13-01', hash)).toThrow(
        /Invalid issueDate/,
      );
      expect(() => service.buildInvoiceVerificationUrl(nip, '2025-02-29', hash)).toThrow(
        /not a real calendar date/,
      );
    });

    it('accepts the leap day of an actual leap year', () => {
      expect(service.buildInvoiceVerificationUrl(nip, '2024-02-29', hash)).toMatch(/\/29-02-2024\//);
    });

    // The check reads the written calendar fields, so the form the date arrives
    // in does not matter — a timestamp hides the same impossible day.
    it('rejects an impossible day carrying a time as well', () => {
      for (const value of ['2026-02-30T00:00:00Z', '2026-02-30T12:34:56+01:00', '2026-04-31T09:00:00Z']) {
        expect(() => service.buildInvoiceVerificationUrl(nip, value, hash), value).toThrow(
          /not a real calendar date/,
        );
      }
    });

    // Comparing the written date against the parsed UTC one would refuse these:
    // with an offset the two legitimately fall on different days.
    it('accepts a real date whose UTC day differs from the written one', () => {
      expect(service.buildInvoiceVerificationUrl(nip, '2026-01-01T00:30:00+01:00', hash)).toMatch(
        /\/31-12-2025\//,
      );
      expect(service.buildInvoiceVerificationUrl(nip, '2026-12-31T23:30:00-05:00', hash)).toMatch(
        /\/01-01-2027\//,
      );
    });

    it('leaves a date carrying a time, and a caller-built Date, alone', () => {
      expect(service.buildInvoiceVerificationUrl(nip, '2024-01-01T00:00:00Z', hash)).toMatch(
        /\/01-01-2024\//,
      );
      const built = new Date(Date.UTC(2024, 0, 31));
      expect(service.buildInvoiceVerificationUrl(nip, built, hash)).toMatch(/\/31-01-2024\//);
    });

    it('should use Base64URL encoding without padding', () => {
      const url = service.buildInvoiceVerificationUrl(nip, '2024-01-01T00:00:00Z', hash);

      const hashPart = url.split('/').pop()!;
      expect(hashPart).not.toContain('+');
      expect(hashPart).not.toContain('/');
      expect(hashPart).not.toContain('=');
    });
  });

  describe('buildCertificateVerificationUrl', () => {
    it('should build correct URL with RSA-2048 key', () => {
      const { privateKey } = crypto.generateKeyPairSync('rsa', {
        modulusLength: 2048,
      });
      const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;
      const hash = Buffer.from('test-hash').toString('base64');

      const url = service.buildCertificateVerificationUrl(
        'Nip', '1234567890', '9876543210', 'CERT001', hash, pem,
      );

      const parts = url.replace(`${BASE_QR_URL}/certificate/`, '').split('/');
      expect(parts).toHaveLength(6); // contextType/contextId/sellerNip/certSerial/hash/signature
      expect(parts[0]).toBe('Nip');
      expect(parts[1]).toBe('1234567890');
      expect(parts[2]).toBe('9876543210');
      expect(parts[3]).toBe('CERT001');
      // Verify base64url encoding (no +, /, =)
      expect(parts[4]).not.toMatch(/[+/=]/);
      expect(parts[5]).not.toMatch(/[+/=]/);
    });

    it('should build correct URL with ECDSA P-256 key', () => {
      const { privateKey } = crypto.generateKeyPairSync('ec', {
        namedCurve: 'P-256',
      });
      const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;
      const hash = Buffer.from('test-hash').toString('base64');

      const url = service.buildCertificateVerificationUrl(
        'Nip', '1234567890', '9876543210', 'CERT002', hash, pem,
      );

      const parts = url.replace(`${BASE_QR_URL}/certificate/`, '').split('/');
      expect(parts).toHaveLength(6);
      // ECDSA P-256 signature should be shorter than RSA-2048
      expect(parts[5].length).toBeLessThan(400);
      expect(parts[5]).not.toMatch(/[+/=]/);
    });

    it('should throw for unsupported key type', () => {
      const { privateKey } = crypto.generateKeyPairSync('ed25519');
      const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;
      const hash = Buffer.from('test-hash').toString('base64');

      expect(() =>
        service.buildCertificateVerificationUrl(
          'Nip', '1234567890', '9876543210', 'CERT003', hash, pem,
        ),
      ).toThrow('Unsupported key type');
    });

    it('should accept encrypted RSA PEM with correct passphrase', () => {
      const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
      const encryptedPem = privateKey.export({
        type: 'pkcs8',
        format: 'pem',
        cipher: 'aes-256-cbc',
        passphrase: 's3cret',
      }) as string;
      const hash = Buffer.from('test-hash').toString('base64');

      const url = service.buildCertificateVerificationUrl(
        'Nip', '1234567890', '1234567890', 'SERIAL', hash, encryptedPem, 's3cret',
      );
      expect(url).toMatch(/\/certificate\/Nip\/1234567890\/1234567890\/SERIAL\//);
      expect(url.split('/').pop()).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    it('should accept encrypted EC P-256 PEM with correct passphrase', () => {
      const { privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
      const encryptedPem = privateKey.export({
        type: 'pkcs8',
        format: 'pem',
        cipher: 'aes-256-cbc',
        passphrase: 's3cret',
      }) as string;
      const hash = Buffer.from('test-hash').toString('base64');

      const url = service.buildCertificateVerificationUrl(
        'Nip', '1234567890', '1234567890', 'SERIAL', hash, encryptedPem, 's3cret',
      );
      expect(url).toMatch(/\/certificate\//);
      expect(url.split('/').pop()).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    it('should throw on encrypted PEM without passphrase', () => {
      const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
      const encryptedPem = privateKey.export({
        type: 'pkcs8',
        format: 'pem',
        cipher: 'aes-256-cbc',
        passphrase: 's3cret',
      }) as string;
      const hash = Buffer.from('test-hash').toString('base64');

      expect(() =>
        service.buildCertificateVerificationUrl(
          'Nip', '1234567890', '1234567890', 'SERIAL', hash, encryptedPem,
        ),
      ).toThrow(/passphrase|decrypt|encrypted|interrupted or cancelled|decoder|unsupported|bad/i);
    });

    it('should throw on encrypted PEM with wrong passphrase (RSA)', () => {
      const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
      const encryptedPem = privateKey.export({
        type: 'pkcs8',
        format: 'pem',
        cipher: 'aes-256-cbc',
        passphrase: 's3cret',
      }) as string;
      const hash = Buffer.from('test-hash').toString('base64');

      expect(() =>
        service.buildCertificateVerificationUrl(
          'Nip', '1234567890', '1234567890', 'SERIAL', hash, encryptedPem, 'wrong',
        ),
      ).toThrow(/passphrase|decrypt|encrypted|interrupted or cancelled|decoder|unsupported|bad/i);
    });

    it('should throw on encrypted PEM with wrong passphrase (EC P-256)', () => {
      const { privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
      const encryptedPem = privateKey.export({
        type: 'pkcs8',
        format: 'pem',
        cipher: 'aes-256-cbc',
        passphrase: 's3cret',
      }) as string;
      const hash = Buffer.from('test-hash').toString('base64');

      expect(() =>
        service.buildCertificateVerificationUrl(
          'Nip', '1234567890', '1234567890', 'SERIAL', hash, encryptedPem, 'wrong',
        ),
      ).toThrow(/passphrase|decrypt|encrypted|interrupted or cancelled|decoder|unsupported|bad/i);
    });
  });
});
