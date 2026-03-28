import { describe, it, expect } from 'vitest';
import { decodeJwtPayload, parseKSeFTokenContext } from '../../../src/utils/jwt.js';

function buildTestJwt(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${header}.${body}.signature`;
}

describe('decodeJwtPayload', () => {
  it('decodes a valid JWT payload', () => {
    const payload = { sub: '12345', name: 'Test' };
    const token = buildTestJwt(payload);
    expect(decodeJwtPayload(token)).toEqual(payload);
  });

  it('returns null for a non-JWT string', () => {
    expect(decodeJwtPayload('not-a-jwt')).toBeNull();
  });

  it('returns null for too few segments', () => {
    expect(decodeJwtPayload('abc.def')).toBeNull();
  });

  it('returns null for too many segments', () => {
    expect(decodeJwtPayload('a.b.c.d')).toBeNull();
  });

  it('returns null for invalid base64 payload', () => {
    expect(decodeJwtPayload('header.!!!invalid!!!.sig')).toBeNull();
  });

  it('returns null for valid base64 but not JSON', () => {
    const notJson = Buffer.from('not json at all').toString('base64url');
    expect(decodeJwtPayload(`header.${notJson}.sig`)).toBeNull();
  });

  it('handles base64url characters (- and _)', () => {
    // Payload with values that produce + and / in standard base64
    const payload = { data: '>>>???<<<' };
    const token = buildTestJwt(payload);
    expect(decodeJwtPayload(token)).toEqual(payload);
  });

  it('handles payload without padding', () => {
    // Short payload that may lack = padding in base64url
    const payload = { a: 1 };
    const token = buildTestJwt(payload);
    // Verify no padding in the token's payload segment
    const payloadSegment = token.split('.')[1]!;
    expect(payloadSegment).not.toContain('=');
    expect(decodeJwtPayload(token)).toEqual(payload);
  });

  it('returns null for empty payload segment', () => {
    expect(decodeJwtPayload('header..signature')).toBeNull();
  });
});

describe('parseKSeFTokenContext', () => {
  it('maps all KSeF JWT claims', () => {
    const token = buildTestJwt({
      typ: 'ContextToken',
      cit: 'Nip',
      civ: '8952265388',
      aum: 'TrustedProfile',
      per: '["InvoiceRead","InvoiceWrite"]',
      sud: '{"subjectIdentifier":{"type":"Nip","value":"8952265388"}}',
      asi: '{"type":"Nip","value":"8952239037"}',
      iat: 1774735648,
      exp: 1774736548,
    });

    expect(parseKSeFTokenContext(token)).toEqual({
      type: 'ContextToken',
      contextIdentifierType: 'Nip',
      contextIdentifierValue: '8952265388',
      authMethod: 'TrustedProfile',
      permissions: ['InvoiceRead', 'InvoiceWrite'],
      subjectDetails: { subjectIdentifier: { type: 'Nip', value: '8952265388' } },
      authorSubjectIdentifier: { type: 'Nip', value: '8952239037' },
      issuedAt: 1774735648,
      expiresAt: 1774736548,
    });
  });

  it('handles partial claims', () => {
    const token = buildTestJwt({ cit: 'Nip', civ: '1234567890' });
    const ctx = parseKSeFTokenContext(token)!;
    expect(ctx.contextIdentifierType).toBe('Nip');
    expect(ctx.contextIdentifierValue).toBe('1234567890');
    expect(ctx.type).toBeUndefined();
    expect(ctx.authMethod).toBeUndefined();
    expect(ctx.permissions).toBeUndefined();
    expect(ctx.subjectDetails).toBeUndefined();
  });

  it('handles malformed per field', () => {
    const token = buildTestJwt({ civ: '1234567890', per: 'not-json' });
    const ctx = parseKSeFTokenContext(token)!;
    expect(ctx.contextIdentifierValue).toBe('1234567890');
    expect(ctx.permissions).toBeUndefined();
  });

  it('handles malformed sud field', () => {
    const token = buildTestJwt({ civ: '1234567890', sud: '{broken' });
    const ctx = parseKSeFTokenContext(token)!;
    expect(ctx.contextIdentifierValue).toBe('1234567890');
    expect(ctx.subjectDetails).toBeUndefined();
  });

  it('returns null for non-JWT input', () => {
    expect(parseKSeFTokenContext('not-a-jwt')).toBeNull();
  });

  it('returns object with all undefined fields for empty JWT payload', () => {
    const token = buildTestJwt({});
    const ctx = parseKSeFTokenContext(token)!;
    expect(ctx).toBeDefined();
    expect(ctx.type).toBeUndefined();
    expect(ctx.contextIdentifierType).toBeUndefined();
    expect(ctx.contextIdentifierValue).toBeUndefined();
    expect(ctx.authMethod).toBeUndefined();
    expect(ctx.permissions).toBeUndefined();
  });
});
