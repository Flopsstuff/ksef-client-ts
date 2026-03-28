# KSeF Authentication Guide

Overview of authentication methods supported by the Polish National e-Invoice System (KSeF) and how they map to this library and CLI.

---

## Table of Contents

1. [Authentication Methods Overview](#authentication-methods-overview)
2. [Authorization Token (Recommended for Development)](#authorization-token)
3. [Qualified Electronic Signature (XAdES)](#qualified-electronic-signature-xades)
4. [External Signing (Trusted Profile, Cloud Signatures)](#external-signing-trusted-profile-cloud-signatures)
5. [KSeF Certificate (Recommended for Multi-NIP)](#ksef-certificate-recommended-for-multi-nip)
6. [Choosing the Right Method](#choosing-the-right-method)
7. [CLI Usage](#cli-usage)
8. [Library Usage](#library-usage)
9. [Token Lifecycle](#token-lifecycle)
10. [Automatic Token Refresh](#automatic-token-refresh)
11. [Custom AuthManager](#custom-authmanager)
12. [Session Hydration (CLI)](#session-hydration-cli)

---

## Authentication Methods Overview

KSeF supports three categories of authentication, each with different security properties and practical constraints:

| Method | Key Storage | Suitable For | CLI Support |
|---|---|---|---|
| Authorization Token | KSeF portal (encrypted in transit) | Development, automated systems | `ksef auth login --token` |
| Qualified Signature (XAdES) | Hardware token (smart card, USB) | Production, file-based certs | `ksef auth login --cert --key` |
| External Signing (PZ, cloud) | Government infra / cloud HSM | Multi-NIP, cloud signatures | `ksef auth login-external` |
| KSeF Certificate | Local file (issued by KSeF) | Multi-NIP, automated systems | `ksef auth login --cert --key` |

---

## Authorization Token

**The most practical method for development and automated systems.**

### How it works

1. Log in to the KSeF web portal for your target environment
2. Generate an authorization token for your NIP (tax identifier)
3. The token is a plain string that authorizes API access

### Security model

When submitted via the API, the token is **never sent in plaintext**. The client:

1. Requests a challenge from KSeF (`POST /v2/auth/challenge`)
2. Fetches the KSeF public certificate for token encryption
3. Constructs a payload: `"<token>|<challengeTimestampMs>"`
4. Encrypts the payload using the certificate's public key:
   - **RSA key** — RSA-OAEP with SHA-256
   - **EC key** — ECDH (P-256) key agreement + AES-256-GCM
5. Submits the encrypted token (`POST /v2/auth/ksef-token`)
6. Redeems the authentication token for an access token (`POST /v2/auth/token/redeem`)

The encryption algorithm is chosen automatically based on the KSeF certificate's key type. The private key never exists on the client side — only KSeF can decrypt the token.

### KSeF 2.0 URL structure

KSeF 2.0 exposes two gateways to the same underlying API:

| Gateway | Purpose | URL pattern |
|---|---|---|
| **API** | Programmatic access (CLI, libraries) | `api[-env].ksef.mf.gov.pl/v2/...` |
| **AP** (Aplikacja Podatnika) | Web portal for taxpayers | `ap[-env].ksef.mf.gov.pl/webs/api/v2/...` |

The API gateway is what this library and CLI use. The AP gateway is the browser-based portal where users log in to manage tokens, view invoices, and perform other operations interactively. Both expose the same endpoints (`/v2/tokens`, `/v2/auth/challenge`, etc.) — AP simply adds a `/webs/api` prefix.

#### API URLs (used by this library)

| Environment | API URL |
|---|---|
| TEST | `https://api-test.ksef.mf.gov.pl` |
| DEMO | `https://api-demo.ksef.mf.gov.pl` |
| PRODUCTION | `https://api.ksef.mf.gov.pl` |

#### Web portal URLs (for generating tokens in a browser)

| Environment | Portal URL |
|---|---|
| TEST | `https://ap-test.ksef.mf.gov.pl` |
| DEMO | `https://ap-demo.ksef.mf.gov.pl` |
| PRODUCTION | `https://ap.ksef.mf.gov.pl` |

#### Other services

| Service | TEST | DEMO | PRODUCTION |
|---|---|---|---|
| Lighthouse | `https://api-latarnia-test.ksef.mf.gov.pl` | `https://api-latarnia-demo.ksef.mf.gov.pl` | `https://api-latarnia.ksef.mf.gov.pl` |
| QR verification | `https://qr-test.ksef.mf.gov.pl` | `https://qr-demo.ksef.mf.gov.pl` | `https://qr.ksef.mf.gov.pl` |

---

## Qualified Electronic Signature (XAdES)

**The primary authentication method for production use and legal compliance.**

### How it works

1. Request a challenge from KSeF
2. Build an auth request XML document
3. Sign the XML with an XAdES-B enveloped signature using a qualified certificate
4. Submit the signed XML (`POST /v2/auth/xades-signature`)
5. Redeem for an access token

### Important: Private key accessibility

Qualified electronic signatures in Poland (podpis kwalifikowany) are issued by accredited trust service providers and stored on **hardware security devices** (smart cards, USB cryptographic tokens). The private key is designed to **never leave the hardware device**.

This means:

- You **cannot export** the private key to a PEM file in normal circumstances
- Signing operations happen **on the device** via PKCS#11 or similar middleware
- The `--cert/--key` CLI option requires PEM files, which limits its use to rare cases where software-based certificates with exportable keys are available

### When file-based XAdES auth is possible

- Self-signed certificates generated for testing (not accepted by production KSeF)
- Software certificates from some EU trust providers that allow key export
- Development/testing environments where security constraints are relaxed

### Supported signature algorithms

The library detects the key type automatically:

- **RSA** — RSASSA-PKCS1-v1_5 with SHA-256
- **ECDSA** — P-256 with SHA-256 (IEEE P1363 encoding)

---

## External Signing (Trusted Profile, Cloud Signatures)

**The best method when your signing key is not directly accessible** — cloud HSM (mSzafir, SimplySign), Profil Zaufany, smart cards without PKCS#11 export.

The CLI supports a **two-phase external signing flow**: it generates the unsigned XML locally, you sign it with any external tool, and then submit the signed result back.

### How it works

1. CLI requests a challenge from KSeF and builds an unsigned `AuthTokenRequest` XML
2. You sign the XML externally (Profil Zaufany via gov.pl, cloud signature app, smart card middleware)
3. CLI submits the signed XML to KSeF and completes authentication

### CLI usage

```bash
# Phase 1: Generate unsigned XML (saves challenge to ~/.ksef/pending-challenge.json)
ksef auth login-external --generate --nip 1234567890 --env prod --output unsigned.xml

# Phase 2: Sign the XML externally, then submit
#   Option A: Profil Zaufany — go to gov.pl → "Podpisz dokument elektronicznie"
#             upload unsigned.xml, sign, download signed XML
#   Option B: Cloud signature app (mSzafir, SimplySign, etc.)
#   Option C: Smart card middleware that outputs signed XML

ksef auth login-external --submit --input signed.xml --nip 1234567890 --env prod
```

The challenge expires after **10 minutes** — sign and submit promptly.

### Multi-NIP access

This is the primary use case for external signing. When another entity grants you permissions (e.g., `InvoiceRead`), you can authenticate in their NIP context using your own signature:

```bash
# Your NIP granted you InvoiceRead on NIP 9876543210
ksef auth login-external --generate --nip 9876543210 --env prod --output unsigned.xml
# Sign with your Profil Zaufany (identified by your PESEL)
ksef auth login-external --submit --input signed.xml --nip 9876543210 --env prod
# Now you can read their invoices
ksef invoice query --from "2026-01-01T00:00:00+00:00" --subjectType Subject2 --size 10
```

KSeF identifies you by the PESEL or NIP embedded in your signing certificate and verifies that you have the required permissions in the target NIP context.

### Library usage

```typescript
import { KSeFClient, authenticateWithExternalSignature } from 'ksef-client-ts';

const client = new KSeFClient({ environment: 'PROD' });

await authenticateWithExternalSignature(client, {
  contextIdentifier: { type: 'Nip', value: '9876543210' },
  signXml: async (unsignedXml: string) => {
    // Send to your signing service (cloud HSM, smart card middleware, etc.)
    const signedXml = await mySigningService.signXades(unsignedXml);
    return signedXml;
  },
});

// Authenticated — query invoices, generate tokens, etc.
```

### Supported signing methods

Any method that produces a valid XAdES-B enveloped signature over the `AuthTokenRequest` XML:

| Method | How to sign | Notes |
|---|---|---|
| Profil Zaufany | gov.pl → "Podpisz dokument elektronicznie" | Free, browser-based, uses PESEL |
| mSzafir / SimplySign | Cloud signing app or API | Qualified signature, may have API for automation |
| e-Dowod | National ID card with NFC reader | Requires compatible reader and middleware |
| Smart card (PKCS#11) | Middleware exports signed XML | Card-specific software needed |

### OCSP verification delay

On production, KSeF verifies the signing certificate's revocation status via OCSP/CRL from the certificate issuer. This can add a few seconds of delay during authentication. KSeF certificates (see below) avoid this delay since verification happens internally.

---

## KSeF Certificate (Recommended for Multi-NIP)

**The best method for automated multi-NIP access without interactive signing.**

A KSeF certificate is issued by the KSeF system itself. It is bound to your identity (PESEL or NIP) but **not to any specific NIP context** — you can use it to authenticate in any context where you have permissions.

### Key advantages

- **Programmatic signing** — private key stored locally as a file, no hardware token or cloud service needed
- **Multi-NIP** — one certificate works across all NIP contexts where you have permissions
- **Instant verification** — no OCSP/CRL delay, KSeF validates its own certificates internally
- **No browser required** — fully automated authentication from CLI or code

### How to obtain a KSeF certificate

**Via the web portal (recommended):**

1. Log in to the [KSeF web portal](https://ap.ksef.mf.gov.pl/web/) using Profil Zaufany or a qualified signature
2. Navigate to certificate management and request an `Authentication` type certificate
3. Download the issued certificate (`.crt`) and private key (`.key`) files
4. The private key is encrypted — you'll need the password you set during generation

The certificate is issued for the identity in your signing certificate (PESEL or NIP). Store the private key securely.

**Via the API** (requires an active XAdES-authenticated session):

```bash
# 1. Log in via external signing (one-time)
ksef auth login-external --generate --nip YOUR_NIP --env prod --output unsigned.xml
# Sign the XML, then submit
ksef auth login-external --submit --input signed.xml --nip YOUR_NIP --env prod

# 2. Request a KSeF Authentication certificate
ksef cert enroll --type Authentication --name "My automation cert"

# 3. Download the issued certificate
ksef cert get <reference-number>
```

### Using the KSeF certificate

Once you have the certificate and private key as PEM files:

```bash
# Authenticate in your own NIP context
ksef auth login --cert ./ksef-cert.pem --key ./ksef-key.pem --key-password 'my_passphrase' --nip YOUR_NIP

# Authenticate in another NIP context (where you have permissions)
ksef auth login --cert ./ksef-cert.pem --key ./ksef-key.pem --key-password 'my_passphrase' --nip 9876543210

# If the key is not encrypted, --key-password is not needed
ksef auth login --cert ./ksef-cert.pem --key ./ksef-key.pem --nip YOUR_NIP
```

### Certificate types

| Type | Purpose | Key Usage |
|---|---|---|
| `Authentication` | API authentication (online signing) | Digital Signature |
| `Offline` | Offline invoice QR code generation only | Non-Repudiation |

---

## Choosing the Right Method

### For development and testing

Use **Authorization Token**. Generate it from the KSeF TEST portal and authenticate via the CLI or library. This is the simplest path with no hardware requirements.

### For production automated systems (single NIP)

Use **Authorization Token** generated from the production KSeF portal. The token is encrypted before transmission and provides sufficient security for server-to-server integration.

### For production multi-NIP access (accounting firms, delegated access)

Use **KSeF Certificate**. Obtain it once via external signing (Profil Zaufany), then use it programmatically to authenticate in any NIP context where you have permissions. No browser or interactive signing needed after the initial setup.

### For one-time or occasional cross-NIP access

Use **External Signing** with Profil Zaufany. No setup required — just generate, sign in browser, submit. Good for infrequent operations or initial KSeF certificate enrollment.

### For production with legal signing requirements

Use **Qualified Electronic Signature** with appropriate PKCS#11 middleware to interact with the hardware token, or **External Signing** with a cloud-based qualified signature provider.

---

## CLI Usage

### Token authentication

```bash
# Set default NIP (one-time)
ksef config set --nip 1234567890

# Login with token
ksef auth login --token "AAAA-BBBB-CCCC-DDDD"

# Or specify NIP inline
ksef auth login --token "AAAA-BBBB-CCCC-DDDD" --nip 1234567890

# Verify session
ksef auth whoami

# Logout
ksef auth logout
```

### Certificate authentication (KSeF certificate or PEM files)

```bash
ksef auth login --cert ./ksef-cert.pem --key ./ksef-key.pem --nip 1234567890
```

### External signing (Profil Zaufany, cloud signatures)

```bash
# Generate unsigned XML
ksef auth login-external --generate --nip 1234567890 --env prod --output unsigned.xml

# Sign externally (e.g., gov.pl Profil Zaufany), then submit
ksef auth login-external --submit --input signed.xml --nip 1234567890 --env prod
```

### Other auth commands

```bash
# Request a raw challenge (for debugging)
ksef auth challenge

# Check auth status by reference number
ksef auth status <reference-number>

# Refresh an expiring access token
ksef auth refresh
```

---

## Library Usage

### Token authentication (recommended)

The high-level `loginWithToken()` method handles the entire ceremony (challenge, crypto init, encrypt, submit, redeem) in one call:

```typescript
import { KSeFClient } from 'ksef-client-ts';

const client = new KSeFClient({ environment: 'TEST' });

await client.loginWithToken('AAAA-BBBB-CCCC-DDDD', '1234567890');

// Tokens are stored in client.authManager — all subsequent API calls
// inject the Authorization header automatically.
const invoices = await client.invoices.queryInvoiceMetadata(filters);

// When done:
await client.logout();
```

### XAdES certificate authentication

The high-level `loginWithCertificate()` method handles challenge, AuthTokenRequest XML construction, XAdES signing, submit, and redeem:

```typescript
import fs from 'node:fs';
import { KSeFClient } from 'ksef-client-ts';

const client = new KSeFClient({ environment: 'TEST' });

const certPem = fs.readFileSync('./cert.pem', 'utf-8');
const keyPem = fs.readFileSync('./private-key.pem', 'utf-8');

await client.loginWithCertificate(certPem, keyPem, '1234567890');

// Authenticated — use any service method without passing tokens.
```

### Automatic token refresh

When a request gets a 401 response, `AuthManager` automatically calls `POST /auth/token/refresh` with the stored refresh token, retries the request with the new access token, and deduplicates concurrent refresh calls. No user code needed.

### Advanced: manual authentication flow

For full control over each step, use the low-level `AuthService` methods directly:

```typescript
const client = new KSeFClient({ environment: 'TEST' });

const challenge = await client.auth.getChallenge();
await client.crypto.init();
const encryptedToken = client.crypto.encryptKsefToken('AAAA-BBBB-CCCC-DDDD', challenge.timestamp);

const result = await client.auth.submitKsefTokenAuthRequest({
  challenge: challenge.challenge,
  contextIdentifier: { type: 'Nip', value: '1234567890' },
  encryptedToken: Buffer.from(encryptedToken).toString('base64'),
});

const tokens = await client.auth.getAccessToken(result.authenticationToken.token);

// Store tokens in AuthManager manually:
client.authManager.setAccessToken(tokens.accessToken.token);
client.authManager.setRefreshToken(tokens.refreshToken.token);
```

---

## Token Lifecycle

KSeF authentication uses three distinct token types:

### Access token

Short-lived token used for API calls. `AuthManager` injects it as a `Authorization: Bearer <token>` header on every request automatically. You never need to pass it to service methods.

When the access token expires, the next API call returns 401, triggering automatic refresh.

### Refresh token

Long-lived token used exclusively to obtain new access tokens. The refresh token **does not rotate** — `POST /v2/auth/token/refresh` returns only a new access token; the same refresh token remains valid until its `refreshTokenValidUntil` expiry.

If the refresh token itself expires, automatic refresh fails and you must re-authenticate.

### Auth token (operation token)

One-time token returned by the KSeF challenge flow. Used only during the login ceremony to poll `getAuthStatus()` and redeem access + refresh tokens. Discarded after redemption — never stored in `AuthManager`.

---

## Automatic Token Refresh

When `AuthManager` is configured (it is by default), `RestClient` handles 401 responses transparently:

1. A request receives a **401 Unauthorized** response
2. `RestClient` calls `authManager.onUnauthorized()`
3. `DefaultAuthManager` calls `POST /v2/auth/token/refresh` with the stored refresh token
4. If refresh succeeds, the new access token is stored and the **original request is retried once**
5. If refresh fails, the original 401 is thrown as `KSeFUnauthorizedError`

### Deduplication

If N parallel requests all receive 401, `DefaultAuthManager` coalesces them into a **single** refresh call. All N callers await the same Promise:

```typescript
// Simplified DefaultAuthManager.onUnauthorized():
async onUnauthorized(): Promise<string | null> {
  if (this.refreshPromise) return this.refreshPromise;
  this.refreshPromise = this.refreshFn()
    .then(token => { this.token = token ?? undefined; return token; })
    .finally(() => { this.refreshPromise = null; });
  return this.refreshPromise;
}
```

### No infinite loops

The retry happens at most once per request. If the retried request also returns 401, the error is thrown without another refresh attempt. Internal auth requests (e.g., `refreshAccessToken()`) set a `skipAuthRetry` flag to prevent the refresh endpoint itself from triggering a recursive refresh cycle.

---

## Custom AuthManager

Replace the default `AuthManager` by passing a custom implementation:

```typescript
import { KSeFClient } from 'ksef-client-ts';
import type { AuthManager } from 'ksef-client-ts';

class MyAuthManager implements AuthManager {
  private accessToken: string | undefined;
  private refreshToken: string | undefined;

  getAccessToken() { return this.accessToken; }
  setAccessToken(token: string | undefined) { this.accessToken = token; }
  getRefreshToken() { return this.refreshToken; }
  setRefreshToken(token: string | undefined) { this.refreshToken = token; }

  async onUnauthorized(): Promise<string | null> {
    // Custom refresh logic: vault, external service, etc.
    const newToken = await myTokenService.refresh(this.refreshToken);
    if (newToken) { this.accessToken = newToken; return newToken; }
    return null;
  }
}

const client = new KSeFClient({
  authManager: new MyAuthManager(),
});

// loginWithToken/loginWithCertificate still work — they call
// authManager.setAccessToken() / setRefreshToken() after the ceremony.
await client.loginWithToken('AAAA-BBBB-CCCC-DDDD', '1234567890');
```

Use cases: testing (mock tokens), custom storage (database, Redis), external auth systems (secrets manager).

---

## Session Hydration (CLI)

The CLI persists session state to `~/.ksef/session.json` (mode `0o600`) after login. On subsequent invocations, `requireSession()` creates a `KSeFClient` and hydrates `AuthManager`:

```typescript
const client = createClient(opts);
client.authManager.setAccessToken(session.accessToken);
client.authManager.setRefreshToken(session.refreshToken);
```

If the stored access token has expired, the first API request triggers automatic refresh transparently. The session file retains the old access token — on the next CLI invocation, another refresh occurs. This is acceptable because the refresh token is long-lived and each refresh is a single lightweight API call.
