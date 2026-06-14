import type { ContextIdentifier } from '../models/common.js';
import type { XadesSubjectIdentifierType } from '../models/auth/types.js';

export interface AuthTokenRequestXmlOptions {
  challenge: string;
  contextIdentifier: ContextIdentifier;
  subjectIdentifierType?: XadesSubjectIdentifierType;
}

const AUTH_TOKEN_REQUEST_NS = 'http://ksef.mf.gov.pl/auth/token/2.1';

/**
 * Build an unsigned KSeF auth token request XML document.
 *
 * Supports all four context identifier types: Nip, InternalId, NipVatUe, PeppolId.
 * The returned XML is ready for external signing (e.g. HSM, EPUAP, smart cards)
 * or can be signed internally via {@link SignatureService.sign}.
 */
export function buildUnsignedAuthTokenRequestXml(options: AuthTokenRequestXmlOptions): string {
  const { challenge, contextIdentifier, subjectIdentifierType = 'certificateSubject' } = options;
  const identifierElement = `<${contextIdentifier.type}>${xmlEscape(contextIdentifier.value)}</${contextIdentifier.type}>`;

  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    `<AuthTokenRequest xmlns="${AUTH_TOKEN_REQUEST_NS}">`,
    `<Challenge>${xmlEscape(challenge)}</Challenge>`,
    `<ContextIdentifier>`,
    identifierElement,
    `</ContextIdentifier>`,
    `<SubjectIdentifierType>${xmlEscape(subjectIdentifierType)}</SubjectIdentifierType>`,
    `</AuthTokenRequest>`,
  ].join('');
}

function xmlEscape(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
