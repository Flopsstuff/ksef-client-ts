# public-key-rotation

## Purpose

Handle KSeF public-key certificate rotation: expose key identifiers from the certificate list, select the correct currently-valid certificate per encryption usage, carry the chosen key's identifier in encryption requests, and recover from unknown/revoked key errors.

## Requirements

### Requirement: Public certificate model exposes key identifiers

The `PublicKeyCertificate` model SHALL include `publicKeyId` (string — the KSeF-supplied SHA-256 of the
certificate's `SubjectPublicKeyInfo`, Base64-encoded) and `certificateId` (string) as returned by
`GET /security/public-key-certificates`. These values SHALL be taken verbatim from the API response and
MUST NOT be recomputed by the client.

#### Scenario: Identifiers parsed from the certificate list response
- **WHEN** the certificate list endpoint returns a certificate with `publicKeyId` and `certificateId`
- **THEN** the parsed `PublicKeyCertificate` SHALL expose both values unchanged

#### Scenario: One usage per certificate is supported
- **WHEN** the endpoint returns separate certificates, each with a single `usage` value (`KsefTokenEncryption` or `SymmetricKeyEncryption`)
- **THEN** the client SHALL select per usage independently without requiring a certificate to declare both usages

### Requirement: Rotation-safe certificate selection

For each encryption usage, the certificate fetcher SHALL select the certificate whose validity window
covers the current time (`validFrom` ≤ now < `validTo`) and, among those, the one with the latest
`validFrom`. The fetcher SHALL cache the selected certificate's PEM together with its `publicKeyId` per
usage.

#### Scenario: Newest currently-valid certificate is chosen
- **WHEN** two certificates for the same usage are currently valid with overlapping windows
- **THEN** the fetcher SHALL select the one with the later `validFrom`

#### Scenario: Expired or not-yet-valid certificates are ignored
- **WHEN** a certificate's window has ended (`validTo` ≤ now) or has not started (`validFrom` > now)
- **THEN** the fetcher SHALL NOT select it while another valid certificate exists

#### Scenario: No currently-valid certificate
- **WHEN** no certificate for a usage is currently valid
- **THEN** the fetcher SHALL fall back to the certificate with the latest `validFrom` so the server can reject it with a clear error rather than the client sending nothing

### Requirement: Encryption requests carry the public key selector

When the client encrypts data with a KSeF public key, the resulting request SHALL include the
`publicKeyId` of the certificate used. This applies to authentication by KSeF token, online session
open, batch session open, and invoice export. The symmetric-key encryption info SHALL carry the
`SymmetricKeyEncryption` certificate's `publicKeyId`; the KSeF-token request SHALL carry the
`KsefTokenEncryption` certificate's `publicKeyId`.

#### Scenario: Session open includes the symmetric public key id
- **WHEN** an online or batch session is opened with encryption
- **THEN** the request's encryption info SHALL include the `publicKeyId` of the symmetric-key certificate that encrypted the symmetric key

#### Scenario: Invoice export includes the symmetric public key id
- **WHEN** an invoice export is requested with encryption
- **THEN** the export request's encryption info SHALL include the symmetric-key certificate's `publicKeyId`

#### Scenario: KSeF token auth includes the token public key id
- **WHEN** authentication by KSeF token encrypts the token
- **THEN** the auth-token request SHALL include the `publicKeyId` of the KSeF-token-encryption certificate

### Requirement: Recovery from unknown or revoked public key

The client SHALL treat an HTTP 400 response carrying error code `21470` (the supplied public key
identifier is unknown or revoked) as a distinct, typed error. Operations that build encryption material
(token auth, session open, invoice export) SHALL, upon this error, refresh the cached certificates and
retry the operation exactly once with freshly selected keys. A second failure SHALL be propagated to
the caller.

#### Scenario: Typed error on unknown key id
- **WHEN** a request returns HTTP 400 with error code `21470`
- **THEN** the client SHALL raise a typed unknown-public-key error distinguishable from other 400 errors

#### Scenario: Refresh-and-retry once
- **WHEN** an encryption-bearing operation receives the `21470` error
- **THEN** the client SHALL refresh the certificate cache, rebuild the encryption material with the newly selected key, and retry the operation once

#### Scenario: Second failure propagates
- **WHEN** the retried operation again returns the `21470` error
- **THEN** the client SHALL propagate the error to the caller and SHALL NOT retry further
