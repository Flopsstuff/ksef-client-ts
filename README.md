# ksef-client-ts

TypeScript client for the Polish National e-Invoice System (KSeF) API v2.

## Features

- Full KSeF API v2 coverage: authentication, sessions, invoices, permissions, tokens, certificates
- AES-256-CBC / RSA-OAEP / ECDH+AES-GCM encryption and KSeF token encryption
- XAdES-B enveloped XML signatures (RSA-SHA256 and ECDSA-SHA256)
- Self-signed certificate generation, CSR generation (RSA-2048 / ECDSA P-256)
- QR code generation (PNG, Base64, SVG) and invoice/certificate verification links
- Lighthouse system status monitoring and Peppol provider queries
- Test data management for the TEST environment
- Fluent builders for auth requests, invoice queries, and permission grants
- Input validation with regex patterns and branded types
- Dual ESM/CJS output with full TypeScript declarations
- Zero HTTP dependencies -- uses native `fetch` (Node.js 18+)

## Installation

```bash
npm install ksef-client-ts
# or
yarn add ksef-client-ts
```

Requires **Node.js 18+**.

## Quick Start

```ts
import {
  KSeFClient,
  AuthTokenRequestBuilder,
  SignatureService,
  CertificateService,
} from 'ksef-client-ts';

// 1. Create client (defaults to TEST environment)
const client = new KSeFClient({ environment: 'TEST' });

// 2. Initialize crypto (fetches KSeF public certificates)
await client.crypto.init();

// 3. Generate a self-signed certificate for testing
const { certificatePem, privateKeyPem } =
  await CertificateService.generatePersonalCertificate(
    'Jan', 'Kowalski', '00000000001', 'Jan Kowalski',
  );

// 4. Get an auth challenge from KSeF
const challenge = await client.auth.getChallenge();

// 5. Build the auth token request XML
const tokenRequest = new AuthTokenRequestBuilder()
  .withChallenge(challenge.challenge)
  .withContextNip('1234567890')
  .withSubjectType('Pesel')
  .build();

// 6. Sign the XML with XAdES-B enveloped signature
const tokenRequestXml = '<AuthTokenRequest>...</AuthTokenRequest>'; // serialise tokenRequest to XML
const signedXml = SignatureService.sign(tokenRequestXml, certificatePem, privateKeyPem);

// 7. Submit signed auth request
const authResult = await client.auth.submitXadesAuthRequest(signedXml);

// 8. Poll for auth status and get access token
const authStatus = await client.auth.getAuthStatus(
  authResult.referenceNumber,
  authResult.authenticationToken.token,
);
const tokens = await client.auth.getAccessToken(authResult.authenticationToken.token);
const accessToken = tokens.accessToken;

// 9. Open an online session
const encryptionData = client.crypto.getEncryptionData();
const session = await client.onlineSession.openSession(
  { encryptionInfo: encryptionData.encryptionInfo },
  accessToken,
);

// 10. Send an invoice
const invoiceXml = '<Invoice>...</Invoice>';
const encrypted = client.crypto.encryptAES256(
  new TextEncoder().encode(invoiceXml),
  encryptionData.cipherKey,
  encryptionData.cipherIv,
);
const metadata = client.crypto.getFileMetadata(new TextEncoder().encode(invoiceXml));
await client.onlineSession.sendInvoice(
  session.referenceNumber,
  { invoiceBody: Buffer.from(encrypted).toString('base64'), ...metadata },
  accessToken,
);

// 11. Close the session
await client.onlineSession.closeSession(session.referenceNumber, accessToken);
```

See [docs/examples.md](docs/examples.md) for more usage patterns and [docs/api-reference.md](docs/api-reference.md) for the full API reference.

## API Overview

`KSeFClient` exposes 15 namespaced service properties:

| Property | Service | Description |
|---|---|---|
| `auth` | `AuthService` | Challenge, XAdES auth, KSeF token auth, access/refresh tokens |
| `activeSessions` | `ActiveSessionsService` | List and revoke active sessions |
| `onlineSession` | `OnlineSessionService` | Open/close online sessions, send invoices |
| `batchSession` | `BatchSessionService` | Open/close batch sessions, upload parts |
| `sessionStatus` | `SessionStatusService` | Session status, invoice lists, UPO download |
| `invoices` | `InvoiceDownloadService` | Download invoices, query metadata, exports |
| `permissions` | `PermissionsService` | Grant/revoke/query permissions (7 grant types, 7 query types) |
| `tokens` | `TokenService` | Generate, query, get, revoke KSeF tokens |
| `certificates` | `CertificateApiService` | Certificate enrollment, revocation, metadata queries |
| `crypto` | `CryptographyService` | AES/RSA/ECDH encryption, token encryption, file metadata, CSR gen |
| `lighthouse` | `LighthouseService` | KSeF system status and messages |
| `limits` | `LimitsService` | Context, subject, and rate limits |
| `peppol` | `PeppolService` | Peppol provider queries |
| `testData` | `TestDataService` | Subject/person/permissions/limits management (TEST env) |
| `qr` | `VerificationLinkService` | Invoice and certificate verification URLs |

