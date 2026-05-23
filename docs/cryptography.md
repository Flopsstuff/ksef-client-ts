# Cryptography Layer

Deep dive into the cryptographic layer that underpins authentication, session encryption, batch uploads, and export decryption. Every invoice that flows through KSeF is encrypted, and every authenticated session requires cryptographic proof of identity. This layer handles all of it.

---

## Overview

The KSeF API requires encryption for all invoice data in transit and cryptographic authentication for sessions. The crypto layer provides:

- **AES-256-CBC** symmetric encryption/decryption for invoice content
- **RSA-OAEP** key wrapping to securely transmit AES keys to KSeF
- **Token encryption** (RSA or ECDH+AES-GCM) for session authorization
- **XAdES-B** enveloped XML signatures for certificate-based authentication
- **CSR generation** (RSA-2048 / ECDSA P-256) for certificate enrollment
- **Self-signed certificate generation** for testing and development
- **PKCS#12 import** for loading certificate/key pairs from `.p12`/`.pfx` files
- **SHA-256 file hashing** for invoice integrity verification

### Files

All crypto source files are in `src/crypto/`:

| File | Role |
|------|------|
| `cryptography-service.ts` | Main service: AES, RSA-OAEP, ECDH+GCM, hashing, CSR generation |
| `certificate-fetcher.ts` | Fetches and caches KSeF public certificates via the API |
| `signature-service.ts` | XAdES-B enveloped XML signatures (static class) |
| `certificate-service.ts` | Self-signed certificate generation (static class) |
| `pkcs12-loader.ts` | PKCS#12 (.p12/.pfx) import via node-forge |
| `auth-xml-builder.ts` | Builds unsigned auth token request XML documents |
| `index.ts` | Barrel re-exports |

Types are in `src/models/crypto/types.ts` and `src/models/common.ts`.

### Where crypto is used

```
Authentication
  loginWithToken()     → encryptKsefToken() — RSA-OAEP or ECDH+AES-GCM
  loginWithCertificate() → SignatureService.sign() — XAdES-B signature

Online Sessions
  openOnlineSession()  → getEncryptionData() — AES key+IV wrapped with RSA-OAEP
  sendInvoice()        → encryptAES256() + getFileMetadata() — encrypt + dual hash

Batch Uploads
  uploadBatch()        → getEncryptionData() + encryptAES256() per part

Export & Download
  exportAndDownload()  → getEncryptionData() for request, decryptAES256() for response

Certificate Enrollment
  CLI cert commands    → generateCsrRsa() / generateCsrEcdsa()
  CLI cert generate    → CertificateService.generatePersonalCertificate() / generateCompanySeal()
```

---

## Initialization Pattern

`CryptographyService` (`src/crypto/cryptography-service.ts`) requires explicit initialization before use. This is a deliberate design choice.

```typescript
const client = new KSeFClient({ environment: 'test' });

// Must call init() before any crypto operation
await client.crypto.init();

// Now crypto operations work
const encData = client.crypto.getEncryptionData();
```

### Why init() is not auto-called

1. **Network I/O**: `init()` fetches certificates from the KSeF API. Not all client usage needs crypto (e.g., querying session status, checking limits).
2. **Fail-fast control**: The caller decides when to handle certificate fetch errors, rather than having them appear unexpectedly during construction.
3. **Idempotent**: Calling `init()` multiple times is safe. The `CertificateFetcher` skips the fetch if already initialized.

### What happens during init()

```
client.crypto.init()
  │
  ▼
CertificateFetcher.init()
  │
  ├── Already initialized? → return immediately
  │
  └── fetchCertificates()
        │
        ├── GET /v2/security/public-key-certificates
        │
        ├── Find cert with usage "SymmetricKeyEncryption"
        │     → store as symmetricKeyPem (used by getEncryptionData)
        │
        ├── Find cert(s) with usage "KsefTokenEncryption"
        │     → pick earliest by validFrom (matches Java reference)
        │     → store as ksefTokenPem (used by encryptKsefToken)
        │
        └── Set initialized = true
```

Workflows in `src/workflows/` call `await client.crypto.init()` as their first step. The call is always safe because `CertificateFetcher` short-circuits if already initialized.

