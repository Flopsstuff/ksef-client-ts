import { describe, it, expect } from 'vitest';
import { AuthKsefTokenRequestBuilder } from '../../../src/builders/auth-ksef-token-request.js';
import { KSeFValidationError } from '../../../src/errors/index.js';

describe('AuthKsefTokenRequestBuilder', () => {
  const validBuilder = () =>
    new AuthKsefTokenRequestBuilder()
      .withChallenge('challenge-123')
      .withContextNip('1234567890')
      .withEncryptedToken('encrypted-token-base64');

  it('should build a valid request', () => {
    const req = validBuilder().build();
    expect(req).toEqual({
      challenge: 'challenge-123',
      contextIdentifier: { type: 'Nip', value: '1234567890' },
      encryptedToken: 'encrypted-token-base64',
    });
  });

  it('should include authorizationPolicy when set', () => {
    const req = validBuilder().withAuthorizationPolicy('DirectAuth').build();
    expect(req.authorizationPolicy).toBe('DirectAuth');
  });

  it('should throw KSeFValidationError when challenge missing', () => {
    const builder = new AuthKsefTokenRequestBuilder()
      .withContextNip('123')
      .withEncryptedToken('tok');
    expect(() => builder.build()).toThrow(KSeFValidationError);
  });

  it('should throw KSeFValidationError when context missing', () => {
    const builder = new AuthKsefTokenRequestBuilder()
      .withChallenge('c')
      .withEncryptedToken('tok');
    expect(() => builder.build()).toThrow(KSeFValidationError);
  });

  it('should throw KSeFValidationError when encrypted token missing', () => {
    const builder = new AuthKsefTokenRequestBuilder()
      .withChallenge('c')
      .withContextNip('123');
    expect(() => builder.build()).toThrow(KSeFValidationError);
    expect(() => builder.build()).toThrow('Encrypted token is required');
  });

  // Pin every context-identifier variant — one call per `withContext*`
  // convenience method so the builder's discoverable surface stays
  // coverage-covered as a regression signal.
  it.each([
    ['Nip' as const, '1234567890'],
    ['InternalId' as const, '1234567890-12345'],
    ['NipVatUe' as const, 'PL1234567890'],
    ['PeppolId' as const, '0088:1234567890'],
  ])('withContext%s sets contextIdentifier with the matching type', (type, value) => {
    const method = `withContext${type}` as const;
    const builder = new AuthKsefTokenRequestBuilder()
      .withChallenge('challenge-123')
      .withEncryptedToken('encrypted-token-base64');
    (builder[method] as (v: string) => AuthKsefTokenRequestBuilder).call(builder, value);
    const req = builder.build();
    expect(req.contextIdentifier).toEqual({ type, value });
  });
});
