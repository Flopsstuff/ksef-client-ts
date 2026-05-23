## MODIFIED Requirements

### Requirement: Build unsigned auth token request XML

The system SHALL provide a public `buildUnsignedAuthTokenRequestXml(options)` function that generates a valid KSeF auth token request XML document without a signature. The function SHALL accept an options object with `challenge` (string), `contextIdentifier` (ContextIdentifier with type and value), and optional `subjectIdentifierType` (defaults to `'certificateSubject'`). The XML SHALL conform to the `http://ksef.mf.gov.pl/auth/token/2.1` namespace schema.

#### Scenario: Build XML with Nip context identifier
- **WHEN** `buildUnsignedAuthTokenRequestXml` is called with `challenge: "abc123"`, `contextIdentifier: { type: 'Nip', value: '1234567890' }`
- **THEN** the returned XML SHALL contain `<Nip>1234567890</Nip>` inside `<ContextIdentifier>`, the challenge value in `<Challenge>`, `<SubjectIdentifierType>certificateSubject</SubjectIdentifierType>`, and the `http://ksef.mf.gov.pl/auth/token/2.1` namespace on the root element

#### Scenario: Build XML with InternalId context identifier
- **WHEN** `buildUnsignedAuthTokenRequestXml` is called with `contextIdentifier: { type: 'InternalId', value: 'INT-001' }`
- **THEN** the returned XML SHALL contain `<InternalId>INT-001</InternalId>` inside `<ContextIdentifier>`

#### Scenario: Build XML with NipVatUe context identifier
- **WHEN** `buildUnsignedAuthTokenRequestXml` is called with `contextIdentifier: { type: 'NipVatUe', value: 'PL1234567890' }`
- **THEN** the returned XML SHALL contain `<NipVatUe>PL1234567890</NipVatUe>` inside `<ContextIdentifier>`

#### Scenario: Build XML with PeppolId context identifier
- **WHEN** `buildUnsignedAuthTokenRequestXml` is called with `contextIdentifier: { type: 'PeppolId', value: '0088:1234567890' }`
- **THEN** the returned XML SHALL contain `<PeppolId>0088:1234567890</PeppolId>` inside `<ContextIdentifier>`

#### Scenario: Custom subject identifier type
- **WHEN** `buildUnsignedAuthTokenRequestXml` is called with `subjectIdentifierType: 'certificateFingerprint'`
- **THEN** the returned XML SHALL contain `<SubjectIdentifierType>certificateFingerprint</SubjectIdentifierType>`

#### Scenario: XML-unsafe characters in values are escaped
- **WHEN** `buildUnsignedAuthTokenRequestXml` is called with a challenge containing `<`, `>`, `&`, `"`, or `'`
- **THEN** the returned XML SHALL escape those characters to their XML entity equivalents

#### Scenario: XML includes declaration and is well-formed
- **WHEN** `buildUnsignedAuthTokenRequestXml` is called with any valid options
- **THEN** the returned XML SHALL start with `<?xml version="1.0" encoding="utf-8"?>` and SHALL be parseable by a standard XML parser