---

## Certificate Fetching & Caching

**File:** `src/crypto/certificate-fetcher.ts`

`CertificateFetcher` retrieves KSeF public certificates via the REST API and converts them from base64-encoded DER to PEM format for use by Node.js crypto.

### Two certificate types

| Certificate Usage | Stored Field | Consumed By |
|---|---|---|
| `SymmetricKeyEncryption` | `symmetricKeyPem` | `getEncryptionData()` — wraps AES key with RSA-OAEP |
| `KsefTokenEncryption` | `ksefTokenPem` | `encryptKsefToken()` — encrypts auth token (RSA or ECDH) |

### Selection logic

The API returns an array of `PublicKeyCertificate` objects:

```typescript
// src/models/crypto/types.ts
interface PublicKeyCertificate {
  certificate: string;        // base64-encoded DER
  validFrom: string;          // ISO date
  validTo: string;            // ISO date
  usage: PublicKeyCertificateUsage[];  // ['KsefTokenEncryption'] or ['SymmetricKeyEncryption']
}
```

- **SymmetricKeyEncryption**: First cert matching the usage. There should be exactly one.
- **KsefTokenEncryption**: If multiple certs match, the one with the earliest `validFrom` is selected. This matches the Java reference implementation (`Comparator.comparing(validFrom).min()`).

### Cache invalidation

The fetcher holds certs in memory for the lifetime of the `KSeFClient` instance. To force a re-fetch (e.g., after a certificate rotation on the KSeF side):

```typescript
// src/crypto/certificate-fetcher.ts
async refresh(): Promise<void> {
  this.initialized = false;
  await this.fetchCertificates();
}
```

There is no TTL-based auto-refresh. KSeF certificates rotate infrequently and the API always returns the current set.

### Error cases

- **No certs returned**: `"No public key certificates returned from KSeF API."`
- **Missing SymmetricKeyEncryption**: `"No SymmetricKeyEncryption certificate found."`
- **Missing KsefTokenEncryption**: `"No KsefTokenEncryption certificate found."`
- **Not initialized**: Calling `getSymmetricKeyEncryptionPem()` or `getKsefTokenEncryptionPem()` before `init()` throws `"CertificateFetcher not initialized. Call init() first."`

---

## AES-256-CBC Encryption/Decryption

**File:** `src/crypto/cryptography-service.ts`, methods `encryptAES256()` and `decryptAES256()`

All invoice content in online sessions, batch uploads, and export downloads is encrypted with AES-256-CBC using a randomly generated key and IV.

### Signatures

```typescript
encryptAES256(content: Uint8Array, key: Uint8Array, iv: Uint8Array): Uint8Array
decryptAES256(content: Uint8Array, key: Uint8Array, iv: Uint8Array): Uint8Array
```

### Parameters

| Parameter | Size | Source |
|-----------|------|--------|
| `key` | 32 bytes (256 bits) | Generated by `getEncryptionData()` via `crypto.randomBytes(32)` |
| `iv` | 16 bytes (128 bits) | Generated by `getEncryptionData()` via `crypto.randomBytes(16)` |
| `content` | variable | Invoice XML (encrypt) or encrypted blob (decrypt) |

### PKCS7 padding

AES-CBC requires the plaintext to be a multiple of 16 bytes. Node.js `createCipheriv('aes-256-cbc', ...)` applies PKCS7 padding automatically on `cipher.final()` and removes it on `decipher.final()`. No manual padding is needed.

### Session key reuse

