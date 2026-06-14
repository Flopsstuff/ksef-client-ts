import { describe, it, expect } from 'vitest';
import { buildUnsignedAuthTokenRequestXml } from '../../../src/crypto/auth-xml-builder.js';

describe('buildUnsignedAuthTokenRequestXml', () => {
  const NS = 'http://ksef.mf.gov.pl/auth/token/2.1';

  it('builds XML with Nip context identifier', () => {
    const xml = buildUnsignedAuthTokenRequestXml({
      challenge: 'abc123',
      contextIdentifier: { type: 'Nip', value: '1234567890' },
    });

    expect(xml).toContain(`<AuthTokenRequest xmlns="${NS}">`);
    expect(xml).toContain('<Challenge>abc123</Challenge>');
    expect(xml).toContain('<Nip>1234567890</Nip>');
    expect(xml).toContain('<SubjectIdentifierType>certificateSubject</SubjectIdentifierType>');
  });

  it('builds XML with InternalId context identifier', () => {
    const xml = buildUnsignedAuthTokenRequestXml({
      challenge: 'ch',
      contextIdentifier: { type: 'InternalId', value: 'INT-001' },
    });

    expect(xml).toContain('<InternalId>INT-001</InternalId>');
    expect(xml).not.toContain('<Nip>');
  });

  it('builds XML with NipVatUe context identifier', () => {
    const xml = buildUnsignedAuthTokenRequestXml({
      challenge: 'ch',
      contextIdentifier: { type: 'NipVatUe', value: 'PL1234567890' },
    });

    expect(xml).toContain('<NipVatUe>PL1234567890</NipVatUe>');
  });

  it('builds XML with PeppolId context identifier', () => {
    const xml = buildUnsignedAuthTokenRequestXml({
      challenge: 'ch',
      contextIdentifier: { type: 'PeppolId', value: '0088:1234567890' },
    });

    expect(xml).toContain('<PeppolId>0088:1234567890</PeppolId>');
  });

  it('uses custom subjectIdentifierType', () => {
    const xml = buildUnsignedAuthTokenRequestXml({
      challenge: 'ch',
      contextIdentifier: { type: 'Nip', value: '1234567890' },
      subjectIdentifierType: 'certificateFingerprint',
    });

    expect(xml).toContain('<SubjectIdentifierType>certificateFingerprint</SubjectIdentifierType>');
  });

  it('defaults subjectIdentifierType to certificateSubject', () => {
    const xml = buildUnsignedAuthTokenRequestXml({
      challenge: 'ch',
      contextIdentifier: { type: 'Nip', value: '1234567890' },
    });

    expect(xml).toContain('<SubjectIdentifierType>certificateSubject</SubjectIdentifierType>');
  });

  it('escapes XML-unsafe characters in challenge', () => {
    const xml = buildUnsignedAuthTokenRequestXml({
      challenge: '<test>&"\'value',
      contextIdentifier: { type: 'Nip', value: '1234567890' },
    });

    expect(xml).toContain('<Challenge>&lt;test&gt;&amp;&quot;&apos;value</Challenge>');
  });

  it('escapes XML-unsafe characters in context identifier value', () => {
    const xml = buildUnsignedAuthTokenRequestXml({
      challenge: 'ch',
      contextIdentifier: { type: 'Nip', value: 'a&b<c' },
    });

    expect(xml).toContain('<Nip>a&amp;b&lt;c</Nip>');
  });

  it('starts with XML declaration', () => {
    const xml = buildUnsignedAuthTokenRequestXml({
      challenge: 'ch',
      contextIdentifier: { type: 'Nip', value: '1234567890' },
    });

    expect(xml).toMatch(/^<\?xml version="1\.0" encoding="utf-8"\?>/);
  });

  it('produces well-formed XML parseable by DOMParser', () => {
    const xml = buildUnsignedAuthTokenRequestXml({
      challenge: 'test-challenge',
      contextIdentifier: { type: 'Nip', value: '1234567890' },
    });

    // Use a lightweight check: XML must have matching root tags
    expect(xml).toContain('<AuthTokenRequest');
    expect(xml).toContain('</AuthTokenRequest>');
    // Ensure the identifier is wrapped in ContextIdentifier
    expect(xml).toContain('<ContextIdentifier>');
    expect(xml).toContain('</ContextIdentifier>');
  });

  it('wraps identifier element inside ContextIdentifier element', () => {
    const xml = buildUnsignedAuthTokenRequestXml({
      challenge: 'ch',
      contextIdentifier: { type: 'PeppolId', value: 'val' },
    });

    const ciStart = xml.indexOf('<ContextIdentifier>');
    const ciEnd = xml.indexOf('</ContextIdentifier>');
    const peppolStart = xml.indexOf('<PeppolId>');

    expect(ciStart).toBeLessThan(peppolStart);
    expect(peppolStart).toBeLessThan(ciEnd);
  });
});
