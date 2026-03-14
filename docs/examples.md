# Usage Examples

Complete usage examples for `ksef-client-ts`. All examples target the KSeF TEST environment and use `async/await`.

---

## Table of Contents

1. [Authentication with XAdES Signature](#1-authentication-with-xades-signature)
2. [Authentication with KSeF Token](#2-authentication-with-ksef-token)
3. [Online Session: Send Invoice](#3-online-session-send-invoice)
4. [Query Invoice Metadata](#4-query-invoice-metadata)
5. [Manage Permissions](#5-manage-permissions)
6. [Generate QR Code](#6-generate-qr-code)
7. [Self-Signed Certificate](#7-self-signed-certificate)

---

## 1. Authentication with XAdES Signature

Full authentication flow using a qualified certificate (XAdES-B enveloped signature). This is the primary authentication method for production use.

```typescript
import fs from 'node:fs';
import {
  KSeFClient,
  AuthTokenRequestBuilder,
  SignatureService,
} from 'ksef-client-ts';

async function authenticateWithXades() {
  // 1. Create client targeting the TEST environment
  const client = new KSeFClient({ environment: 'TEST' });

  // 2. Initialize cryptography (fetches KSeF public certificates)
  await client.crypto.init();

  // 3. Obtain an authentication challenge from KSeF
  const challenge = await client.auth.getChallenge();
  console.log('Challenge:', challenge.challenge);
  console.log('Timestamp:', challenge.timestamp);

  // 4. Build the auth token request XML using the builder
  const tokenRequest = new AuthTokenRequestBuilder()
    .withChallenge(challenge.challenge)
    .withContextNip('1234567890')
    .withSubjectType('Nip')
    .build();

  // The token request must be serialized to XML before signing.
  // The exact XML schema depends on your KSeF schema version.
  const authRequestXml = buildAuthRequestXml(tokenRequest);

  // 5. Load your qualified certificate and private key from PEM files
  const certPem = fs.readFileSync('/path/to/certificate.pem', 'utf-8');
  const privateKeyPem = fs.readFileSync('/path/to/private-key.pem', 'utf-8');

  // 6. Sign the XML with an XAdES-B enveloped signature
  const signedXml = SignatureService.sign(authRequestXml, certPem, privateKeyPem);

  // 7. Submit the signed XML to KSeF
  const signatureResponse = await client.auth.submitXadesAuthRequest(signedXml);
  const { referenceNumber, authenticationToken } = signatureResponse;
  console.log('Reference number:', referenceNumber);
  console.log('Auth token valid until:', authenticationToken.validUntil);

  // 8. Check authentication status
  const authStatus = await client.auth.getAuthStatus(
    referenceNumber,
    authenticationToken.token,
  );
  console.log('Auth status:', authStatus.status.description);

  // 9. Redeem the auth token for an access token (used for all subsequent API calls)
  const tokenResponse = await client.auth.getAccessToken(authenticationToken.token);
  const accessToken = tokenResponse.accessToken.token;
  console.log('Access token obtained, valid until:', tokenResponse.accessToken.validUntil);

  return accessToken;
}

// Helper: build auth request XML (structure depends on KSeF XSD)
function buildAuthRequestXml(tokenRequest: {
  challenge: string;
  contextIdentifier: { type: string; value: string };
  subjectIdentifierType: string;
}): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<AuthorisationChallengeRequest xmlns="http://ksef.mf.gov.pl/schema/gtw/svc/online/types/2021/10/01/0001">
  <Challenge>${tokenRequest.challenge}</Challenge>
  <ContextIdentifier>
    <Type>${tokenRequest.contextIdentifier.type}</Type>
    <Identifier>${tokenRequest.contextIdentifier.value}</Identifier>
  </ContextIdentifier>
  <SubjectIdentifierType>${tokenRequest.subjectIdentifierType}</SubjectIdentifierType>
</AuthorisationChallengeRequest>`;
}
```

**Notes:**
- `SignatureService.sign()` is a static method -- no instance needed.
- Pass `verifyCertificateChain: true` as the second argument to `submitXadesAuthRequest()` if you want KSeF to verify the full certificate chain.
- The access token from `getAccessToken()` is required for all authenticated API operations (invoices, permissions, sessions, etc.).

---

## 2. Authentication with KSeF Token

A simpler authentication flow using a pre-issued KSeF authorization token. The token is encrypted with the KSeF public key before submission.

```typescript
import {
  KSeFClient,
  AuthKsefTokenRequestBuilder,
} from 'ksef-client-ts';

async function authenticateWithKsefToken() {
  const client = new KSeFClient({ environment: 'TEST' });

  // Initialize cryptography (required for token encryption)
  await client.crypto.init();

  // Get challenge
  const challenge = await client.auth.getChallenge();

  // Encrypt the KSeF token using the KSeF public certificate.
  // The token payload becomes "<token>|<challengeTimestampMs>" and is encrypted
  // with RSA-OAEP or ECDH+AES-GCM depending on the KSeF certificate key type.
  const ksefToken = 'your-ksef-authorization-token';
  const encryptedTokenBytes = client.crypto.encryptKsefToken(
    ksefToken,
    challenge.timestamp,
  );
  const encryptedTokenBase64 = Buffer.from(encryptedTokenBytes).toString('base64');

  // Build the token auth request
  const tokenRequest = new AuthKsefTokenRequestBuilder()
    .withChallenge(challenge.challenge)
    .withContextNip('1234567890')
    .withEncryptedToken(encryptedTokenBase64)
    .build();

  // Submit the token auth request
  const signatureResponse = await client.auth.submitKsefTokenAuthRequest(tokenRequest);
  console.log('Reference number:', signatureResponse.referenceNumber);

  // Redeem for access token
  const tokenResponse = await client.auth.getAccessToken(
    signatureResponse.authenticationToken.token,
  );

  console.log('Access token:', tokenResponse.accessToken.token);
  console.log('Valid until:', tokenResponse.accessToken.validUntil);

  return tokenResponse.accessToken.token;
}
```

**Notes:**
- Unlike XAdES, this flow does not require a qualified certificate or XML signing.
- `encryptKsefToken()` automatically selects RSA-OAEP or ECDH+AES-GCM based on the KSeF token encryption certificate's key type.
- The builder also supports `withContextInternalId()`, `withContextNipVatUe()`, and `withContextPeppolId()` for different context identifier types.

---

## 3. Online Session: Send Invoice

Open an online session with encryption, encrypt and send an invoice, then close the session.

```typescript
import {
  KSeFClient,
} from 'ksef-client-ts';
import type {
  OpenOnlineSessionRequest,
  SendInvoiceRequest,
} from 'ksef-client-ts';

async function sendInvoiceInSession(accessToken: string) {
  const client = new KSeFClient({ environment: 'TEST' });
  await client.crypto.init();

  // 1. Generate encryption data (random AES-256 key + IV, key wrapped with KSeF RSA cert)
  const encryptionData = client.crypto.getEncryptionData();

  // 2. Open an online session
  const openRequest: OpenOnlineSessionRequest = {
    formCode: {
      systemCode: 'FA (2)',
      schemaVersion: '1-0E',
      value: 'FA',
    },
    encryption: encryptionData.encryptionInfo,
  };

  const session = await client.onlineSession.openSession(openRequest, accessToken);
  console.log('Session opened:', session.referenceNumber);
  console.log('Valid until:', session.validUntil);

  try {
    // 3. Prepare the invoice XML (your application logic)
    const invoiceXml = '<Invoice>...</Invoice>';
    const invoiceBytes = new TextEncoder().encode(invoiceXml);

    // 4. Compute metadata for the plaintext invoice
    const invoiceMeta = client.crypto.getFileMetadata(invoiceBytes);

    // 5. Encrypt the invoice body with AES-256-CBC
    const encryptedInvoice = client.crypto.encryptAES256(
      invoiceBytes,
      encryptionData.cipherKey,
      encryptionData.cipherIv,
    );

    // 6. Compute metadata for the encrypted invoice
    const encryptedMeta = client.crypto.getFileMetadata(encryptedInvoice);

    // 7. Build the send invoice request
    const sendRequest: SendInvoiceRequest = {
      invoiceHash: invoiceMeta.hashSHA,
      invoiceSize: invoiceMeta.fileSize,
      encryptedInvoiceHash: encryptedMeta.hashSHA,
      encryptedInvoiceSize: encryptedMeta.fileSize,
      encryptedInvoiceContent: Buffer.from(encryptedInvoice).toString('base64'),
    };

    // 8. Send the invoice
    const sendResponse = await client.onlineSession.sendInvoice(
      session.referenceNumber,
      sendRequest,
      accessToken,
    );
    console.log('Invoice sent, reference:', sendResponse.referenceNumber);
  } finally {
    // 9. Always close the session
    await client.onlineSession.closeSession(session.referenceNumber, accessToken);
    console.log('Session closed');
  }
}
```

**Notes:**
- `getEncryptionData()` generates a fresh AES-256 key and IV, then wraps the key with the KSeF SymmetricKeyEncryption certificate (RSA-OAEP). The `encryptionInfo` object contains the base64-encoded encrypted key and IV for the API request.
- `getFileMetadata()` returns `{ hashSHA: string, fileSize: number }` -- SHA-256 hash (base64) and byte length.
- Always close the session in a `finally` block to avoid leaving orphan sessions.

---

## 4. Query Invoice Metadata

Use `InvoiceQueryFilterBuilder` to construct filters and query invoice metadata with pagination.

```typescript
import {
  KSeFClient,
  InvoiceQueryFilterBuilder,
} from 'ksef-client-ts';

async function queryInvoices(accessToken: string) {
  const client = new KSeFClient({ environment: 'TEST' });

  // Build query filters using the fluent builder API
  const filters = new InvoiceQueryFilterBuilder()
    .withSubjectType('Subject1')                       // Invoices where we are the seller
    .withDateRange('2025-01-01T00:00:00', '2025-03-31T23:59:59')
    .withAmountRange(1000, 50000)                      // Amount between 1000 and 50000
    .withCurrencyCodes(['PLN', 'EUR'])                 // PLN or EUR invoices
    .withInvoiceTypes(['VAT', 'COR'])                  // VAT invoices and corrections
    .withFormType('FA')                                // FA form type
    .build();

  // First page (page 0, 25 items per page, ascending order)
  const page1 = await client.invoices.queryInvoiceMetadata(
    filters,
    accessToken,
    0,     // pageOffset
    25,    // pageSize
    'Asc', // sortOrder
  );

  console.log(`Found ${page1.invoices.length} invoices (hasMore: ${page1.hasMore})`);

  for (const invoice of page1.invoices) {
    console.log(`  ${invoice.ksefNumber} | ${invoice.invoiceNumber} | ${invoice.totalAmount} ${invoice.currencyCode}`);
    console.log(`    Seller: ${invoice.sellerNip}, Date: ${invoice.invoicingDate}`);
  }

  // Fetch next page if available
  if (page1.hasMore) {
    const page2 = await client.invoices.queryInvoiceMetadata(
      filters,
      accessToken,
      1,     // pageOffset (next page)
      25,
      'Asc',
    );
    console.log(`Page 2: ${page2.invoices.length} invoices`);
  }

  // You can also filter by seller NIP or buyer identifier
  const narrowFilters = new InvoiceQueryFilterBuilder()
    .withSubjectType('Subject2')                       // Invoices where we are the buyer
    .withDateRange('2025-02-01T00:00:00', '2025-02-28T23:59:59')
    .withSellerNip('9876543210')
    .withInvoiceFilterInvoicingMode('Standalone')
    .build();

  const result = await client.invoices.queryInvoiceMetadata(narrowFilters, accessToken);
  console.log(`Filtered results: ${result.invoices.length}`);
}
```

**Notes:**
- `withSubjectType()` and `withDateRange()` are required -- the builder will throw if they are missing.
- `InvoiceSubjectType` values: `'Subject1'` (seller), `'Subject2'` (buyer), `'Subject3'` (other party), `'SubjectAuthorized'` (authorized subject).
- `pageOffset` and `pageSize` are optional in `queryInvoiceMetadata()`. If omitted, the API uses its defaults.
- The response includes `isTruncated` -- if true, the result set exceeded the API limit and not all matching invoices are returned.

---

## 5. Manage Permissions

Grant person permissions, query them, then revoke. Shows the full grant-query-revoke lifecycle.

```typescript
import {
  KSeFClient,
  PersonPermissionGrantBuilder,
} from 'ksef-client-ts';

async function managePermissions(accessToken: string) {
  const client = new KSeFClient({ environment: 'TEST' });

  // 1. Grant permissions to a person (identified by NIP)
  const grantRequest = new PersonPermissionGrantBuilder()
    .withSubjectIdentifier('Nip', '1234567890')
    .addPermission('InvoiceRead')
    .addPermission('InvoiceWrite')
    .addPermission('CredentialsRead')
    .build();

  const grantResult = await client.permissions.grantPersonPermissions(
    grantRequest,
    accessToken,
  );
  console.log('Grant operation reference:', grantResult.referenceNumber);

  // 2. Check the operation status
  const opStatus = await client.permissions.getOperationStatus(
    grantResult.referenceNumber,
    accessToken,
  );
  console.log('Processing status:', opStatus.processingDescription);

  // 3. Query person permissions to verify the grant
  const personsResult = await client.permissions.queryPersonsGrants(
    accessToken,
    {
      subjectIdentifier: { type: 'Nip', value: '1234567890' },
      pageOffset: 0,
      pageSize: 50,
    },
  );

  console.log(`Found ${personsResult.permissions.length} person permissions:`);
  for (const perm of personsResult.permissions) {
    console.log(`  ID: ${perm.permissionId} | ${perm.permission} | granted: ${perm.grantDate}`);
  }

  // 4. Revoke a specific permission by its ID
  if (personsResult.permissions.length > 0) {
    const permissionToRevoke = personsResult.permissions[0]!;
    const revokeResult = await client.permissions.revokeCommonGrant(
      permissionToRevoke.permissionId,
      accessToken,
    );
    console.log('Revoke operation reference:', revokeResult.referenceNumber);
  }

  // 5. You can also query your own (personal) grants
  const myGrants = await client.permissions.queryPersonalGrants(accessToken, {
    pageOffset: 0,
    pageSize: 100,
  });
  console.log(`My personal permissions: ${myGrants.permissions.length}`);
  for (const perm of myGrants.permissions) {
    console.log(`  ${perm.permission} (granted: ${perm.grantDate})`);
  }
}
```

**Notes:**
- `PersonPermissionGrantBuilder.withSubjectIdentifier()` accepts a `PermissionSubjectIdentifierType` (`'Nip'`, `'Pesel'`, or `'Fingerprint'`) and a value.
- Available `PersonPermissionType` values: `'InvoiceRead'`, `'InvoiceWrite'`, `'CredentialsRead'`, `'CredentialsManage'`, `'EnforcementOperations'`, `'SubunitManage'`, `'Introspection'`.
- Use `revokeCommonGrant()` for person/entity/subunit grants, and `revokeAuthorizationGrant()` for authorization grants.
- The `EntityPermissionGrantBuilder` and `AuthorizationPermissionGrantBuilder` follow the same pattern for entity and authorization permissions respectively.

---

## 6. Generate QR Code

Build invoice verification URLs and generate QR codes in PNG, SVG, and SVG-with-label formats.

```typescript
import fs from 'node:fs';
import {
  KSeFClient,
  QrCodeService,
} from 'ksef-client-ts';

async function generateQrCodes() {
  const client = new KSeFClient({ environment: 'TEST' });

  // 1. Build an invoice verification URL (Code I)
  //    Requires: seller NIP, invoice issue date, invoice SHA-256 hash (base64)
  const invoiceHashBase64 = 'abc123def456ghij789klmnopqrstuv0123456789AB==';
  const verificationUrl = client.qr.buildInvoiceVerificationUrl(
    '1234567890',                // seller NIP
    new Date('2025-06-15'),      // invoice issue date
    invoiceHashBase64,           // SHA-256 hash of the invoice (base64)
  );
  console.log('Verification URL:', verificationUrl);
  // Output: https://qr-test.ksef.mf.gov.pl/invoice/1234567890/15-06-2025/abc123def456ghij789klmnopqrstuv0123456789AB

  // 2. Generate a PNG QR code
  const pngBuffer = await QrCodeService.generateQrCode(verificationUrl, {
    width: 400,
    margin: 2,
    errorCorrectionLevel: 'H',
  });
  fs.writeFileSync('/tmp/invoice-qr.png', pngBuffer);
  console.log('PNG QR code saved');

  // 3. Generate a base64-encoded PNG (useful for embedding in HTML or emails)
  const base64Png = await QrCodeService.generateQrCodeBase64(verificationUrl);
  console.log('Base64 PNG length:', base64Png.length);

  // 4. Generate an SVG QR code
  const svg = await QrCodeService.generateQrCodeSvg(verificationUrl, {
    width: 300,
  });
  fs.writeFileSync('/tmp/invoice-qr.svg', svg);

  // 5. Generate an SVG QR code with a label beneath it
  const svgWithLabel = await QrCodeService.generateQrCodeSvgWithLabel(
    verificationUrl,
    'Invoice #FV/2025/001',
    { width: 300, errorCorrectionLevel: 'M' },
  );
  fs.writeFileSync('/tmp/invoice-qr-labelled.svg', svgWithLabel);

  // 6. Generate a QrCodeResult (contains both URL and base64 QR code)
  const result = await QrCodeService.generateResult(verificationUrl);
  console.log('QR result URL:', result.url);
  console.log('QR result base64 length:', result.qrCode.length);
}
```

**Notes:**
- `QrCodeService` methods are all static -- no instance needed.
- `buildInvoiceVerificationUrl()` accepts `Date` objects or ISO date strings for the issue date. Internally, it formats the date as `DD-MM-YYYY` and converts the hash to base64url encoding.
- `QrCodeOptions` fields are all optional: `width` (default 300), `margin` (default 2), `errorCorrectionLevel` (default `'M'`, options: `'L'`, `'M'`, `'Q'`, `'H'`).
- The `VerificationLinkService` also provides `buildCertificateVerificationUrl()` for Code II verification links, which signs the URL path with a private key (RSA-PSS or ECDSA).

---

## 7. Self-Signed Certificate

Generate a self-signed certificate for the KSeF TEST environment. Useful for development and testing when you do not have a qualified certificate.

```typescript
import { CertificateService } from 'ksef-client-ts';

async function generateTestCertificate() {
  // Generate a personal certificate (RSA-2048 by default)
  const personalCert = await CertificateService.generatePersonalCertificate(
    'Jan',                // givenName
    'Kowalski',           // surname
    'PNOPL-12345678901',  // serialNumber (PESEL-based identifier)
    'Jan Kowalski',       // commonName
  );

  console.log('Certificate PEM:');
  console.log(personalCert.certificatePem);
  console.log('Private key PEM:');
  console.log(personalCert.privateKeyPem);
  console.log('SHA-256 fingerprint:', personalCert.fingerprint);

  // Generate an ECDSA (P-256) personal certificate
  const ecdsaCert = await CertificateService.generatePersonalCertificate(
    'Anna',
    'Nowak',
    'PNOPL-98765432109',
    'Anna Nowak',
    'ECDSA',              // CryptoEncryptionMethod: 'RSA' (default) or 'ECDSA'
  );
  console.log('ECDSA certificate fingerprint:', ecdsaCert.fingerprint);

  // Generate a company seal certificate
  const companyCert = await CertificateService.generateCompanySeal(
    'Acme Sp. z o.o.',      // organizationName
    'VATPL-1234567890',      // organizationIdentifier
    'Acme Sp. z o.o. Seal', // commonName
  );
  console.log('Company seal fingerprint:', companyCert.fingerprint);

  // Compute SHA-256 fingerprint of any PEM certificate
  const fingerprint = CertificateService.getSha256Fingerprint(personalCert.certificatePem);
  console.log('Verified fingerprint:', fingerprint);
}
```

**Notes:**
- `CertificateService` methods are all static.
- `generatePersonalCertificate()` creates a certificate with subject fields: `givenName`, `surname`, `serialNumber`, `CN`, and `C=PL`.
- `generateCompanySeal()` creates a certificate with subject fields: `O`, `organizationIdentifier`, `CN`, and `C=PL`.
- The `CryptoEncryptionMethod` parameter (5th argument) defaults to `'RSA'`. Pass `'ECDSA'` for P-256 elliptic curve keys.
- The `fingerprint` field is the uppercase hex SHA-256 hash of the DER-encoded certificate.
- Self-signed certificates are valid for 365 days from generation.
- These certificates are intended for the TEST environment only. Production use requires qualified certificates issued by a trusted CA.
