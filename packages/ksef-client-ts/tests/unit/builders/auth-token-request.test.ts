import { describe, it, expect } from 'vitest';
import { AuthTokenRequestBuilder } from '../../../src/builders/auth-token-request.js';
import { KSeFValidationError } from '../../../src/errors/index.js';

describe('AuthTokenRequestBuilder', () => {
  const validBuilder = () =>
    new AuthTokenRequestBuilder()
      .withChallenge('challenge-123')
      .withContextNip('1234567890')
      .withSubjectType('Person');

  it('should build a valid request', () => {
    const req = validBuilder().build();
    expect(req).toEqual({
      challenge: 'challenge-123',
      contextIdentifier: { type: 'Nip', value: '1234567890' },
      subjectIdentifierType: 'Person',
    });
  });

  it('should include authorizationPolicy when set', () => {
    const req = validBuilder().withAuthorizationPolicy('DirectAuth').build();
    expect(req.authorizationPolicy).toBe('DirectAuth');
  });

  it('should support context types: Nip, InternalId, NipVatUe, PeppolId', () => {
    const nip = new AuthTokenRequestBuilder()
      .withChallenge('c').withContextNip('123').withSubjectType('Person').build();
    expect(nip.contextIdentifier).toEqual({ type: 'Nip', value: '123' });

    const internal = new AuthTokenRequestBuilder()
      .withChallenge('c').withContextInternalId('id-1').withSubjectType('Person').build();
    expect(internal.contextIdentifier).toEqual({ type: 'InternalId', value: 'id-1' });

    const vatUe = new AuthTokenRequestBuilder()
      .withChallenge('c').withContextNipVatUe('PL123').withSubjectType('Person').build();
    expect(vatUe.contextIdentifier).toEqual({ type: 'NipVatUe', value: 'PL123' });

    const peppol = new AuthTokenRequestBuilder()
      .withChallenge('c').withContextPeppolId('9906:IT123').withSubjectType('Person').build();
    expect(peppol.contextIdentifier).toEqual({ type: 'PeppolId', value: '9906:IT123' });
  });

  it('should throw KSeFValidationError when challenge missing', () => {
    const builder = new AuthTokenRequestBuilder()
      .withContextNip('123')
      .withSubjectType('Person');
    expect(() => builder.build()).toThrow(KSeFValidationError);
    expect(() => builder.build()).toThrow('Challenge is required');
  });

  it('should throw KSeFValidationError when context missing', () => {
    const builder = new AuthTokenRequestBuilder()
      .withChallenge('c')
      .withSubjectType('Person');
    expect(() => builder.build()).toThrow(KSeFValidationError);
    expect(() => builder.build()).toThrow('Context identifier is required');
  });

  it('should throw KSeFValidationError when subject type missing', () => {
    const builder = new AuthTokenRequestBuilder()
      .withChallenge('c')
      .withContextNip('123');
    expect(() => builder.build()).toThrow(KSeFValidationError);
    expect(() => builder.build()).toThrow('Subject identifier type is required');
  });

  it('should include field name in validation error details', () => {
    try {
      new AuthTokenRequestBuilder().build();
    } catch (e) {
      expect(e).toBeInstanceOf(KSeFValidationError);
      expect((e as KSeFValidationError).details[0].field).toBe('challenge');
    }
  });
});
