# API Reference

Complete API reference for the `ksef-client-ts` library — a TypeScript client for the Polish National e-Invoice System (KSeF) API v2.

---

## Table of Contents

1. [KSeFClient](#ksefclient)
2. [AuthService](#authservice)
3. [ActiveSessionsService](#activesessionsservice)
4. [OnlineSessionService](#onlinesessionservice)
5. [BatchSessionService](#batchsessionservice)
6. [SessionStatusService](#sessionstatusservice)
7. [InvoiceDownloadService](#invoicedownloadservice)
8. [PermissionsService](#permissionsservice)
9. [TokenService](#tokenservice)
10. [CertificateApiService](#certificateapiservice)
11. [LighthouseService](#lighthouseservice)
12. [LimitsService](#limitsservice)
13. [PeppolService](#peppolservice)
14. [TestDataService](#testdataservice)
15. [CryptographyService](#cryptographyservice)
16. [VerificationLinkService](#verificationlinkservice)
17. [SignatureService (static)](#signatureservice-static)
18. [CertificateService (static)](#certificateservice-static)
19. [QrCodeService (static)](#qrcodeservice-static)
20. [Builders](#builders)
21. [Error Types](#error-types)
22. [Validation](#validation)
23. [Configuration](#configuration)

---

## KSeFClient

Main entry point. Creates all services and wires shared dependencies.

```ts
constructor(options?: KSeFClientOptions)
```

### Properties

| Property         | Type                      | Description                              |
| ---------------- | ------------------------- | ---------------------------------------- |
| `auth`           | `AuthService`             | Authentication and authorization         |
| `activeSessions` | `ActiveSessionsService`   | List and revoke active sessions          |
| `onlineSession`  | `OnlineSessionService`    | Open/close online sessions, send invoices |
| `batchSession`   | `BatchSessionService`     | Open/close batch sessions, upload parts  |
| `sessionStatus`  | `SessionStatusService`    | Session status, invoices, UPO retrieval  |
| `invoices`       | `InvoiceDownloadService`  | Download invoices, query metadata, export |
| `permissions`    | `PermissionsService`      | Grant, revoke, and query permissions     |
| `tokens`         | `TokenService`            | Generate, query, and revoke KSeF tokens  |
| `certificates`   | `CertificateApiService`   | Certificate enrollment and management    |
| `lighthouse`     | `LighthouseService`       | KSeF system status and messages          |
| `limits`         | `LimitsService`           | Session, subject, and rate limits        |
| `peppol`         | `PeppolService`           | Query PEPPOL providers                   |
| `testData`       | `TestDataService`         | Test environment data management         |
| `crypto`         | `CryptographyService`     | Encryption, hashing, CSR generation      |
| `qr`             | `VerificationLinkService` | Invoice and certificate verification URLs |
| `options`        | `ResolvedOptions`         | Resolved configuration                   |

---

## AuthService

Accessed via `client.auth`.

```ts
getChallenge(): Promise<AuthChallengeResponse>
```
Request an authorization challenge from the KSeF API.

```ts
submitXadesAuthRequest(signedXml: string, verifyCertificateChain?: boolean, enforceXadesCompliance?: boolean): Promise<SignatureResponse>
```
Submit a signed XAdES XML for authentication. Sends XML as `application/octet-stream`.

```ts
submitKsefTokenAuthRequest(payload: AuthKsefTokenRequest): Promise<SignatureResponse>
```
Authenticate using an encrypted KSeF token.

```ts
getAuthStatus(referenceNumber: string, authToken: string): Promise<AuthStatus>
```
Poll the authorization status by reference number.

```ts
getAccessToken(authToken: string): Promise<AuthOperationStatusResponse>
```
Redeem the auth token for a session access token.

```ts
refreshAccessToken(refreshToken: string): Promise<RefreshTokenResponse>
```
Refresh an expired access token using a refresh token.

---

## ActiveSessionsService

Accessed via `client.activeSessions`.

```ts
getActiveSessions(accessToken: string, pageSize?: number, continuationToken?: string): Promise<AuthenticationListResponse>
```
List all active sessions for the current subject.

```ts
revokeCurrentSession(token: string): Promise<void>
```
Revoke the caller's current session.

```ts
revokeSession(sessionRef: string, accessToken: string): Promise<void>
```
Revoke a specific session by its reference number.

---

## OnlineSessionService

Accessed via `client.onlineSession`.

```ts
openSession(request: OpenOnlineSessionRequest, accessToken: string, upoVersion?: string): Promise<OpenOnlineSessionResponse>
```
Open a new online (interactive) session.

```ts
sendInvoice(sessionRef: string, request: SendInvoiceRequest, accessToken: string): Promise<SendInvoiceResponse>
```
Send an invoice within an open online session.

```ts
closeSession(sessionRef: string, accessToken: string): Promise<void>
```
Close an online session.

---

## BatchSessionService

Accessed via `client.batchSession`.

```ts
openSession(request: OpenBatchSessionRequest, accessToken: string, upoVersion?: string): Promise<OpenBatchSessionResponse>
```
Open a new batch session and receive part upload URLs.

```ts
sendParts(openResponse: OpenBatchSessionResponse, parts: BatchPartSendingInfo[]): Promise<void>
```
Upload batch parts to the pre-signed URLs from the open response.

```ts
closeSession(batchRef: string, accessToken: string): Promise<void>
```
Close a batch session.

---

## SessionStatusService

Accessed via `client.sessionStatus`.

```ts
getSessions(type: SessionType, accessToken: string, pageSize?: number, continuationToken?: string, filter?: SessionsFilter): Promise<SessionsListResponse>
```
List sessions by type with optional filtering.

```ts
getSessionStatus(sessionRef: string, accessToken: string): Promise<SessionStatusResponse>
```
Get the status of a specific session.

```ts
getSessionInvoices(sessionRef: string, accessToken: string, pageSize?: number, continuationToken?: string): Promise<SessionInvoicesResponse>
```
List invoices processed within a session.

```ts
getSessionInvoice(sessionRef: string, invoiceRef: string, accessToken: string): Promise<SessionInvoice>
```
Get details of a specific invoice within a session.

```ts
getSessionFailedInvoices(sessionRef: string, accessToken: string, pageSize?: number, continuationToken?: string): Promise<SessionInvoicesResponse>
```
List invoices that failed processing within a session.

```ts
getInvoiceUpoByKsefNumber(sessionRef: string, ksefNumber: string, accessToken: string): Promise<string>
```
Download UPO (official receipt) for an invoice by its KSeF number. Returns raw XML.

```ts
getInvoiceUpoByReference(sessionRef: string, invoiceRef: string, accessToken: string): Promise<string>
```
Download UPO for an invoice by its reference number. Returns raw XML.

```ts
getSessionUpo(sessionRef: string, upoRef: string, accessToken: string): Promise<string>
```
Download a session-level UPO by reference. Returns raw XML.

---

## InvoiceDownloadService

Accessed via `client.invoices`.

```ts
getInvoice(ksefNumber: string, accessToken: string): Promise<string>
```
Download an invoice XML by its KSeF number.

```ts
queryInvoiceMetadata(filters: InvoiceQueryFilters, accessToken: string, pageOffset?: number, pageSize?: number, sortOrder?: SortOrder): Promise<PagedInvoiceResponse>
```
Query invoice metadata with filters and pagination.

```ts
exportInvoices(request: InvoiceExportRequest, accessToken: string): Promise<OperationResponse>
```
Start an asynchronous invoice export job.

```ts
getInvoiceExportStatus(ref: string, accessToken: string): Promise<InvoiceExportStatusResponse>
```
Check the status of an invoice export operation.

---

## PermissionsService

Accessed via `client.permissions`.

### Grant Methods

```ts
grantPersonPermissions(request: GrantPermissionsPersonRequest, accessToken: string): Promise<OperationResponse>
```
Grant permissions to a person (by PESEL, NIP, or other identifier).

```ts
grantEntityPermissions(request: GrantPermissionsEntityRequest, accessToken: string): Promise<OperationResponse>
```
Grant permissions to a legal entity (by NIP).

```ts
grantAuthorizationPermissions(request: GrantPermissionsAuthorizationRequest, accessToken: string): Promise<OperationResponse>
```
Grant authorization-level permissions.

```ts
grantIndirectPermissions(request: GrantPermissionsIndirectRequest, accessToken: string): Promise<OperationResponse>
```
Grant indirect permissions.

```ts
grantSubunitPermissions(request: GrantPermissionsSubunitRequest, accessToken: string): Promise<OperationResponse>
```
Grant permissions to a subunit.

```ts
grantEuEntityPermissions(request: GrantPermissionsEuEntityRequest, accessToken: string): Promise<OperationResponse>
```
Grant permissions to an EU entity.

```ts
grantEuEntityRepresentativePermissions(request: GrantPermissionsEuEntityRepresentativeRequest, accessToken: string): Promise<OperationResponse>
```
Grant permissions to an EU entity representative.

### Revoke Methods

```ts
revokeCommonGrant(grantId: string, accessToken: string): Promise<OperationResponse>
```
Revoke a common (person/entity/subunit) permission grant by ID.

```ts
revokeAuthorizationGrant(grantId: string, accessToken: string): Promise<OperationResponse>
```
Revoke an authorization permission grant by ID.

### Query Methods

```ts
queryPersonalGrants(accessToken: string, options?: QueryPersonalGrantsRequest): Promise<PagedPermissionsResponse<PersonalPermission>>
```
Query the caller's own permissions.

```ts
queryPersonsGrants(accessToken: string, options?: QueryPersonsGrantsRequest): Promise<PagedPermissionsResponse<PersonPermission>>
```
Query permissions granted to persons.

```ts
querySubunitsGrants(accessToken: string, options?: QuerySubunitsGrantsRequest): Promise<PagedPermissionsResponse<SubunitPermission>>
```
Query permissions granted to subunits.

```ts
queryEntitiesRoles(accessToken: string, options?: QueryEntitiesRolesRequest): Promise<PagedRolesResponse<EntityRole>>
```
Query roles assigned to entities.

```ts
queryEntitiesGrants(accessToken: string, options?: QueryEntitiesGrantsRequest): Promise<PagedPermissionsResponse<EntityRole>>
```
Query permissions granted to entities.

```ts
querySubordinateEntitiesRoles(accessToken: string, options?: QuerySubordinateEntitiesRolesRequest): Promise<PagedRolesResponse<SubordinateEntityRole>>
```
Query roles assigned to subordinate entities.

```ts
queryAuthorizationsGrants(accessToken: string, options?: QueryAuthorizationsGrantsRequest): Promise<PagedAuthorizationsResponse<AuthorizationGrant>>
```
Query authorization-level grants.

```ts
queryEuEntitiesGrants(accessToken: string, options?: QueryEuEntitiesGrantsRequest): Promise<PagedPermissionsResponse<EuEntityPermission>>
```
Query permissions granted to EU entities.

### Status Methods

```ts
getOperationStatus(ref: string, accessToken: string): Promise<PermissionsOperationStatusResponse>
```
Check the status of a permissions operation by reference.

```ts
getAttachmentStatus(accessToken: string): Promise<PermissionsAttachmentAllowedResponse>
```
Check whether attachment permissions are enabled for the current context.

---

## TokenService

Accessed via `client.tokens`.

```ts
generateToken(request: KsefTokenRequest, accessToken: string): Promise<KsefTokenResponse>
```
Generate a new KSeF authentication token.

```ts
queryTokens(accessToken: string, options?: QueryKsefTokensOptions): Promise<QueryKsefTokensResponse>
```
List all tokens for the current subject.

```ts
getToken(ref: string, accessToken: string): Promise<AuthenticationKsefToken>
```
Get a specific token by reference.

```ts
revokeToken(ref: string, accessToken: string): Promise<void>
```
Revoke a token by reference.

---

## CertificateApiService

Accessed via `client.certificates`.

```ts
getLimits(accessToken: string): Promise<CertificateLimitResponse>
```
Get certificate enrollment limits.

```ts
getEnrollmentData(accessToken: string): Promise<CertificateEnrollmentsInfoResponse>
```
Get certificate enrollment configuration data.

```ts
enroll(request: SendCertificateEnrollmentRequest, accessToken: string): Promise<CertificateEnrollmentResponse>
```
Submit a certificate enrollment request (CSR).

```ts
getEnrollmentStatus(ref: string, accessToken: string): Promise<CertificateEnrollmentStatusResponse>
```
Check the status of a certificate enrollment by reference.

```ts
retrieve(request: CertificateListRequest, accessToken: string): Promise<CertificateListResponse>
```
Retrieve certificates matching the given criteria.

```ts
revoke(serialNumber: string, request: CertificateRevokeRequest, accessToken: string): Promise<void>
```
Revoke a certificate by serial number.

```ts
query(request: CertificateMetadataListRequest, accessToken: string): Promise<CertificateMetadataListResponse>
```
Query certificate metadata.

---

## LighthouseService

Accessed via `client.lighthouse`. Uses raw `fetch()` against the lighthouse URL (not `RestClient`).

```ts
getStatus(): Promise<KsefStatusResponse>
```
Get the current KSeF system status.

```ts
getMessages(): Promise<LighthouseMessage[]>
```
Get system status messages.

---

## LimitsService

Accessed via `client.limits`.

```ts
getContextLimits(accessToken: string): Promise<SessionLimitsInCurrentContextResponse>
```
Get session limits for the current context.

```ts
getSubjectLimits(accessToken: string): Promise<CertificatesLimitInCurrentSubjectResponse>
```
Get certificate limits for the current subject.

```ts
getRateLimits(accessToken: string): Promise<EffectiveApiRateLimits>
```
Get the effective API rate limits.

---

## PeppolService

Accessed via `client.peppol`.

```ts
queryProviders(accessToken: string, pageOffset?: number, pageSize?: number): Promise<QueryPeppolProvidersResponse>
```
Query registered PEPPOL providers.

---

## TestDataService

Accessed via `client.testData`. Available only in the TEST environment.

### Subject Management

```ts
createSubject(request: SubjectCreateRequest): Promise<TestDataStatusResponse>
```
Create a test subject (NIP entity).

```ts
removeSubject(request: SubjectRemoveRequest): Promise<TestDataStatusResponse>
```
Remove a test subject.

### Person Management

```ts
createPerson(request: PersonCreateRequest): Promise<TestDataStatusResponse>
```
Create a test person (PESEL identity).

```ts
removePerson(request: PersonRemoveRequest): Promise<TestDataStatusResponse>
```
Remove a test person.

### Permissions

```ts
grantPermissions(request: TestDataPermissionsGrantRequest): Promise<TestDataStatusResponse>
```
Grant test permissions directly (bypasses normal flow).

```ts
revokePermissions(request: TestDataPermissionsRevokeRequest): Promise<TestDataStatusResponse>
```
Revoke test permissions directly.

### Attachment Permissions

```ts
enableAttachment(request: AttachmentPermissionGrantRequest): Promise<TestDataStatusResponse>
```
Enable attachment permissions for a test subject.

```ts
disableAttachment(request: AttachmentPermissionRevokeRequest): Promise<TestDataStatusResponse>
```
Disable attachment permissions for a test subject.

### Session Limits

```ts
changeSessionLimits(request: ChangeSessionLimitsInCurrentContextRequest, accessToken: string): Promise<TestDataStatusResponse>
```
Override session limits in the current context.

```ts
restoreDefaultSessionLimits(accessToken: string): Promise<TestDataStatusResponse>
```
Restore default session limits.

### Certificate Limits

```ts
changeCertificatesLimit(request: ChangeCertificatesLimitInCurrentSubjectRequest, accessToken: string): Promise<TestDataStatusResponse>
```
Override certificate limits for the current subject.

```ts
restoreDefaultCertificatesLimit(accessToken: string): Promise<TestDataStatusResponse>
```
Restore default certificate limits.

### Rate Limits

```ts
setRateLimits(request: EffectiveApiRateLimitsRequest, accessToken: string): Promise<TestDataStatusResponse>
```
Set custom API rate limits.

```ts
restoreDefaultRateLimits(accessToken: string): Promise<TestDataStatusResponse>
```
Restore default API rate limits.

```ts
setProductionRateLimits(request: EffectiveApiRateLimitsRequest, accessToken: string): Promise<TestDataStatusResponse>
```
Set production-level rate limits in the test environment.

```ts
restoreDefaultProductionRateLimits(accessToken: string): Promise<TestDataStatusResponse>
```
Restore default production rate limits.

### Context Blocking

```ts
blockContext(request: ContextBlockRequest, accessToken: string): Promise<TestDataStatusResponse>
```
Block a context (simulate maintenance or ban).

```ts
unblockContext(request: ContextUnblockRequest, accessToken: string): Promise<TestDataStatusResponse>
```
Unblock a previously blocked context.

---

## CryptographyService

Accessed via `client.crypto`. Requires explicit initialization before use.

```ts
init(): Promise<void>
```
Initialize the service by fetching and caching KSeF public certificates. Must be called before any encryption method.

### AES-256-CBC

```ts
encryptAES256(content: Uint8Array, key: Uint8Array, iv: Uint8Array): Uint8Array
```
Encrypt data with AES-256-CBC (PKCS7 padding).

```ts
decryptAES256(content: Uint8Array, key: Uint8Array, iv: Uint8Array): Uint8Array
```
Decrypt AES-256-CBC encrypted data.

### Key Wrapping

```ts
getEncryptionData(): EncryptionData
```
Generate a random AES-256 key + IV and wrap the key with the KSeF SymmetricKeyEncryption RSA public key (RSA-OAEP SHA-256).

### Token Encryption

```ts
encryptKsefToken(token: string, challengeTimestamp: string): Uint8Array
```
Encrypt a KSeF token for session authorization. Auto-selects RSA-OAEP or ECDH+AES-256-GCM based on the certificate key type.

### File Metadata

```ts
getFileMetadata(file: Uint8Array): FileMetadata
```
Compute SHA-256 hash (base64) and byte length of a file.

### CSR Generation

```ts
generateCsrRsa(fields: X500NameFields): Promise<CsrResult>
```
Generate an RSA-2048 CSR (PKCS#10 DER) and private key PEM.

```ts
generateCsrEcdsa(fields: X500NameFields): Promise<CsrResult>
```
Generate an ECDSA P-256 CSR (PKCS#10 DER) and private key PEM.

### Key Parsing

```ts
parsePrivateKey(pem: string): crypto.KeyObject
```
Parse a PEM-encoded private key into a Node.js `KeyObject`.

---

## VerificationLinkService

Accessed via `client.qr`.

```ts
buildInvoiceVerificationUrl(nip: string, issueDate: Date | string, invoiceHashBase64: string): string
```
Build an invoice verification URL (Code I). Format: `{baseQrUrl}/invoice/{NIP}/{DD-MM-YYYY}/{hash_base64url}`.

```ts
buildCertificateVerificationUrl(contextType: string, contextId: string, sellerNip: string, certSerial: string, invoiceHashBase64: string, privateKeyPem: string): string
```
Build a certificate verification URL (Code II) with a cryptographic signature. Uses RSA-PSS (SHA-256, salt=32) for RSA keys or ECDSA (SHA-256, IEEE P1363) for EC keys.

---

## SignatureService (static)

Imported directly: `import { SignatureService } from 'ksef-client-ts'`.

```ts
static sign(xml: string, certPem: string, privateKeyPem: string): string
```
Sign an XML document with an XAdES-B enveloped signature. Supports both RSA and ECDSA keys. Returns the complete signed XML document.

---

## CertificateService (static)

Imported directly: `import { CertificateService } from 'ksef-client-ts'`.

```ts
static getSha256Fingerprint(certPem: string): string
```
Compute the SHA-256 fingerprint of a PEM certificate. Returns uppercase hex string.

```ts
static generatePersonalCertificate(givenName: string, surname: string, serialNumber: string, commonName: string, method?: CryptoEncryptionMethod): Promise<SelfSignedCertificateResult>
```
Generate a self-signed personal certificate (for individual authentication). Default method is `'RSA'`.

```ts
static generateCompanySeal(orgName: string, orgIdentifier: string, commonName: string, method?: CryptoEncryptionMethod): Promise<SelfSignedCertificateResult>
```
Generate a self-signed company seal certificate (for entity authentication). Default method is `'RSA'`.

`CryptoEncryptionMethod` is `'RSA' | 'ECDSA'`.

`SelfSignedCertificateResult` contains `certificatePem`, `privateKeyPem`, and `fingerprint`.

---

## QrCodeService (static)

Imported directly: `import { QrCodeService } from 'ksef-client-ts'`.

```ts
static generateQrCode(url: string, options?: QrCodeOptions): Promise<Buffer>
```
Generate a QR code as a PNG buffer.

```ts
static generateQrCodeBase64(url: string, options?: QrCodeOptions): Promise<string>
```
Generate a QR code as a base64-encoded PNG string.

```ts
static generateQrCodeSvg(url: string, options?: QrCodeOptions): Promise<string>
```
Generate a QR code as an SVG string.

```ts
static generateQrCodeSvgWithLabel(url: string, label: string, options?: QrCodeOptions): Promise<string>
```
Generate a QR code as an SVG string with a text label below.

```ts
static generateResult(url: string, options?: QrCodeOptions): Promise<QrCodeResult>
```
Generate a `QrCodeResult` containing both the URL and its base64-encoded QR code.

### QrCodeOptions

| Field                  | Type     | Default |
| ---------------------- | -------- | ------- |
| `width`                | `number` | `300`   |
| `margin`               | `number` | `2`     |
| `errorCorrectionLevel` | `string` | `'M'`   |

---

## Builders

### AuthTokenRequestBuilder

Builds an `AuthTokenRequest` for XAdES-based authentication.

```ts
new AuthTokenRequestBuilder()
  .withChallenge(challenge: string)
  .withContextNip(nip: string)           // or:
  .withContextInternalId(id: string)     // or:
  .withContextNipVatUe(value: string)    // or:
  .withContextPeppolId(id: string)
  .withSubjectType(type: SubjectIdentifierType)
  .withAuthorizationPolicy(policy: AuthorizationPolicy)  // optional
  .build(): AuthTokenRequest
```

### AuthKsefTokenRequestBuilder

Builds an `AuthKsefTokenRequest` for token-based authentication.

```ts
new AuthKsefTokenRequestBuilder()
  .withChallenge(challenge: string)
  .withContextNip(nip: string)           // or:
  .withContextInternalId(id: string)     // or:
  .withContextNipVatUe(value: string)    // or:
  .withContextPeppolId(id: string)
  .withEncryptedToken(token: string)
  .withAuthorizationPolicy(policy: AuthorizationPolicy)  // optional
  .build(): AuthKsefTokenRequest
```

### InvoiceQueryFilterBuilder

Builds `InvoiceQueryFilters` for invoice metadata queries.

```ts
new InvoiceQueryFilterBuilder()
  .withSubjectType(type: InvoiceSubjectType)              // required
  .withDateRange(from: string, to: string)                // required
  .withKsefNumber(ksefNumber: string)                     // optional
  .withInvoiceNumber(invoiceNumber: string)               // optional
  .withAmountRange(from: number, to: number)              // optional
  .withSellerNip(nip: string)                             // optional
  .withBuyerIdentifier(identifier: string)                // optional
  .withCurrencyCodes(codes: string[])                     // optional
  .withInvoiceFilterInvoicingMode(mode: InvoiceFilterInvoicingMode) // optional
  .withSelfInvoicing(value: boolean)                      // optional
  .withFormType(type: FormType)                           // optional
  .withInvoiceTypes(types: InvoiceType[])                 // optional
  .withHasAttachment(value: boolean)                      // optional
  .build(): InvoiceQueryFilters
```

### PersonPermissionGrantBuilder

Builds a `GrantPermissionsPersonRequest`.

```ts
new PersonPermissionGrantBuilder()
  .withSubjectIdentifier(type: PermissionSubjectIdentifierType, value: string)
  .addPermission(permission: PersonPermissionType)        // repeatable
  .withPermissions(permissions: PersonPermissionType[])   // or set all at once
  .build(): GrantPermissionsPersonRequest
```

### EntityPermissionGrantBuilder

Builds a `GrantPermissionsEntityRequest`.

```ts
new EntityPermissionGrantBuilder()
  .withNip(nip: string)
  .addPermission(permission: EntityStandardPermissionType, canDelegate?: boolean) // repeatable
  .withPermissions(permissions: PermissionWithDelegate<EntityStandardPermissionType>[]) // or set all
  .build(): GrantPermissionsEntityRequest
```

### AuthorizationPermissionGrantBuilder

Builds a `GrantPermissionsAuthorizationRequest`.

```ts
new AuthorizationPermissionGrantBuilder()
  .withPermission(permission: AuthorizationPermissionType)
  .build(): GrantPermissionsAuthorizationRequest
```

---

## Error Types

### KSeFApiError

Thrown on non-2xx responses from the KSeF API.

| Field           | Type                | Description                           |
| --------------- | ------------------- | ------------------------------------- |
| `message`       | `string`            | Human-readable error description      |
| `statusCode`    | `number`            | HTTP status code                      |
| `errorResponse` | `ApiErrorResponse?` | Parsed error body from the API        |

```ts
static fromResponse(statusCode: number, body?: ApiErrorResponse): KSeFApiError
```

### KSeFRateLimitError

Extends `KSeFApiError`. Thrown on HTTP 429 responses.

| Field               | Type      | Description                                    |
| ------------------- | --------- | ---------------------------------------------- |
| `retryAfterSeconds` | `number?` | Seconds to wait (from `Retry-After` header)    |
| `retryAfterDate`    | `Date?`   | Absolute retry time (if header was a date)     |
| `recommendedDelay`  | `number`  | Seconds to wait (falls back to 60 if unknown)  |

```ts
static fromRetryAfterHeader(statusCode: number, retryAfterHeader?: string | null, body?: ApiErrorResponse): KSeFRateLimitError
```

### ApiErrorResponse

```ts
interface ApiErrorResponse {
  exception?: {
    serviceCtx?: string;
    serviceCode?: string;
    serviceName?: string;
    timestamp?: string;
    referenceNumber?: string;
    exceptionDetailList?: ExceptionDetail[];
  };
}

interface ExceptionDetail {
  exceptionDetailCode: number;
  exceptionDescription: string;
}
```

---

## Validation

### Regex Patterns

All patterns are exported as `RegExp` constants.

| Pattern                | Description                                    |
| ---------------------- | ---------------------------------------------- |
| `Nip`                  | Polish NIP (10-digit tax ID)                   |
| `VatUe`                | EU VAT number (all member states)              |
| `NipVatUe`             | Combined NIP-VatUE format                      |
| `InternalId`           | KSeF internal identifier (NIP-XXXXX)           |
| `PeppolId`             | PEPPOL participant ID                          |
| `ReferenceNumber`      | KSeF operation reference number                |
| `KsefNumber`           | KSeF invoice number                            |
| `KsefNumberV35`        | KSeF invoice number (v3.5 format)              |
| `KsefNumberV36`        | KSeF invoice number (v3.6 format)              |
| `CertificateName`      | Valid certificate name (alphanumeric + Polish)  |
| `Pesel`                | Polish PESEL (11-digit personal ID)            |
| `CertificateFingerprint` | SHA-256 fingerprint (64 hex chars uppercase) |
| `Base64String`         | Standard base64 string                         |
| `Ip4Address`           | IPv4 address                                   |
| `Ip4Range`             | IPv4 range (addr-addr)                         |
| `Ip4Mask`              | IPv4 CIDR mask (addr/prefix)                   |
| `Sha256Base64`         | SHA-256 hash encoded as base64 (44 chars)      |

### Validator Functions

Each returns `boolean`.

```ts
isValidNip(value: string): boolean
isValidVatUe(value: string): boolean
isValidNipVatUe(value: string): boolean
isValidInternalId(value: string): boolean
isValidPeppolId(value: string): boolean
isValidReferenceNumber(value: string): boolean
isValidKsefNumber(value: string): boolean
isValidPesel(value: string): boolean
isValidCertificateName(value: string): boolean
isValidCertificateFingerprint(value: string): boolean
isValidBase64(value: string): boolean
isValidIp4Address(value: string): boolean
isValidSha256Base64(value: string): boolean
```

### Constraints

| Constant                            | Value |
| ----------------------------------- | ----- |
| `REQUIRED_CHALLENGE_LENGTH`         | `36`  |
| `CERTIFICATE_NAME_MIN_LENGTH`       | `5`   |
| `CERTIFICATE_NAME_MAX_LENGTH`       | `100` |
| `SUBUNIT_NAME_MIN_LENGTH`           | `5`   |
| `SUBUNIT_NAME_MAX_LENGTH`           | `256` |
| `PERMISSION_DESCRIPTION_MIN_LENGTH` | `5`   |
| `PERMISSION_DESCRIPTION_MAX_LENGTH` | `256` |

---

## Configuration

### KSeFClientOptions

All fields are optional. Defaults to the `TEST` environment.

```ts
interface KSeFClientOptions {
  environment?: EnvironmentName;            // 'TEST' | 'DEMO' | 'PRD'
  baseUrl?: string;                         // Override API base URL
  baseQrUrl?: string;                       // Override QR verification base URL
  lighthouseUrl?: string;                   // Override lighthouse status URL
  apiVersion?: string;                      // Default: 'v2'
  timeout?: number;                         // Default: 30000 (ms)
  customHeaders?: Record<string, string>;   // Extra headers for all requests
}
```

### ResolvedOptions

The fully resolved configuration used internally.

```ts
interface ResolvedOptions {
  baseUrl: string;
  baseQrUrl: string;
  lighthouseUrl: string;
  apiVersion: string;
  timeout: number;
  customHeaders: Record<string, string>;
}
```

### Environment

Pre-configured environments with API, QR, and lighthouse URLs.

| Name   | API URL                            | QR URL                              |
| ------ | ---------------------------------- | ----------------------------------- |
| `TEST` | `https://ksef-test.mf.gov.pl/api` | `https://qr-test.ksef.mf.gov.pl`   |
| `DEMO` | `https://ksef-demo.mf.gov.pl/api` | `https://qr-demo.ksef.mf.gov.pl`   |
| `PRD`  | `https://ksef.mf.gov.pl/api`      | `https://qr.ksef.mf.gov.pl`        |
