# KSeF Authentication Guide

Overview of authentication methods supported by the Polish National e-Invoice System (KSeF) and how they map to this library and CLI.

---

## Table of Contents

1. [Authentication Methods Overview](#authentication-methods-overview)
2. [Authorization Token (Recommended for Development)](#authorization-token)
3. [Qualified Electronic Signature (XAdES)](#qualified-electronic-signature-xades)
4. [Trusted Profile / e-Dowod (National Node)](#trusted-profile--e-dowód-national-node)
5. [Choosing the Right Method](#choosing-the-right-method)
6. [CLI Usage](#cli-usage)
7. [Library Usage](#library-usage)

---

## Authentication Methods Overview

KSeF supports three categories of authentication, each with different security properties and practical constraints:

| Method | Key Storage | Suitable For | CLI Support |
|---|---|---|---|
| Authorization Token | KSeF portal (encrypted in transit) | Development, automated systems | `ksef auth login --token` |
| Qualified Signature (XAdES) | Hardware token (smart card, USB) | Production, legal compliance | `ksef auth login --cert --key` |
| Trusted Profile / e-Dowod | Government infrastructure | Interactive browser sessions | Not applicable |

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

### KSeF portal URLs

| Environment | Portal URL |
|---|---|
| TEST | `https://ksef-test.mf.gov.pl` |
| DEMO | `https://ksef-demo.mf.gov.pl` |
| PRODUCTION | `https://ksef.mf.gov.pl` |

### KSeF API URLs (KSeF 2.0)

| Environment | API URL |
|---|---|
| TEST | `https://api-test.ksef.mf.gov.pl` |
| DEMO | `https://api-demo.ksef.mf.gov.pl` |
| PRODUCTION | `https://api.ksef.mf.gov.pl` |

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

## Trusted Profile / e-Dowod (National Node)

Authentication via Poland's national identity infrastructure:

- **Profil Zaufany** (Trusted Profile) — government-issued digital identity
- **e-Dowod** (electronic ID card) — national ID with a cryptographic layer

These methods use an interactive browser-based flow through the National Node (Wezel Krajowy). They are **not suitable for CLI or programmatic access** — they require user interaction in a web browser with redirects to government identity providers.

---

## Choosing the Right Method

### For development and testing

Use **Authorization Token**. Generate it from the KSeF TEST portal and authenticate via the CLI or library. This is the simplest path with no hardware requirements.

### For production automated systems

Use **Authorization Token** generated from the production KSeF portal. The token is encrypted before transmission and provides sufficient security for server-to-server integration.

### For production with legal signing requirements

Use **Qualified Electronic Signature** with appropriate PKCS#11 middleware to interact with the hardware token. Note that this requires integration beyond what the CLI currently provides — you would use the library's `SignatureService.sign()` with a key extracted through your middleware stack.

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

### Certificate authentication (when PEM files are available)

```bash
ksef auth login --cert ./cert.pem --key ./private-key.pem --nip 1234567890
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

### Token authentication

```typescript
import { KSeFClient } from 'ksef-client-ts';

const client = new KSeFClient({ environment: 'TEST' });

// 1. Get challenge
const challenge = await client.auth.getChallenge();

// 2. Initialize crypto (fetches KSeF public certificates)
await client.crypto.init();

// 3. Encrypt the token
const encryptedToken = client.crypto.encryptKsefToken(
  'AAAA-BBBB-CCCC-DDDD',
  challenge.timestamp,
);

// 4. Submit encrypted token
const result = await client.auth.submitKsefTokenAuthRequest({
  challenge: challenge.challenge,
  contextIdentifier: { type: 'Nip', value: '1234567890' },
  encryptedToken: Buffer.from(encryptedToken).toString('base64'),
});

// 5. Redeem for access token
const authToken = result.authenticationToken.token;
const session = await client.auth.getAccessToken(authToken);

console.log('Access token:', session.accessToken.token);
console.log('Valid until:', session.accessToken.validUntil);
```

### XAdES certificate authentication

```typescript
import fs from 'node:fs';
import { KSeFClient, SignatureService } from 'ksef-client-ts';

const client = new KSeFClient({ environment: 'TEST' });

// 1. Get challenge
const challenge = await client.auth.getChallenge();

// 2. Sign the challenge XML with XAdES-B
const certPem = fs.readFileSync('./cert.pem', 'utf-8');
const keyPem = fs.readFileSync('./private-key.pem', 'utf-8');
const signedXml = SignatureService.sign(challenge.challenge, certPem, keyPem);

// 3. Submit signed XML
const result = await client.auth.submitXadesAuthRequest(signedXml);

// 4. Redeem for access token
const authToken = result.authenticationToken.token;
const session = await client.auth.getAccessToken(authToken);
```