A single (key, IV) pair is generated once per session (online, batch, or offline submit) and reused for all invoices in that session. This is by design in the KSeF protocol: `EncryptionInfo` (RSA-wrapped key + IV) is sent once at `openSession()`, and `sendInvoice()` does not accept per-invoice encryption parameters. All official reference implementations (Java, C#, TypeScript) follow the same pattern. The KSeF documentation explicitly recommends generating a new key *per session* (*"Rekomendowane jest użycie nowo wygenerowanego klucza dla każdej sesji"*).

```
openOnlineSession()
  │
  ├── getEncryptionData() → { cipherKey, cipherIv, encryptionInfo }
  │     encryptionInfo (wrapped key) sent to KSeF with session open request
  │
  ├── sendInvoice(xml1) → encryptAES256(xml1, key, iv)
  ├── sendInvoice(xml2) → encryptAES256(xml2, key, iv)
  └── sendInvoice(xml3) → encryptAES256(xml3, key, iv)
```

---

## RSA-OAEP Key Wrapping

**File:** `src/crypto/cryptography-service.ts`, method `getEncryptionData()`

When opening a session or starting an export, the client generates a random AES key and IV, then wraps (encrypts) the AES key with the KSeF `SymmetricKeyEncryption` certificate's RSA public key. The wrapped key is sent to KSeF so it can decrypt the invoice data server-side.

### Signature

```typescript
getEncryptionData(): Promise<EncryptionData>
```

**Async since 0.8.0** — uses Web Crypto (`crypto.webcrypto.subtle`) for the RSA-OAEP step. See [Why Web Crypto](#why-web-crypto-for-rsa-oaep) below.

### Return type

```typescript
// src/models/crypto/types.ts
interface EncryptionData {
  cipherKey: Uint8Array;          // 32-byte raw AES key (for local encrypt/decrypt)
  cipherIv: Uint8Array;           // 16-byte raw IV (for local encrypt/decrypt)
  encryptionInfo: EncryptionInfo; // base64-encoded wrapped key + IV (sent to KSeF)
}

// src/models/common.ts
interface EncryptionInfo {
  encryptedSymmetricKey: string;  // base64(RSA-OAEP(key))
  initializationVector: string;   // base64(IV)
}
```

### Flow

```
crypto.randomBytes(32) → AES key (raw)
crypto.randomBytes(16) → IV (raw)
                │
                ▼
fetcher.getSymmetricKeyEncryptionPem() → KSeF RSA public cert
                │
                ▼
crypto.webcrypto.subtle.importKey('spki',
  spkiDerFromCert(certPem),
  { name: 'RSA-OAEP', hash: 'SHA-256' },
  false, ['encrypt']
)
    │
    ▼
crypto.webcrypto.subtle.encrypt({ name: 'RSA-OAEP' }, key, aesKey)
                │
                ▼
EncryptionData {
  cipherKey: rawKey,          ← kept locally for encrypt/decrypt
  cipherIv:  rawIv,           ← kept locally for encrypt/decrypt
  encryptionInfo: {
    encryptedSymmetricKey: base64(wrappedKey),  ← sent to KSeF API
    initializationVector:  base64(iv),          ← sent to KSeF API
  }
}
```

The `encryptionInfo` is included in the session open request body. KSeF uses its private RSA key to unwrap the AES key, then decrypts the invoice data server-side.

### Why Web Crypto for RSA-OAEP

Up through 0.7.x the library used `node:crypto.publicEncrypt({oaepHash: 'sha256', ...})`. That path was runtime-dependent: Node correctly emitted OAEP-SHA256, but Deno's Node-compat layer silently ignored the `oaepHash` option and emitted OAEP-SHA1 instead. KSeF's server expects OAEP-SHA256 and rejected Deno-generated ciphertext as `Invalid token encryption` (issue [#18](https://github.com/Flopsstuff/ksef-client-ts/issues/18)).

Web Crypto (`crypto.webcrypto.subtle`) makes the hash part of the key's algorithm identity at `importKey` time, so no runtime can swap it without failing outright. The API is standardized (W3C), native on Deno/Bun/browsers/edge runtimes, and available on Node via `crypto.webcrypto.subtle`. Streaming primitives (AES-CBC + SHA-256) continue to use `node:crypto` because Web Crypto is batch-only and streaming matters for invoice payloads.

---

## Token Encryption (Auto-Selection)

**File:** `src/crypto/cryptography-service.ts`, method `encryptKsefToken()`

Token-based authentication (`loginWithToken`) requires encrypting the authorization token concatenated with the challenge timestamp. The encryption algorithm is auto-selected based on the public key type in the KSeF `KsefTokenEncryption` certificate.

### Signature

```typescript
encryptKsefToken(token: string, challengeTimestamp: string): Promise<Uint8Array>
```

**Async since 0.8.0** — the RSA branch uses Web Crypto; the EC branch remains sync internally but is wrapped in the async return type.

### Token payload format

```
"<token>|<challengeTimestampMs>"
```

The timestamp is an ISO date string from the KSeF challenge response. It is converted to milliseconds since epoch before concatenation.

### Auto-detection flow

```
encryptKsefToken(token, timestamp)
  │
  ├── Build payload: `${token}|${new Date(timestamp).getTime()}`
  │
  ├── Load KsefTokenEncryption cert from fetcher
  │
  ├── Inspect cert.publicKey.asymmetricKeyType
  │     │
  │     ├── "rsa" → RSA-OAEP path (via Web Crypto — see "Why Web Crypto" above)
  │     │     ├── Extract SPKI DER from cert via node:crypto X509Certificate
  │     │     ├── crypto.webcrypto.subtle.importKey('spki', ..., { hash: 'SHA-256' })
  │     │     └── crypto.webcrypto.subtle.encrypt({ name: 'RSA-OAEP' }, key, payload)
  │     │         → returns encrypted bytes (async)
  │     │
  │     ├── "ec" → ECDH + AES-256-GCM path
  │     │     ├── Generate ephemeral EC key pair (P-256 / prime256v1)
  │     │     ├── ECDH: derive shared secret from ephemeral private + cert public
  │     │     ├── Use shared secret (32 bytes) as AES-256-GCM key
  │     │     ├── Generate random 12-byte nonce
  │     │     ├── AES-256-GCM encrypt payload → ciphertext + 16-byte auth tag
  │     │     └── Output: [ephemeralSPKI | nonce(12) | ciphertext | tag(16)]
  │     │
  │     └── other → throw Error("Unsupported key algorithm")
  │
  └── Return Uint8Array → caller base64-encodes for API submission
```

### RSA-OAEP path

Straightforward: encrypt the payload with the certificate's RSA public key using OAEP with SHA-256. Output is the raw RSA ciphertext.

### ECDH + AES-256-GCM path

This path is used when the KSeF environment provides an EC (elliptic curve) certificate for token encryption. The output format is Java-compatible:

| Segment | Size | Content |
|---------|------|---------|
| Ephemeral SPKI | ~91 bytes | DER-encoded SubjectPublicKeyInfo of the ephemeral EC public key |
| Nonce | 12 bytes | Random GCM initialization vector |
| Ciphertext | variable | AES-256-GCM encrypted payload |
| Auth tag | 16 bytes | GCM authentication tag (appended by Node.js GCM cipher) |

The receiver (KSeF server):

1. Extracts the ephemeral public key from the SPKI prefix
2. Performs ECDH with its own private key to derive the same shared secret
3. Uses the shared secret as the AES-256-GCM key with the nonce to decrypt

### Why auto-selection exists

The KSeF API may use either RSA or EC certificates depending on the environment (test vs. production) and certificate rotation schedule. Auto-detection means the client works with either without configuration changes.

---

## XAdES-B Enveloped Signatures

**File:** `src/crypto/signature-service.ts`

`SignatureService` is a fully static class that produces XAdES-B enveloped XML signatures compatible with the KSeF API. It is used for certificate-based authentication (`loginWithCertificate`).

### Signature

```typescript
static sign(xml: string, certPem: string, privateKeyPem: string): string
```

### When it is used

Certificate-based login builds an `AuthTokenRequest` XML document (via `buildUnsignedAuthTokenRequestXml()` in `src/crypto/auth-xml-builder.ts`), signs it with `SignatureService.sign()`, and submits the signed XML to KSeF.

```typescript
// src/client.ts, loginWithCertificate()
const authRequestXml = buildAuthTokenRequestXml(challenge.challenge, nip);
const signedXml = SignatureService.sign(authRequestXml, certPem, keyPem);
await this.auth.submitCertificateAuthRequest(signedXml, ...);
```

### Signature algorithm auto-detection

Like token encryption, the signing algorithm is auto-detected from the private key type:

| Key Type | Signature Algorithm | XMLDSig URI |
|----------|-------------------|-------------|
| RSA | RSASSA-PKCS1-v1_5 + SHA-256 | `rsa-sha256` |
| EC (P-256) | ECDSA + SHA-256 (IEEE P1363) | `ecdsa-sha256` |
| EC (P-384) | ECDSA + SHA-384 (IEEE P1363) | `ecdsa-sha384` |
| EC (P-521) | ECDSA + SHA-512 (IEEE P1363) | `ecdsa-sha512` |

ECDSA signatures use IEEE P1363 encoding (fixed-length `r || s`) instead of DER encoding. This is required by XMLDSig and XAdES specifications.

**Digest algorithm matches the curve.** Every ECDSA signing path (the `SignatureMethod` URI, both `DigestMethod` elements on the XAdES `Reference` objects, the `xades:CertDigest` used for the signing certificate, and the Node `crypto.sign()` call) uses the digest size paired with the key curve — SHA-256 for P-256, SHA-384 for P-384, and SHA-512 for P-521. RSA signing remains fixed on SHA-256.

### Signature structure

The complete `ds:Signature` element has four parts:

```
<ds:Signature Id="Signature" xmlns:ds="http://www.w3.org/2000/09/xmldsig#">

  ┌─ ds:SignedInfo ─────────────────────────────────────────────────┐
  │  CanonicalizationMethod: Exclusive XML C14N                     │
  │  SignatureMethod: rsa-sha256 or ecdsa-shaNNN (matches EC curve) │
  │                                                                 │
  │  Reference #1 (URI="") — the root document                     │
  │    Transforms: enveloped-signature → exc-c14n                   │
  │    DigestMethod: shaNNN (matches signing algorithm)             │
  │    DigestValue: base64(shaNNN(canonicalized root))              │
  │                                                                 │
  │  Reference #2 (URI="#SignedProperties")                         │
  │    Transforms: exc-c14n                                         │
  │    DigestMethod: shaNNN (matches signing algorithm)             │
  │    DigestValue: base64(shaNNN(canonicalized SignedProperties))   │
  └─────────────────────────────────────────────────────────────────┘

  ds:SignatureValue — base64(sign(canonicalize(SignedInfo)))

  ┌─ ds:KeyInfo ─────────────────────────────────────────────┐
  │  ds:X509Data                                              │
  │    ds:X509Certificate — base64 DER of the signing cert    │
  └───────────────────────────────────────────────────────────┘

  ┌─ ds:Object ──────────────────────────────────────────────────────────────┐
  │  xades:QualifyingProperties Target="#Signature"                          │
  │    xades:SignedProperties Id="SignedProperties"                          │
  │      xades:SignedSignatureProperties                                     │
  │        xades:SigningTime — ISO timestamp (now - 1 minute clock skew)     │
  │        xades:SigningCertificate                                          │
  │          xades:Cert                                                      │
  │            xades:CertDigest — SHA-256 of the signing cert DER            │
  │            xades:IssuerSerial — issuer DN + decimal serial number         │
  └──────────────────────────────────────────────────────────────────────────┘
```

### Processing steps

1. **Parse certificate metadata**: extract DER, compute the digest (SHA-256/384/512 matching the signing key), read issuer DN and serial number
2. **Determine algorithm**: inspect the private key — RSA → SHA-256; EC → SHA-256 / SHA-384 / SHA-512 selected from the curve (P-256 / P-384 / P-521)
3. **Set signing time**: `new Date(Date.now() - 60000)` (1-minute clock skew buffer to avoid rejection by KSeF)
4. **Build QualifyingProperties**: XAdES signed properties with cert digest, issuer, serial, and signing time
5. **Compute Reference 1 digest**: canonicalize the root document element with exc-c14n, hash with the curve-matched digest
6. **Compute Reference 2 digest**: canonicalize the SignedProperties element, hash with the curve-matched digest
7. **Build SignedInfo**: XML fragment containing both references
8. **Sign**: canonicalize SignedInfo, then `crypto.sign(digestName, canonicalSignedInfo, privateKey)` (`digestName` = `'sha256'` / `'sha384'` / `'sha512'`) with appropriate encoding
9. **Assemble**: build the complete `ds:Signature` element and append it to the document root

### Key implementation details

- **Canonicalization**: Uses `xml-crypto`'s `ExclusiveCanonicalization` class, not a custom implementation.
- **Serial number conversion**: Node.js `X509Certificate.serialNumber` returns hex; it is converted to decimal via `BigInt('0x' + hex).toString(10)` for XML compatibility.
- **Issuer DN normalization**: Node.js returns newline-separated RDN components (`"CN=Test\nO=Org"`); these are normalized to comma-separated RFC 2253 format (`"CN=Test, O=Org"`) as expected by XAdES.
- **Base64 wrapping**: Signature value is wrapped at 76-character line boundaries for readability.

---

## CSR Generation

**File:** `src/crypto/cryptography-service.ts`, methods `generateCsrRsa()` and `generateCsrEcdsa()`

Certificate Signing Requests (CSRs) are used for KSeF certificate enrollment. The client generates a key pair and CSR locally, submits the CSR to KSeF, and receives a signed certificate back.

### Signatures

```typescript
async generateCsrRsa(fields: X500NameFields): Promise<CsrResult>
async generateCsrEcdsa(fields: X500NameFields): Promise<CsrResult>
```

### Return type

```typescript
// src/models/crypto/types.ts
interface CsrResult {
  csrDer: Uint8Array;     // PKCS#10 CSR in DER format (submit to KSeF)
  privateKeyPem: string;  // PKCS#8 private key in PEM format (store securely)
}
```

### X500 name fields

```typescript
// src/models/crypto/types.ts
interface X500NameFields {
  commonName?: string;              // CN
  givenName?: string;               // OID 2.5.4.42
  surname?: string;                 // OID 2.5.4.4
  serialNumber?: string;            // OID 2.5.4.5
  organizationName?: string;        // O
  organizationIdentifier?: string;  // OID 2.5.4.97
  uniqueIdentifier?: string;        // OID 2.5.4.45
  countryCode?: string;             // C
}
```

Fields with no standard short name use OID notation in the distinguished name string: `"CN=Jan Kowalski, 2.5.4.42=Jan, 2.5.4.4=Kowalski, 2.5.4.5=PESEL:12345678901, C=PL"`.

### RSA vs ECDSA comparison

| Property | `generateCsrRsa()` | `generateCsrEcdsa()` |
|----------|--------------------|-----------------------|
| Key algorithm | RSASSA-PKCS1-v1_5 | ECDSA |
| Key size/curve | 2048-bit | P-256 (secp256r1) |
| Hash | SHA-256 | SHA-256 |
| CSR signing algorithm | RSASSA-PKCS1-v1_5 + SHA-256 | ECDSA + SHA-256 |
| CSR format | PKCS#10 DER | PKCS#10 DER |

Both methods use `@peculiar/x509` with Node.js `crypto.webcrypto` as the crypto provider. The key pair is generated via `crypto.webcrypto.subtle.generateKey()` and exported as PKCS#8 PEM.

---

## Self-Signed Certificates

**File:** `src/crypto/certificate-service.ts`

`CertificateService` is a fully static class for generating self-signed certificates. These are used for testing, development, and the KSeF TEST environment where real qualified certificates are not required.

### Two certificate types

```typescript
static async generatePersonalCertificate(
  givenName: string,
  surname: string,
  serialNumber: string,  // e.g., "PESEL:12345678901"
  commonName: string,
  method?: CryptoEncryptionMethod,  // 'RSA' (default) or 'ECDSA'
): Promise<SelfSignedCertificateResult>

static async generateCompanySeal(
  orgName: string,
  orgIdentifier: string,  // e.g., "VATPL-1234567890"
  commonName: string,
  method?: CryptoEncryptionMethod,  // 'RSA' (default) or 'ECDSA'
): Promise<SelfSignedCertificateResult>
```

| Method | Subject DN | Use case |
|--------|-----------|----------|
| `generatePersonalCertificate` | givenName, surname, serialNumber, CN, C=PL | Individual taxpayer (PESEL-based) |
| `generateCompanySeal` | O, organizationIdentifier, CN, C=PL | Company (NIP-based) |

### Return type

```typescript
// src/models/crypto/types.ts
interface SelfSignedCertificateResult {
  certificatePem: string;  // X.509 certificate in PEM format
  privateKeyPem: string;   // PKCS#8 private key in PEM format
  fingerprint: string;     // SHA-256 hex fingerprint (uppercase)
}
```

### Certificate properties

| Property | Value |
|----------|-------|
| Validity start | `now - 61 minutes` (matches C# reference implementation) |
| Validity end | `now + 365 days` |
| Serial number | Current timestamp in hex |
| Key algorithm | RSA-2048 or ECDSA P-256 (caller's choice, default RSA) |

### Fingerprint utility

`CertificateService` also provides a standalone fingerprint method:

```typescript
static getSha256Fingerprint(certPem: string): string
// Returns uppercase hex SHA-256 hash of the DER-encoded certificate
```

This is used to compute the fingerprint for certificate enrollment and permission management.

---

## PKCS#12 Import

**File:** `src/crypto/pkcs12-loader.ts`

`Pkcs12Loader` extracts a certificate and private key from `.p12`/`.pfx` files using `node-forge`. This is the standard format for certificates exported from browsers, smart cards, and certificate authorities.

### Signature

```typescript
static load(p12: Buffer | Uint8Array, password: string): Pkcs12Result

interface Pkcs12Result {
  certificatePem: string;
  privateKeyPem: string;
}
```

### Extraction strategy

```
Pkcs12Loader.load(p12, password)
  │
  ├── Parse PKCS#12 with node-forge (ASN.1 → pkcs12)
  │
  ├── Extract certificate:
  │     └── getBags({ bagType: certBag }) → first cert
  │
  ├── Extract private key (two attempts):
  │     ├── Try 1: getBags({ bagType: pkcs8ShroudedKeyBag })
  │     │          (encrypted key bag — most common)
  │     │
  │     └── Try 2: getBags({ bagType: keyBag })
  │                (unencrypted key bag — fallback)
  │
  ├── Export cert → PEM (pki.certificateToPem)
  │
  └── Export key → PEM (pki.privateKeyToPem)
        │
        └── On failure: throw with message suggesting
            "Use separate --cert and --key PEM files instead."
            (EC keys may fail with node-forge)
```

### Error cases

| Condition | Error message |
|-----------|---------------|
| No certificate in file | `"PKCS#12 file does not contain a certificate."` |
| No private key in file | `"PKCS#12 file does not contain a private key."` |
| Empty cert bag | `"PKCS#12 certificate bag is empty."` |
| Empty key bag | `"PKCS#12 key bag is empty."` |
| EC key export failure | `"Failed to export private key from PKCS#12 to PEM. This can happen with EC keys."` |

### EC key limitation

`node-forge` has limited support for EC private keys. When a `.p12` file contains an ECDSA key, the PEM export may fail. In that case, the user should provide separate PEM files for the certificate and private key instead.

### Where it is used

```typescript
// src/client.ts, loginWithP12()
const { Pkcs12Loader } = await import('./crypto/pkcs12-loader.js');
const { certificatePem, privateKeyPem } = Pkcs12Loader.load(p12, password);

// src/workflows/auth-workflow.ts, loginWithP12Workflow()
const { Pkcs12Loader } = await import('../crypto/pkcs12-loader.js');
const { certificatePem, privateKeyPem } = Pkcs12Loader.load(options.p12, options.password);
```

Note: `Pkcs12Loader` is dynamically imported (`import()`) rather than statically imported, so `node-forge` is only loaded when PKCS#12 import is actually needed.

---

## File Metadata (Hashing)

**File:** `src/crypto/cryptography-service.ts`, method `getFileMetadata()`

### Signature

```typescript
getFileMetadata(file: Uint8Array): FileMetadata

// src/models/common.ts
interface FileMetadata {
  hashSHA: string;   // base64-encoded SHA-256 hash
  fileSize: number;  // byte length
}
```

### Dual hashing in online sessions

When sending an invoice in an online session, KSeF requires metadata for both the plaintext and encrypted content:

```typescript
// src/workflows/online-session-workflow.ts
const plainMeta  = client.crypto.getFileMetadata(data);       // hash of plaintext XML
const encrypted  = client.crypto.encryptAES256(data, key, iv);
const encMeta    = client.crypto.getFileMetadata(encrypted);  // hash of encrypted blob

await client.onlineSession.sendInvoice(sessionRef, {
  invoiceHash: plainMeta.hashSHA,
  invoiceSize: plainMeta.fileSize,
  encryptedInvoiceHash: encMeta.hashSHA,
  encryptedInvoiceSize: encMeta.fileSize,
  encryptedInvoiceContent: base64(encrypted),
});
```

This allows KSeF to verify integrity at both layers: the encrypted transport layer and the decrypted invoice content.

---

## Auth XML Builder

**File:** `src/crypto/auth-xml-builder.ts`

Builds the unsigned XML document for certificate-based authentication. The document is then signed with `SignatureService.sign()` before submission to KSeF.

### Signature

```typescript
function buildUnsignedAuthTokenRequestXml(options: AuthTokenRequestXmlOptions): string

interface AuthTokenRequestXmlOptions {
  challenge: string;                               // from KSeF challenge response
  contextIdentifier: ContextIdentifier;            // { type: 'Nip', value: '1234567890' }
  subjectIdentifierType?: XadesSubjectIdentifierType; // default: 'certificateSubject'
}
```

### Output format

```xml
<?xml version="1.0" encoding="utf-8"?>
<AuthTokenRequest xmlns="http://ksef.mf.gov.pl/auth/token/2.1">
  <Challenge>...</Challenge>
  <ContextIdentifier>
    <Nip>1234567890</Nip>
  </ContextIdentifier>
  <SubjectIdentifierType>certificateSubject</SubjectIdentifierType>
</AuthTokenRequest>
```

Supports all four context identifier types: `Nip`, `InternalId`, `NipVatUe`, `PeppolId`.

---

## Integration: End-to-End Flows

### Token-based login

```
1. client.auth.getChallenge()
     → { challenge, timestamp }

2. client.crypto.init()
     → fetch KSeF public certs (if not cached)

3. client.crypto.encryptKsefToken(token, timestamp)
     → auto-detect RSA or EC cert
     → encrypt "${token}|${timestampMs}"
     → Uint8Array

4. base64-encode → submit to KSeF auth endpoint
```

### Online session with invoice upload

```
1. client.crypto.init()
     → fetch certs

2. client.crypto.getEncryptionData()
     → generate random AES key + IV
     → wrap key with RSA-OAEP using SymmetricKeyEncryption cert
     → { cipherKey, cipherIv, encryptionInfo }

3. client.onlineSession.openSession({ encryption: encryptionInfo })
     → KSeF stores wrapped key, returns session reference

4. For each invoice:
   a. client.crypto.getFileMetadata(plainXml) → { hashSHA, fileSize }
   b. client.crypto.encryptAES256(plainXml, key, iv) → encryptedBlob
   c. client.crypto.getFileMetadata(encryptedBlob) → { hashSHA, fileSize }
   d. Submit both hashes + base64(encryptedBlob) to KSeF

5. client.onlineSession.closeSession(ref)
```

### Export with download and decryption

```
1. client.crypto.init()
     → fetch certs

2. client.crypto.getEncryptionData()
     → generate AES key+IV, wrap with RSA-OAEP

3. client.invoices.exportInvoices({ encryption: encryptionInfo, filters })
     → KSeF starts export job

4. Poll until export complete
     → result includes download URLs for encrypted parts

5. For each part:
   a. Download encrypted blob from presigned URL
   b. client.crypto.decryptAES256(blob, key, iv) → plaintext ZIP data

6. Concatenate decrypted parts → extract ZIP → invoice XML files
```

### Certificate-based login

```
1. client.auth.getChallenge()
     → { challenge, timestamp }

2. buildUnsignedAuthTokenRequestXml({ challenge, contextIdentifier })
     → unsigned XML with challenge + NIP

3. SignatureService.sign(xml, certPem, keyPem)
     → XAdES-B enveloped signature
     → signed XML document

4. Submit signed XML to KSeF certificate auth endpoint
```