## Static Utilities

```ts
import { SignatureService, CertificateService, QrCodeService } from 'ksef-client-ts';

// XAdES-B enveloped XML signature
const signedXml = SignatureService.sign(xml, certPem, privateKeyPem);

// Self-signed certificates
const personal = await CertificateService.generatePersonalCertificate(givenName, surname, serialNumber, cn, method?);
const seal = await CertificateService.generateCompanySeal(orgName, orgIdentifier, cn, method?);
const fingerprint = CertificateService.getSha256Fingerprint(certPem);

// QR codes
const pngBuffer = await QrCodeService.generateQrCode(url, options?);
const base64 = await QrCodeService.generateQrCodeBase64(url, options?);
const svg = await QrCodeService.generateQrCodeSvg(url, options?);
const svgLabelled = await QrCodeService.generateQrCodeSvgWithLabel(url, label, options?);
```

## Builders

- **AuthTokenRequestBuilder** -- `withChallenge()`, `withContextNip()`, `withSubjectType()`, `withAuthorizationPolicy()`, `build()`
- **AuthKsefTokenRequestBuilder** -- `withChallenge()`, `withContextNip()`, `withEncryptedToken()`, `build()`
- **InvoiceQueryFilterBuilder** -- `withSubjectType()`, `withDateRange()`, `withKsefNumber()`, `withAmountRange()`, `withSellerNip()`, `build()`
- **PersonPermissionGrantBuilder** -- `withSubjectIdentifier()`, `addPermission()`, `build()`
- **EntityPermissionGrantBuilder** -- `withNip()`, `addPermission()`, `build()`
- **AuthorizationPermissionGrantBuilder** -- `withPermission()`, `build()`

## Configuration

```ts
interface KSeFClientOptions {
  environment?: 'TEST' | 'DEMO' | 'PRD';  // default: 'TEST'
  baseUrl?: string;                         // override API URL
  baseQrUrl?: string;                       // override QR verification URL
  lighthouseUrl?: string;                   // override Lighthouse URL
  apiVersion?: string;                      // default: 'v2'
  timeout?: number;                         // default: 30000 (ms)
  customHeaders?: Record<string, string>;
}
```

| Environment | API URL | QR URL |
|---|---|---|
| `TEST` | `https://api-test.ksef.mf.gov.pl` | `https://qr-test.ksef.mf.gov.pl` |
| `DEMO` | `https://api-demo.ksef.mf.gov.pl` | `https://qr-demo.ksef.mf.gov.pl` |
| `PRD` | `https://api.ksef.mf.gov.pl` | `https://qr.ksef.mf.gov.pl` |

## Error Handling

```ts
import { KSeFApiError, KSeFRateLimitError } from 'ksef-client-ts';

try {
  await client.auth.getChallenge();
} catch (error) {
  if (error instanceof KSeFRateLimitError) {
    console.log(`Rate limited. Retry after ${error.recommendedDelay}s`);
  } else if (error instanceof KSeFApiError) {
    console.log(`API error ${error.statusCode}: ${error.message}`);
    console.log(error.errorResponse); // structured error details
  }
}
```

## Validation

The `validation` module provides 17 regex patterns and 13 validator functions for KSeF identifiers:

```ts
import { isValidNip, isValidKsefNumber, isValidPesel, Nip } from 'ksef-client-ts';

isValidNip('1234567890');        // boolean
isValidKsefNumber('...');       // boolean
Nip.test('1234567890');          // use regex directly
```

Patterns: `Nip`, `VatUe`, `NipVatUe`, `InternalId`, `PeppolId`, `ReferenceNumber`, `KsefNumber`, `KsefNumberV35`, `KsefNumberV36`, `Pesel`, `CertificateName`, `CertificateFingerprint`, `Base64String`, `Ip4Address`, `Ip4Range`, `Ip4Mask`, `Sha256Base64`.

## Development

```bash
yarn install      # Install dependencies (yarn 4.x via Corepack)
yarn build        # Build ESM + CJS + DTS via tsup
yarn lint         # Type-check (tsc --noEmit)
yarn test         # Run all tests (vitest)
```

## Status

All phases complete: foundation, auth/sessions, services, cryptography, QR codes and verification links.

## License

[MIT](LICENSE)
