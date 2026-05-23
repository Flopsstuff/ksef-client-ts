# External Signing

Authentication with the KSeF API using external signing devices: HSM, smart cards, cloud KMS, and EPUAP trusted profiles.

---

## Overview

KSeF authentication via qualified electronic signatures (QES) requires signing an XML challenge with an X.509 certificate. When the private key is available as a PEM file, the library handles signing internally via `SignatureService.sign()`. However, in enterprise environments, qualified signing keys are stored on hardware that **cannot export private keys**:

- **Smart cards** (e.g., Polish `e-dowod`, Certum SCU) accessible only via PKCS#11 middleware
- **HSM appliances** (Thales Luna, Utimaco, nCipher) where keys never leave the device
- **Cloud KMS** (Azure Key Vault, AWS CloudHSM, Google Cloud KMS) where signing is a remote API call
- **EPUAP trusted profiles** with external signing delegation

For these cases, the library provides a **generate-sign-submit** flow: it generates the unsigned XML, hands it off to your external signer, and then submits the signed result to KSeF.

---

## Use Cases

| Scenario | Key location | Signing tool |
|----------|-------------|-------------|
| Smart card (PKCS#11) | Hardware token (USB/NFC) | `pkcs11-tool`, `xmlsec1`, or PKCS#11 SDK |
| HSM appliance | On-premises HSM | Vendor SDK (Thales, Utimaco) or PKCS#11 |
| Azure Key Vault | Azure cloud | `@azure/keyvault-keys` SDK |
| AWS CloudHSM / KMS | AWS cloud | `aws-sdk` KMS `sign()` |
| Google Cloud KMS | GCP cloud | `@google-cloud/kms` SDK |
| EPUAP (trusted profile) | Government identity provider | EPUAP external signing API |
| Remote signing service | Third-party signing service | Service-specific REST/SOAP API |

---

## How It Works

The external signing flow has four steps:

```
                     Your Application
                           │
          ┌────────────────┼────────────────┐
          │                │                │
          ▼                ▼                ▼
  ┌──────────────┐  ┌─────────────┐  ┌──────────────┐
  │ 1. Challenge │  │ 2. Generate │  │ 4. Submit    │
  │    request   │  │    unsigned │  │    signed    │
  │              │  │    XML      │  │    XML       │
  │ getChallenge │  │ buildUnsig- │  │ submitXades- │
  │   ()         │  │ nedAuthTok- │  │ AuthRequest  │
  │              │  │ enRequestXml│  │   ()         │
  └──────┬───────┘  └──────┬──────┘  └──────┬───────┘
         │                 │                │
         │                 ▼                │
         │        ┌──────────────┐          │
         │        │ 3. External  │          │
         │        │    signer    │          │
         │        │ (HSM / smart │          │
         │        │  card / KMS) │          │
         │        └──────┬───────┘          │
         │               │ signed XML       │
         │               └──────────────────┘
         │                                  │
         ▼                                  ▼
  KSeF API /auth/challenge        KSeF API /auth/xades-signature
                                            │
                                            ▼
                                  Poll /auth/{ref} until ready
                                            │
                                            ▼
                                  Redeem /auth/token/redeem
                                            │
                                            ▼
                                  Access token + Refresh token
```

Step by step:

1. **Request a challenge** from KSeF (`AuthService.getChallenge()`). The response contains a random `challenge` string and a `timestamp`. The challenge has a limited lifetime (minutes, not hours).
2. **Generate unsigned XML** using `buildUnsignedAuthTokenRequestXml()`. This embeds the challenge and your NIP/identifier into a KSeF `AuthTokenRequest` XML document.
3. **Sign the XML externally** with a XAdES-B enveloped signature using your hardware token, HSM, or cloud KMS.
4. **Submit the signed XML** to KSeF via `AuthService.submitXadesAuthRequest()`. The library then polls for completion and redeems the access/refresh tokens.

---

## API Reference

### buildUnsignedAuthTokenRequestXml()

**File:** `src/crypto/auth-xml-builder.ts`

Generates the unsigned `AuthTokenRequest` XML document that the external signer must sign.

```typescript
import { buildUnsignedAuthTokenRequestXml } from 'ksef-client-ts';
import type { AuthTokenRequestXmlOptions } from 'ksef-client-ts';

const options: AuthTokenRequestXmlOptions = {
  challenge: 'abc123-challenge-from-ksef',
  contextIdentifier: { type: 'Nip', value: '1234567890' },
  subjectIdentifierType: 'certificateSubject', // optional, default
};

const unsignedXml: string = buildUnsignedAuthTokenRequestXml(options);
```

**Parameters (`AuthTokenRequestXmlOptions`):**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `challenge` | `string` | Yes | - | The challenge string from `AuthService.getChallenge()` |
| `contextIdentifier` | `ContextIdentifier` | Yes | - | Entity identifier (NIP, internal ID, etc.) |
| `subjectIdentifierType` | `XadesSubjectIdentifierType` | No | `'certificateSubject'` | Subject type for the XML request |

**Context identifier types** (defined as `ContextIdentifierType` in `src/models/common.ts`):

| Type | XML element | Example value | Use case |
|------|------------|---------------|----------|
| `'Nip'` | `<Nip>` | `'1234567890'` | Polish taxpayer identification number |
| `'InternalId'` | `<InternalId>` | `'INT-12345'` | KSeF internal identifier |
| `'NipVatUe'` | `<NipVatUe>` | `'PL1234567890'` | EU VAT number |
| `'PeppolId'` | `<PeppolId>` | `'9946:PL1234567890'` | Peppol participant ID |

**Output XML structure:**

```xml
<?xml version="1.0" encoding="utf-8"?>
<AuthTokenRequest xmlns="http://ksef.mf.gov.pl/auth/token/2.1">
  <Challenge>abc123-challenge-from-ksef</Challenge>
  <ContextIdentifier>
    <Nip>1234567890</Nip>
  </ContextIdentifier>
  <SubjectIdentifierType>certificateSubject</SubjectIdentifierType>
</AuthTokenRequest>
```

This XML must be signed with a XAdES-B enveloped signature before submission.

---

### authenticateWithExternalSignature()

**File:** `src/workflows/auth-workflow.ts`

High-level workflow function that orchestrates the entire external signing flow. You provide a callback (`signXml`) that receives the unsigned XML and returns the signed XML. The workflow handles everything else: challenge acquisition, XML generation, submission, polling, and token redemption.

```typescript
import { KSeFClient, authenticateWithExternalSignature } from 'ksef-client-ts';
import type { ExternalSignatureAuthOptions, AuthResult } from 'ksef-client-ts';

const client = new KSeFClient({ env: 'test' });

const result: AuthResult = await authenticateWithExternalSignature(client, {
  contextIdentifier: { type: 'Nip', value: '1234567890' },

  signXml: async (unsignedXml: string): Promise<string> => {
    // Your external signing logic here.
    // Receives the unsigned AuthTokenRequest XML.
    // Must return the same XML with a XAdES-B enveloped ds:Signature element.
    return await yourHsmSigner.signXades(unsignedXml);
  },

  // Optional settings:
  verifyCertificateChain: false,   // ask KSeF to verify cert chain
  enforceXadesCompliance: false,   // strict XAdES validation on server
  pollOptions: {
    intervalMs: 1000,     // poll every 1 second
    maxAttempts: 30,      // give up after 30 attempts
  },
});

console.log('Access token:', result.accessToken);
console.log('Valid until:', result.accessTokenValidUntil);
console.log('Refresh token:', result.refreshToken);
```

**Options (`ExternalSignatureAuthOptions`):**

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `contextIdentifier` | `ContextIdentifier` | Yes | - | Entity identifier (supports all four types) |
| `signXml` | `(xml: string) => Promise<string> \| string` | Yes | - | Callback that signs the XML externally |
| `verifyCertificateChain` | `boolean` | No | `false` | Request server-side certificate chain verification |
| `enforceXadesCompliance` | `boolean` | No | `false` | Request strict XAdES compliance validation (sends `X-KSeF-Feature: enforce-xades-compliance` header) |
| `pollOptions` | `PollOptions` | No | See below | Polling configuration for auth status |

**PollOptions** (defined in `src/workflows/types.ts`):

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `intervalMs` | `number` | `1000` | Milliseconds between poll attempts |
| `maxAttempts` | `number` | `30` | Maximum number of poll attempts before giving up |
| `onProgress` | `(attempt, max) => void` | - | Optional progress callback |

**Return value (`AuthResult`):**

| Field | Type | Description |
|-------|------|-------------|
| `accessToken` | `string` | The JWT access token for subsequent API calls |
| `accessTokenValidUntil` | `string` | ISO 8601 expiration timestamp |
| `refreshToken` | `string` | The JWT refresh token |
| `refreshTokenValidUntil` | `string` | ISO 8601 expiration timestamp |

After `authenticateWithExternalSignature()` completes, the client's `AuthManager` is automatically populated with the access and refresh tokens. The client is ready for authenticated API calls.

**Internal flow:**

```
authenticateWithExternalSignature(client, options)
  │
  ├── 1. client.auth.getChallenge()
  │       → { challenge, timestamp }
  │
  ├── 2. buildUnsignedAuthTokenRequestXml({ challenge, contextIdentifier })
  │       → unsigned XML string
  │
  ├── 3. options.signXml(unsignedXml)
  │       → signed XML string (your external signer)
  │
  ├── 4. client.auth.submitXadesAuthRequest(signedXml, ...)
  │       → { referenceNumber, authenticationToken }
  │
  ├── 5. pollUntil(client.auth.getAuthStatus(...), status.code !== 100)
  │       → waits for KSeF to validate the signature
  │
  ├── 6. client.auth.getAccessToken(authToken)
  │       → { accessToken, refreshToken }
  │
  └── 7. client.authManager.setAccessToken() / setRefreshToken()
          → client ready for authenticated calls
```

---

### AuthService.submitXadesAuthRequest()

**File:** `src/services/auth.ts`

Low-level method that submits signed XML to the KSeF `/auth/xades-signature` endpoint.

```typescript
const submitResult = await client.auth.submitXadesAuthRequest(
  signedXml,              // string: the XAdES-signed XML
  verifyCertificateChain, // boolean: default false
  enforceXadesCompliance, // boolean: default false
);

// submitResult: AuthenticationInitResponse
// {
//   referenceNumber: 'AUTH-REF-123',
//   authenticationToken: { token: 'auth-token-abc', validUntil: '...' }
// }
```

**Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `signedXml` | `string` | - | Complete XML document with embedded XAdES-B `ds:Signature` |
| `verifyCertificateChain` | `boolean` | `false` | Passed as `?verifyCertificateChain=true` query parameter |
| `enforceXadesCompliance` | `boolean` | `false` | Sends `X-KSeF-Feature: enforce-xades-compliance` header |

The request is sent as `Content-Type: application/xml`.

**Return value (`AuthenticationInitResponse`)** (defined in `src/models/auth/types.ts`):

| Field | Type | Description |
|-------|------|-------------|
| `referenceNumber` | `string` | Reference number for polling auth status |
| `authenticationToken` | `TokenInfo` | Temporary auth token (used for status polling and token redemption) |

---

## XAdES-B Signature Requirements

When signing the unsigned XML externally, the signer must produce a **XAdES-B enveloped signature** that KSeF will accept. The requirements below are derived from `SignatureService` (`src/crypto/signature-service.ts`), which is the library's internal XAdES signer.

### Signature structure

The signed XML must have a `ds:Signature` element appended as a child of the root `<AuthTokenRequest>` element (enveloped signature):

```xml
<?xml version="1.0" encoding="utf-8"?>
<AuthTokenRequest xmlns="http://ksef.mf.gov.pl/auth/token/2.1">
  <Challenge>...</Challenge>
  <ContextIdentifier>
    <Nip>1234567890</Nip>
  </ContextIdentifier>
  <SubjectIdentifierType>certificateSubject</SubjectIdentifierType>

  <ds:Signature xmlns:ds="http://www.w3.org/2000/09/xmldsig#" Id="Signature">
    <ds:SignedInfo>...</ds:SignedInfo>
    <ds:SignatureValue>...</ds:SignatureValue>
    <ds:KeyInfo>...</ds:KeyInfo>
    <ds:Object>
      <xades:QualifyingProperties>...</xades:QualifyingProperties>
    </ds:Object>
  </ds:Signature>
</AuthTokenRequest>
```

### Algorithm requirements

| Component | Algorithm URI | Description |
|-----------|-------------|-------------|
| Canonicalization | `http://www.w3.org/2001/10/xml-exc-c14n#` | Exclusive XML Canonicalization |
| Digest | `http://www.w3.org/2001/04/xmlenc#sha256` | SHA-256 |
| Signature (RSA) | `http://www.w3.org/2001/04/xmldsig-more#rsa-sha256` | RSA-SHA256 (RSASSA-PKCS1-v1_5) |
| Signature (ECDSA) | `http://www.w3.org/2001/04/xmldsig-more#ecdsa-sha256` | ECDSA-SHA256 (IEEE P1363 encoding) |
| Enveloped transform | `http://www.w3.org/2000/09/xmldsig#enveloped-signature` | Removes `ds:Signature` before digest |

### ds:SignedInfo element

Must contain exactly two `ds:Reference` elements:

**Reference 1 - Document root** (empty `URI=""`):
- Transform 1: enveloped-signature (`http://www.w3.org/2000/09/xmldsig#enveloped-signature`)
- Transform 2: exclusive canonicalization (`http://www.w3.org/2001/10/xml-exc-c14n#`)
- Digest: SHA-256 of the canonicalized root element (after removing `ds:Signature`)

**Reference 2 - SignedProperties** (`URI="#SignedProperties"`, `Type="http://uri.etsi.org/01903#SignedProperties"`):
- Transform: exclusive canonicalization
- Digest: SHA-256 of the canonicalized `xades:SignedProperties` element

```xml
<ds:SignedInfo xmlns:ds="http://www.w3.org/2000/09/xmldsig#">
  <ds:CanonicalizationMethod Algorithm="http://www.w3.org/2001/10/xml-exc-c14n#"/>
  <ds:SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha256"/>

  <!-- Reference 1: root document -->
  <ds:Reference URI="">
    <ds:Transforms>
      <ds:Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"/>
      <ds:Transform Algorithm="http://www.w3.org/2001/10/xml-exc-c14n#"/>
    </ds:Transforms>
    <ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/>
    <ds:DigestValue>base64-encoded-sha256-digest</ds:DigestValue>
  </ds:Reference>

  <!-- Reference 2: XAdES SignedProperties -->
  <ds:Reference URI="#SignedProperties" Type="http://uri.etsi.org/01903#SignedProperties">
    <ds:Transforms>
      <ds:Transform Algorithm="http://www.w3.org/2001/10/xml-exc-c14n#"/>
    </ds:Transforms>
    <ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/>
    <ds:DigestValue>base64-encoded-sha256-digest</ds:DigestValue>
  </ds:Reference>
</ds:SignedInfo>
```

### XAdES QualifyingProperties

The `ds:Object` element must contain `xades:QualifyingProperties` with:

- **SigningTime** - ISO 8601 timestamp. The library applies a -1 minute clock-skew buffer (`CLOCK_SKEW_BUFFER_MS = -60000`). Your signer should use a recent timestamp.
- **SigningCertificate** - SHA-256 digest of the signing certificate (DER-encoded), plus issuer name and serial number.

```xml
<xades:QualifyingProperties
    Target="#Signature"
    xmlns:xades="http://uri.etsi.org/01903/v1.3.2#"
    xmlns="http://www.w3.org/2000/09/xmldsig#">
  <xades:SignedProperties Id="SignedProperties">
    <xades:SignedSignatureProperties>
      <xades:SigningTime>2026-03-28T12:00:00.000Z</xades:SigningTime>
      <xades:SigningCertificate>
        <xades:Cert>
          <xades:CertDigest>
            <DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/>
            <DigestValue>base64-sha256-of-cert-der</DigestValue>
          </xades:CertDigest>
          <xades:IssuerSerial>
            <X509IssuerName>CN=Issuer, O=Org, C=PL</X509IssuerName>
            <X509SerialNumber>123456789</X509SerialNumber>
          </xades:IssuerSerial>
        </xades:Cert>
      </xades:SigningCertificate>
    </xades:SignedSignatureProperties>
  </xades:SignedProperties>
</xades:QualifyingProperties>
```

**Important details:**
- `X509SerialNumber` must be in **decimal** (not hex). Convert with `BigInt('0x' + hexSerial).toString(10)`.
- `X509IssuerName` must be in comma-separated RFC 2253 format (`CN=..., O=..., C=...`), not newline-separated.
- The `xades:QualifyingProperties` `Target` attribute must reference the `ds:Signature` `Id` (`"#Signature"`).
- The `xades:SignedProperties` `Id` attribute must match the `URI` in Reference 2 (`"SignedProperties"`).

### ds:KeyInfo

Must include the signing certificate in Base64 DER:

```xml
<ds:KeyInfo>
  <ds:X509Data>
    <ds:X509Certificate>MIIBxTC...base64-der-encoded-cert...</ds:X509Certificate>
  </ds:X509Data>
</ds:KeyInfo>
```

### Signature computation

The `ds:SignatureValue` is computed by:

1. Canonicalize the `ds:SignedInfo` element using exclusive XML canonicalization
2. Sign the canonical form with the private key:
   - **RSA**: RSASSA-PKCS1-v1_5 with SHA-256
   - **ECDSA**: SHA-256 with **IEEE P1363** encoding (not DER/ASN.1 - this is critical for ECDSA)
3. Base64-encode the result

---

## CLI Two-Phase Flow

**File:** `src/cli/commands/auth.ts`

The CLI provides a `login-external` subcommand with two phases, designed for workflows where signing happens outside the CLI process (e.g., in a separate tool or on a different machine).

### Phase 1: Generate unsigned XML

```bash
# Output to stdout (pipe to file or signing tool)
ksef auth login-external --generate --nip 1234567890

# Write to a specific file
ksef auth login-external --generate --nip 1234567890 --output unsigned.xml

# With a non-default context type
ksef auth login-external --generate --nip PL1234567890 --context-type NipVatUe --output unsigned.xml

# Specify environment
ksef auth login-external --generate --nip 1234567890 --env test --output unsigned.xml
```

This phase:
1. Requests a challenge from KSeF
2. Generates the unsigned `AuthTokenRequest` XML
3. Saves the challenge metadata to `~/.ksef/pending-challenge.json` (mode `0600`)
4. Outputs the unsigned XML to stdout or the specified `--output` file
5. Prints the challenge and timestamp to stderr

**Pending challenge file** (`~/.ksef/pending-challenge.json`):
```json
{
  "challenge": "abc123-challenge-from-ksef",
  "timestamp": "2026-03-28T12:00:00.000Z",
  "contextIdentifier": { "type": "Nip", "value": "1234567890" },
  "createdAt": "2026-03-28T12:00:05.000Z"
}
```

### Phase 2: Submit signed XML

```bash
# Read from file
ksef auth login-external --submit --nip 1234567890 --input signed.xml

# Read from stdin (pipe from signing tool)
my-signing-tool sign unsigned.xml | ksef auth login-external --submit --nip 1234567890

# Specify environment
ksef auth login-external --submit --nip 1234567890 --env test --input signed.xml
```

This phase:
1. Reads the signed XML from `--input` file or stdin
2. Submits it to KSeF via `submitXadesAuthRequest()`
3. Polls auth status (1 second interval, up to 30 attempts)
4. Redeems access and refresh tokens
5. Saves the session to `~/.ksef/session.json`
6. Cleans up the pending challenge file

### CLI arguments

| Argument | Type | Description |
|----------|------|-------------|
| `--generate` | flag | Phase 1: generate unsigned XML |
| `--submit` | flag | Phase 2: submit signed XML |
| `--nip` | string | NIP or identifier value (falls back to `ksef config`) |
| `--context-type` | string | `Nip` (default), `InternalId`, `NipVatUe`, or `PeppolId` |
| `--output` | string | Write unsigned XML to file (Phase 1 only) |
| `--input` | string | Read signed XML from file (Phase 2 only) |
| `--env` | string | KSeF environment: `test`, `demo`, or `prod` |
| `--json` | flag | JSON output format |
| `--verbose` | flag | Show HTTP request/response details |

### End-to-end CLI example with xmlsec1

```bash
# Phase 1: Generate unsigned XML
ksef auth login-external --generate --nip 1234567890 --env test --output unsigned.xml

# Sign externally (example with xmlsec1 and a PKCS#11 token)
xmlsec1 --sign \
  --pkcs11-module /usr/lib/libsoftokn3.so \
  --privkey-openssl "pkcs11:token=MyToken;object=MyKey" \
  --output signed.xml \
  unsigned.xml

# Phase 2: Submit signed XML
ksef auth login-external --submit --nip 1234567890 --env test --input signed.xml
```

---

## Library Usage Examples

### Example 1: Callback-based workflow (recommended)

Use `authenticateWithExternalSignature()` when the signing can happen in-process (e.g., calling a cloud KMS SDK).

```typescript
import { KSeFClient, authenticateWithExternalSignature } from 'ksef-client-ts';
import { KeyClient, CryptographyClient } from '@azure/keyvault-keys';
import { DefaultAzureCredential } from '@azure/identity';

const client = new KSeFClient({ env: 'test' });

// Azure Key Vault signing example
const credential = new DefaultAzureCredential();
const keyClient = new KeyClient('https://my-vault.vault.azure.net', credential);
const key = await keyClient.getKey('my-signing-key');
const cryptoClient = new CryptographyClient(key.id!, credential);

const result = await authenticateWithExternalSignature(client, {
  contextIdentifier: { type: 'Nip', value: '1234567890' },

  signXml: async (unsignedXml: string): Promise<string> => {
    // Your XAdES signing logic here.
    // 1. Build the ds:Signature structure (SignedInfo, QualifyingProperties, etc.)
    // 2. Canonicalize SignedInfo
    // 3. Call cryptoClient.sign('RS256', digest) for the signature value
    // 4. Assemble the complete signed XML
    return signWithAzureKeyVault(unsignedXml, cryptoClient);
  },
});

// client is now authenticated - use it for API calls
```

### Example 2: Manual step-by-step (for out-of-process signing)

Use the low-level functions when signing happens in a separate process, on a different machine, or requires human interaction (e.g., PIN entry on a smart card).

```typescript
import {
  KSeFClient,
  buildUnsignedAuthTokenRequestXml,
} from 'ksef-client-ts';

const client = new KSeFClient({ env: 'test' });

// Step 1: Get challenge from KSeF
const challenge = await client.auth.getChallenge();
console.log('Challenge:', challenge.challenge);
console.log('Timestamp:', challenge.timestamp);
console.log('IMPORTANT: Sign and submit before the challenge expires.');

// Step 2: Generate unsigned XML
const unsignedXml = buildUnsignedAuthTokenRequestXml({
  challenge: challenge.challenge,
  contextIdentifier: { type: 'Nip', value: '1234567890' },
});

// Step 3: Sign externally (your code - this is where HSM/smart card/KMS happens)
const signedXml = await signXmlExternally(unsignedXml);

// Step 4: Submit signed XML
const submitResult = await client.auth.submitXadesAuthRequest(signedXml);

// Step 5: Poll for completion
let authStatus;
for (let i = 0; i < 30; i++) {
  authStatus = await client.auth.getAuthStatus(
    submitResult.referenceNumber,
    submitResult.authenticationToken.token,
  );
  if (authStatus.status.code !== 100) break; // 100 = in progress
  await new Promise((r) => setTimeout(r, 1000));
}

// Step 6: Redeem tokens
const tokens = await client.auth.getAccessToken(
  submitResult.authenticationToken.token,
);

// Step 7: Set tokens on the client
client.authManager.setAccessToken(tokens.accessToken.token);
client.authManager.setRefreshToken(tokens.refreshToken.token);

// Client is now authenticated
```

### Example 3: AWS CloudHSM with PKCS#11

```typescript
import { KSeFClient, authenticateWithExternalSignature } from 'ksef-client-ts';
import * as pkcs11js from 'pkcs11js';

const pkcs11 = new pkcs11js.PKCS11();
pkcs11.load('/opt/cloudhsm/lib/libcloudhsm_pkcs11.so');
pkcs11.C_Initialize();

const client = new KSeFClient({ env: 'prod' });

const result = await authenticateWithExternalSignature(client, {
  contextIdentifier: { type: 'Nip', value: '1234567890' },

  signXml: async (unsignedXml: string): Promise<string> => {
    // Use PKCS#11 to sign the canonicalized SignedInfo
    // Build XAdES structure, compute digests, sign via HSM
    return signWithPkcs11(pkcs11, unsignedXml);
  },
});

pkcs11.C_Finalize();
```

---

## Authentication Methods Comparison

| Method | Auth function | Key location | Use case |
|--------|-------------|-------------|----------|
| **Token** | `authenticateWithToken()` | N/A (encrypted token sent to KSeF) | Development, testing, simple integrations |
| **Certificate (PEM)** | `authenticateWithCertificate()` | PEM files on disk | Server-side automation with exportable keys |
| **PKCS#12** | `authenticateWithPkcs12()` | `.p12`/`.pfx` file | Server-side automation with bundled cert+key |
| **External signature** | `authenticateWithExternalSignature()` | HSM, smart card, cloud KMS | Enterprise, qualified signatures, non-exportable keys |

**When to use external signing:**
- Private keys cannot be exported (HSM, smart card, cloud KMS)
- Signing must go through a specific middleware (PKCS#11, vendor SDK)
- Regulatory requirements mandate qualified electronic signatures on hardware tokens
- Signing happens on a different machine or in a different process
- Integration with government identity providers (EPUAP)

**When NOT to use external signing:**
- You have the private key as a PEM file -- use `authenticateWithCertificate()`
- You have a `.p12`/`.pfx` file -- use `authenticateWithPkcs12()`
- You are using a KSeF authorization token -- use `authenticateWithToken()`

---

## Error Handling

### Challenge expiration

Challenges have a limited lifetime. If too much time passes between Phase 1 (generate) and Phase 2 (submit), the challenge will expire and KSeF will reject the signed XML.

```typescript
try {
  const result = await authenticateWithExternalSignature(client, options);
} catch (error) {
  if (error instanceof KSeFApiError) {
    // Check for challenge expiration (typically a 4xx error)
    console.error('Auth failed:', error.message);
    console.error('Status:', error.statusCode);
    // Retry: get a new challenge and sign again
  }
}
```

### Invalid signature

KSeF validates the XAdES signature server-side. Common rejection reasons:

| Cause | Symptom |
|-------|---------|
| Wrong digest algorithm | Auth status polling returns failure |
| Missing enveloped-signature transform | Digest mismatch (signature covers itself) |
| DER-encoded ECDSA instead of IEEE P1363 | Signature verification fails |
| Expired or untrusted certificate | Certificate chain validation error |
| Wrong `X509SerialNumber` format (hex vs decimal) | Certificate mismatch |
| Incorrect `X509IssuerName` format | Certificate mismatch |
| SignedProperties `Id` does not match Reference `URI` | Reference resolution error |

### Polling timeout

If auth status polling exceeds `maxAttempts`, the `pollUntil` utility throws. Handle this by increasing the timeout or retrying the entire flow.

```typescript
const result = await authenticateWithExternalSignature(client, {
  contextIdentifier: { type: 'Nip', value: '1234567890' },
  signXml: mySignerFn,
  pollOptions: {
    intervalMs: 2000,   // poll every 2 seconds
    maxAttempts: 60,    // wait up to 2 minutes
    onProgress: (attempt, max) => {
      console.log(`Waiting for auth... ${attempt}/${max}`);
    },
  },
});
```

### Error types

All errors thrown by the auth flow are from the standard error hierarchy (defined in `src/errors/`):

| Error class | When |
|-------------|------|
| `KSeFApiError` | Generic HTTP error from KSeF (4xx/5xx) |
| `KSeFUnauthorizedError` | 401 - invalid or expired auth token |
| `KSeFForbiddenError` | 403 - insufficient permissions for the NIP |
| `KSeFRateLimitError` | 429 - too many auth attempts |
| `KSeFValidationError` | Client-side validation failure (e.g., invalid context type in CLI) |

---

## Files Reference

| File | Component | Description |
|------|-----------|-------------|
| `src/crypto/auth-xml-builder.ts` | `buildUnsignedAuthTokenRequestXml()` | Generates unsigned AuthTokenRequest XML |
| `src/crypto/auth-xml-builder.ts` | `AuthTokenRequestXmlOptions` | Options type for XML generation |
| `src/workflows/auth-workflow.ts` | `authenticateWithExternalSignature()` | High-level callback-based workflow |
| `src/workflows/auth-workflow.ts` | `ExternalSignatureAuthOptions` | Options type for the workflow |
| `src/workflows/auth-workflow.ts` | `AuthResult` | Return type with access/refresh tokens |
| `src/services/auth.ts` | `AuthService.submitXadesAuthRequest()` | Low-level XAdES XML submission |
| `src/services/auth.ts` | `AuthService.getChallenge()` | Request auth challenge from KSeF |
| `src/services/auth.ts` | `AuthService.getAuthStatus()` | Poll auth operation status |
| `src/services/auth.ts` | `AuthService.getAccessToken()` | Redeem auth token for access/refresh tokens |
| `src/models/auth/types.ts` | `AuthChallengeResponse` | Challenge response type |
| `src/models/auth/types.ts` | `AuthenticationInitResponse` | Submit response (referenceNumber + authToken) |
| `src/models/auth/types.ts` | `XadesSubjectIdentifierType` | Subject identifier type for XML |
| `src/models/common.ts` | `ContextIdentifier`, `ContextIdentifierType` | Entity identifier types |
| `src/crypto/signature-service.ts` | `SignatureService.sign()` | Internal XAdES signer (reference for what external signers must replicate) |
| `src/cli/commands/auth.ts` | `login-external` command | CLI two-phase external signing |
| `src/http/routes.ts` | `Routes.Authorization.xadesSignature` | API endpoint path (`auth/xades-signature`) |
| `src/http/ksef-feature.ts` | `ENFORCE_XADES_COMPLIANCE` | XAdES compliance header constant |
