import { describe, it, expect } from 'vitest';
import {
  isValidNip, isValidVatUe, isValidNipVatUe, isValidInternalId,
  isValidPeppolId, isValidReferenceNumber, isValidKsefNumber,
  isValidPesel, isValidCertificateName, isValidCertificateFingerprint,
  isValidBase64, isValidIp4Address, isValidSha256Base64,
  KsefNumberV35, KsefNumberV36, Ip4Range, Ip4Mask,
} from '../../../src/validation/index.js';

describe('isValidNip', () => {
  it('accepts valid NIP with correct checksum', () => {
    expect(isValidNip('5260250995')).toBe(true);
  });

  it('accepts another valid NIP', () => {
    expect(isValidNip('7171642051')).toBe(true);
  });

  it('rejects NIP where checksum mod 11 equals 10', () => {
    // 1234567890: weights sum = 230, 230 % 11 = 10 → always invalid
    expect(isValidNip('1234567890')).toBe(false);
  });

  it('rejects NIP with wrong check digit', () => {
    // 5260250995 is valid; changing last digit to 6 makes it invalid
    expect(isValidNip('5260250996')).toBe(false);
  });

  it('rejects NIP with leading zero', () => {
    expect(isValidNip('0123456789')).toBe(false);
  });

  it('rejects too short string', () => {
    expect(isValidNip('123')).toBe(false);
  });

  it('rejects letters', () => {
    expect(isValidNip('abcdefghij')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isValidNip('')).toBe(false);
  });
});

describe('isValidPesel', () => {
  it('accepts valid PESEL with correct checksum', () => {
    // 02070803628: checksum = (10 - 132%10)%10 = 8, last digit = 8
    expect(isValidPesel('02070803628')).toBe(true);
  });

  it('accepts another valid PESEL', () => {
    // 44051401458: checksum = (10 - 102%10)%10 = 8, last digit = 8
    expect(isValidPesel('44051401458')).toBe(true);
  });

  it('rejects PESEL with wrong check digit', () => {
    // 83040321490: format valid, but checksum = 4, last digit = 0
    expect(isValidPesel('83040321490')).toBe(false);
  });

  it('rejects PESEL with correct format but altered check digit', () => {
    // 02070803628 is valid; changing last digit to 9
    expect(isValidPesel('02070803629')).toBe(false);
  });

  it('rejects PESEL with invalid month 13', () => {
    expect(isValidPesel('83130021490')).toBe(false);
  });

  it('rejects too short string', () => {
    expect(isValidPesel('1234')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isValidPesel('')).toBe(false);
  });
});

describe('isValidVatUe', () => {
  it('accepts Austrian VAT', () => {
    expect(isValidVatUe('ATU12345678')).toBe(true);
  });

  it('accepts German VAT', () => {
    expect(isValidVatUe('DE123456789')).toBe(true);
  });

  it('accepts Croatian VAT', () => {
    expect(isValidVatUe('HR12345678901')).toBe(true);
  });

  it('rejects invalid country prefix', () => {
    expect(isValidVatUe('XX123')).toBe(false);
  });

  it('rejects too short Austrian VAT', () => {
    expect(isValidVatUe('AT123')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isValidVatUe('')).toBe(false);
  });
});

describe('isValidNipVatUe', () => {
  it('accepts valid NIP-VAT combination', () => {
    expect(isValidNipVatUe('5260250995-ATU12345678')).toBe(true);
  });

  it('rejects invalid NIP part', () => {
    expect(isValidNipVatUe('0123456789-ATU12345678')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isValidNipVatUe('')).toBe(false);
  });
});

describe('isValidInternalId', () => {
  it('accepts valid NIP-5digit format', () => {
    expect(isValidInternalId('5260250995-12345')).toBe(true);
  });

  it('rejects invalid NIP part', () => {
    expect(isValidInternalId('0123456789-12345')).toBe(false);
  });

  it('rejects short suffix', () => {
    expect(isValidInternalId('1234567890-123')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isValidInternalId('')).toBe(false);
  });
});

describe('isValidPeppolId', () => {
  it('accepts valid Peppol ID', () => {
    expect(isValidPeppolId('PPL123456')).toBe(true);
  });

  it('rejects digits instead of letters', () => {
    expect(isValidPeppolId('P12345678')).toBe(false);
  });

  it('rejects wrong prefix', () => {
    expect(isValidPeppolId('XABC123456')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isValidPeppolId('')).toBe(false);
  });
});

describe('isValidReferenceNumber', () => {
  it('accepts valid reference number', () => {
    expect(isValidReferenceNumber('20260308-AU-0123456789-0123456789-AB')).toBe(true);
  });

  it('rejects truncated reference', () => {
    expect(isValidReferenceNumber('20260308-AU-0123456789')).toBe(false);
  });

  it('rejects lowercase hex', () => {
    expect(isValidReferenceNumber('20260308-AU-0123456789-0123456789-ab')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isValidReferenceNumber('')).toBe(false);
  });
});

describe('isValidKsefNumber', () => {
  it('accepts valid KSeF number without optional hyphen', () => {
    expect(isValidKsefNumber('1234567890-20260301-AABBCC-DDEE11-22')).toBe(true);
  });

  it('accepts valid KSeF number with contiguous hex groups', () => {
    expect(isValidKsefNumber('1234567890-20260301-AABBCCDDEE11-22')).toBe(true);
  });

  it('rejects invalid NIP part', () => {
    expect(isValidKsefNumber('0123456789-20260301-AABBCC-DDEE11-22')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isValidKsefNumber('')).toBe(false);
  });
});

