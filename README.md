# ksef-client-ts

TypeScript client for the Polish National e-Invoice System (KSeF) API v2.

## Features

- Full KSeF API v2 coverage: auth, sessions, invoices, permissions, tokens, certificates
- AES-256-CBC / RSA-OAEP / ECDH+AES-GCM encryption
- XAdES-B enveloped XML signatures
- Self-signed certificate & CSR generation
- Dual ESM/CJS output with full TypeScript declarations
- Zero HTTP dependencies — uses native `fetch` (Node.js 18+)

## Installation

```bash
npm install ksef-client-ts
# or
yarn add ksef-client-ts
```

Requires **Node.js 18+**.

## Quick Start

```ts
import { KSeFClient, Environment, SignatureService, CertificateService } from 'ksef-client-ts';

// Create client (defaults to TEST environment)
const client = new KSeFClient({ environment: 'TEST' });

// Initialize crypto (fetches KSeF public certificates)
await client.crypto.init();

// Authenticate with XAdES signature
const challenge = await client.auth.getChallenge();
// ... sign the auth token request XML with SignatureService.sign() ...
const authResult = await client.auth.submitXadesAuthRequest(signedXml);

// Poll for access tokens
const status = await client.auth.getAuthStatus(authResult.referenceNumber, authResult.authenticationToken.token);
const tokens = await client.auth.getAccessToken(authResult.authenticationToken.token);

// Open an online session
const encryptionData = client.crypto.getEncryptionData();
const session = await client.onlineSession.open(/* ... */);

// Send invoices, query metadata, manage permissions, etc.
```

## API Overview

`KSeFClient` exposes namespaced service properties:

| Property | Description |
|---|---|
| `client.auth` | Authentication (challenge, XAdES, KSeF token, access/refresh tokens) |
| `client.activeSessions` | List and revoke active sessions |
| `client.onlineSession` | Open/close online sessions, send invoices |
| `client.batchSession` | Open/close batch sessions |
| `client.sessionStatus` | Session status, invoice lists, UPO download |
| `client.invoices` | Download invoices, query metadata, exports |
| `client.permissions` | Grant/revoke/query permissions (person, entity, authorization) |
| `client.tokens` | Generate, query, revoke KSeF tokens |
| `client.certificates` | Certificate enrollment, revocation, metadata |
| `client.crypto` | AES/RSA encryption, token encryption, file metadata, CSR generation |
| `client.lighthouse` | System status and messages |
| `client.limits` | Context/subject/rate limits |
| `client.peppol` | Peppol provider queries |
| `client.testData` | Test data management (TEST environment only) |

Static utilities (import directly):

- `SignatureService.sign(xml, certPem, privateKeyPem)` — XAdES-B enveloped signatures
- `CertificateService.generatePersonalCertificate(...)` — self-signed certs for testing
- `CertificateService.generateCompanySeal(...)` — self-signed company seal certs
- `CertificateService.getSha256Fingerprint(certPem)` — certificate fingerprints

## Environments

```ts
// Preset environments
new KSeFClient({ environment: 'TEST' })  // ksef-test.mf.gov.pl (default)
new KSeFClient({ environment: 'DEMO' })  // ksef-demo.mf.gov.pl
new KSeFClient({ environment: 'PRD' })   // ksef.mf.gov.pl

// Custom URL
new KSeFClient({ baseUrl: 'https://custom-ksef.example.com/api' })
```

## Development

```bash
yarn install
yarn build        # Build ESM + CJS + DTS
yarn lint         # Type-check (tsc --noEmit)
yarn test         # Run tests
```

## Status

Work in progress — Phases 1–4 complete (foundation, auth/sessions, services, crypto). QR codes and utilities coming next.

## License

[MIT](LICENSE)