describe('isValidCertificateName', () => {
  it('accepts alphanumeric with dashes and underscores', () => {
    expect(isValidCertificateName('Test-Name_123')).toBe(true);
  });

  it('accepts Polish characters', () => {
    expect(isValidCertificateName('Łódź ąęść')).toBe(true);
  });

  it('rejects special characters', () => {
    expect(isValidCertificateName('name@!')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isValidCertificateName('')).toBe(false);
  });
});

describe('isValidCertificateFingerprint', () => {
  it('accepts 64 uppercase hex chars', () => {
    expect(isValidCertificateFingerprint('A'.repeat(64))).toBe(true);
  });

  it('rejects 63 chars', () => {
    expect(isValidCertificateFingerprint('A'.repeat(63))).toBe(false);
  });

  it('rejects lowercase hex', () => {
    expect(isValidCertificateFingerprint('a'.repeat(64))).toBe(false);
  });

  it('rejects non-hex chars', () => {
    expect(isValidCertificateFingerprint('G'.repeat(64))).toBe(false);
  });
});

describe('isValidBase64', () => {
  it('accepts valid base64 with padding', () => {
    expect(isValidBase64('SGVsbG8=')).toBe(true);
  });

  it('accepts valid base64 with double padding', () => {
    expect(isValidBase64('dGVzdA==')).toBe(true);
  });

  it('rejects invalid characters', () => {
    expect(isValidBase64('not base64!!')).toBe(false);
  });

  it('accepts empty string (trivially valid base64)', () => {
    expect(isValidBase64('')).toBe(true);
  });
});

describe('isValidIp4Address', () => {
  it('accepts 192.168.1.1', () => {
    expect(isValidIp4Address('192.168.1.1')).toBe(true);
  });

  it('accepts 0.0.0.0', () => {
    expect(isValidIp4Address('0.0.0.0')).toBe(true);
  });

  it('accepts 255.255.255.255', () => {
    expect(isValidIp4Address('255.255.255.255')).toBe(true);
  });

  it('rejects octet > 255', () => {
    expect(isValidIp4Address('256.1.1.1')).toBe(false);
  });

  it('rejects non-numeric', () => {
    expect(isValidIp4Address('abc')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isValidIp4Address('')).toBe(false);
  });
});

describe('isValidSha256Base64', () => {
  it('accepts 43 base64 chars + = pad (44 total)', () => {
    expect(isValidSha256Base64('A'.repeat(43) + '=')).toBe(true);
  });

  it('rejects 43 chars without padding', () => {
    expect(isValidSha256Base64('A'.repeat(43))).toBe(false);
  });

  it('rejects 45 chars', () => {
    expect(isValidSha256Base64('A'.repeat(44) + '=')).toBe(false);
  });
});

describe('Ip4Range pattern', () => {
  it('matches valid IP range', () => {
    expect(Ip4Range.test('192.168.1.1-192.168.1.255')).toBe(true);
  });

  it('rejects single IP without range', () => {
    expect(Ip4Range.test('192.168.1.1')).toBe(false);
  });

  it('rejects missing end address', () => {
    expect(Ip4Range.test('192.168.1.1-')).toBe(false);
  });
});

describe('Ip4Mask pattern', () => {
  it('matches valid CIDR /24', () => {
    expect(Ip4Mask.test('192.168.1.0/24')).toBe(true);
  });

  it('matches valid CIDR /8', () => {
    expect(Ip4Mask.test('10.0.0.0/8')).toBe(true);
  });

  it('matches /0', () => {
    expect(Ip4Mask.test('0.0.0.0/0')).toBe(true);
  });

  it('rejects /33 (out of range)', () => {
    expect(Ip4Mask.test('192.168.1.0/33')).toBe(false);
  });

  it('rejects missing slash', () => {
    expect(Ip4Mask.test('192.168.1.0')).toBe(false);
  });
});

describe('KsefNumberV35 pattern', () => {
  it('matches NIP-based V35 number', () => {
    expect(KsefNumberV35.test('1234567890-20260301-AABBCCDDEE11-22')).toBe(true);
  });

  it('matches M-prefixed V35 number', () => {
    expect(KsefNumberV35.test('M123456789-20260301-AABBCCDDEE11-22')).toBe(true);
  });

  it('matches 3-letter prefix V35 number', () => {
    expect(KsefNumberV35.test('ABC1234567-20260301-AABBCCDDEE11-22')).toBe(true);
  });

  it('rejects invalid format', () => {
    expect(KsefNumberV35.test('123-20260301-AABBCCDDEE11-22')).toBe(false);
  });
});

describe('KsefNumberV36 pattern', () => {
  it('matches NIP-based V36 number with mandatory hyphens', () => {
    expect(KsefNumberV36.test('1234567890-20260301-AABBCC-DDEE11-22')).toBe(true);
  });

  it('matches M-prefixed V36 number', () => {
    expect(KsefNumberV36.test('M123456789-20260301-AABBCC-DDEE11-22')).toBe(true);
  });

  it('rejects V36 without middle hyphen', () => {
    expect(KsefNumberV36.test('1234567890-20260301-AABBCCDDEE11-22')).toBe(false);
  });
});
