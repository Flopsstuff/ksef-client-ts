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
23. [Workflows](#workflows)
24. [KSeF Feature Constants](#ksef-feature-constants)
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
| `authManager`    | `AuthManager`             | Token store with automatic 401 refresh   |

### Methods

```ts
loginWithToken(token: string, nip: string): Promise<void>
```
High-level login: challenge → crypto init → encrypt token → submit → redeem → store tokens in `authManager`.

```ts
loginWithCertificate(certPem: string, keyPem: string, nip: string): Promise<void>
```
High-level login: challenge → build AuthTokenRequest XML → XAdES sign → submit → redeem → store tokens. `SignatureService` is dynamically imported.

```ts
logout(): Promise<void>
```
Clear access and refresh tokens from `authManager`.

---

## AuthService

Accessed via `client.auth`.

```ts
getChallenge(): Promise<AuthChallengeResponse>
```
Request an authorization challenge from the KSeF API.

```ts
submitXadesAuthRequest(signedXml: string, verifyCertificateChain?: boolean): Promise<AuthenticationInitResponse>
```
Submit a signed XAdES XML for authentication. Sends XML as `application/octet-stream`.

```ts
submitKsefTokenAuthRequest(payload: AuthKsefTokenRequest): Promise<AuthenticationInitResponse>
```
Authenticate using an encrypted KSeF token.

```ts
getAuthStatus(referenceNumber: string, authToken: string): Promise<AuthenticationOperationStatusResponse>
```
Poll the authorization status by reference number.

```ts
getAccessToken(authToken: string): Promise<AuthenticationTokensResponse>
```
Redeem the auth token for a session access token.

```ts
refreshAccessToken(refreshToken: string): Promise<AuthenticationTokenRefreshResponse>
```
Refresh an expired access token using a refresh token.

---

## ActiveSessionsService

Accessed via `client.activeSessions`.

```ts
getActiveSessions(pageSize?: number, continuationToken?: string): Promise<AuthenticationListResponse>
```
List all active sessions for the current subject.

```ts
revokeCurrentSession(): Promise<void>
```
Revoke the caller's current session.

```ts
revokeSession(sessionRef: string): Promise<void>
```
Revoke a specific session by its reference number.

---

## OnlineSessionService

Accessed via `client.onlineSession`.

```ts
openSession(request: OpenOnlineSessionRequest, upoVersion?: string): Promise<OpenOnlineSessionResponse>
```
Open a new online (interactive) session.

```ts
sendInvoice(sessionRef: string, request: SendInvoiceRequest): Promise<SendInvoiceResponse>
```
Send an invoice within an open online session.

```ts
closeSession(sessionRef: string): Promise<void>
```
Close an online session.

---

## BatchSessionService

Accessed via `client.batchSession`.

```ts
openSession(request: OpenBatchSessionRequest, upoVersion?: string): Promise<OpenBatchSessionResponse>
```
Open a new batch session and receive part upload URLs.

```ts
sendParts(openResponse: OpenBatchSessionResponse, parts: BatchPartSendingInfo[]): Promise<void>
```
Upload batch parts to the pre-signed URLs from the open response.

```ts
closeSession(batchRef: string): Promise<void>
```
Close a batch session.

---

## SessionStatusService

Accessed via `client.sessionStatus`.

```ts
getSessions(type: SessionType, pageSize?: number, continuationToken?: string, filter?: SessionsFilter): Promise<SessionsQueryResponse>
```
List sessions by type with optional filtering.

```ts
getSessionStatus(sessionRef: string): Promise<SessionStatusResponse>
```
Get the status of a specific session.

```ts
getSessionInvoices(sessionRef: string, pageSize?: number, continuationToken?: string): Promise<SessionInvoicesResponse>
```
List invoices processed within a session.

```ts
getSessionInvoice(sessionRef: string, invoiceRef: string): Promise<SessionInvoiceStatusResponse>
```
Get details of a specific invoice within a session.

```ts
getSessionFailedInvoices(sessionRef: string, pageSize?: number, continuationToken?: string): Promise<SessionInvoicesResponse>
```
List invoices that failed processing within a session.

```ts
getInvoiceUpoByKsefNumber(sessionRef: string, ksefNumber: string): Promise<UpoResult>
```
Download UPO (official receipt) for an invoice by its KSeF number. Returns `{ upo: string, hash?: string }`.

```ts
getInvoiceUpoByReference(sessionRef: string, invoiceRef: string): Promise<UpoResult>
```
Download UPO for an invoice by its reference number. Returns `{ upo: string, hash?: string }`.

```ts
getSessionUpo(sessionRef: string, upoRef: string): Promise<UpoResult>
```
Download a session-level UPO by reference. Returns `{ upo: string, hash?: string }`.

---

## InvoiceDownloadService

Accessed via `client.invoices`.

```ts
getInvoice(ksefNumber: string): Promise<string>
```
Download an invoice XML by its KSeF number.

```ts
queryInvoiceMetadata(filters: InvoiceQueryFilters, pageOffset?: number, pageSize?: number, sortOrder?: SortOrder): Promise<PagedInvoiceResponse>
```
Query invoice metadata with filters and pagination.

```ts
exportInvoices(request: InvoiceExportRequest): Promise<OperationResponse>
```
Start an asynchronous invoice export job.

```ts
getInvoiceExportStatus(ref: string): Promise<InvoiceExportStatusResponse>
```
Check the status of an invoice export operation.

---

## PermissionsService

Accessed via `client.permissions`.

### Grant Methods

```ts
grantPersonPermissions(request: GrantPermissionsPersonRequest): Promise<OperationResponse>
```
Grant permissions to a person (by PESEL, NIP, or other identifier).

```ts
grantEntityPermissions(request: GrantPermissionsEntityRequest): Promise<OperationResponse>
```
Grant permissions to a legal entity (by NIP).

```ts
grantAuthorizationPermissions(request: GrantPermissionsAuthorizationRequest): Promise<OperationResponse>
```
Grant authorization-level permissions.

```ts
grantIndirectPermissions(request: GrantPermissionsIndirectRequest): Promise<OperationResponse>
```
Grant indirect permissions.

```ts
grantSubunitPermissions(request: GrantPermissionsSubunitRequest): Promise<OperationResponse>
```
Grant permissions to a subunit.

```ts
grantEuEntityAdminPermissions(request: GrantPermissionsEuEntityAdminRequest): Promise<OperationResponse>
```
Grant permissions to an EU entity.

```ts
grantEuEntityRepresentativePermissions(request: GrantPermissionsEuEntityRepresentativeRequest): Promise<OperationResponse>
```
Grant permissions to an EU entity representative.

### Revoke Methods

```ts
revokeCommonGrant(grantId: string): Promise<OperationResponse>
```
Revoke a common (person/entity/subunit) permission grant by ID.

```ts
revokeAuthorizationGrant(grantId: string): Promise<OperationResponse>
```
Revoke an authorization permission grant by ID.

### Query Methods

```ts
queryPersonalGrants(options?: QueryPersonalGrantsRequest): Promise<PagedPermissionsResponse<PersonalPermission>>
```
Query the caller's own permissions.

```ts
queryPersonsGrants(options: QueryPersonsGrantsRequest, pageOffset?: number, pageSize?: number): Promise<PagedPermissionsResponse<PersonPermission>>
```
Query permissions granted to persons.

```ts
querySubunitsGrants(options?: QuerySubunitsGrantsRequest): Promise<PagedPermissionsResponse<SubunitPermission>>
```
Query permissions granted to subunits.

```ts
queryEntitiesRoles(options?: QueryEntitiesRolesRequest): Promise<PagedRolesResponse<EntityRole>>
```
Query roles assigned to entities.

```ts
queryEntitiesGrants(options?: QueryEntitiesGrantsRequest, pageOffset?: number, pageSize?: number): Promise<PagedPermissionsResponse<EntityPermissionItem>>
```
Query permissions granted to entities.

```ts
querySubordinateEntitiesRoles(options?: QuerySubordinateEntitiesRolesRequest): Promise<PagedRolesResponse<SubordinateEntityRole>>
```
Query roles assigned to subordinate entities.

```ts
queryAuthorizationsGrants(options: QueryAuthorizationsGrantsRequest, pageOffset?: number, pageSize?: number): Promise<PagedAuthorizationsResponse<EntityAuthorizationGrant>>
```
Query authorization-level grants.

```ts
queryEuEntitiesGrants(options?: QueryEuEntitiesGrantsRequest): Promise<PagedPermissionsResponse<EuEntityPermission>>
```
Query permissions granted to EU entities.

### Status Methods

```ts
getOperationStatus(ref: string): Promise<PermissionsOperationStatusResponse>
```
Check the status of a permissions operation by reference.

```ts
getAttachmentStatus(): Promise<PermissionsAttachmentAllowedResponse>
```
Check whether attachment permissions are enabled for the current context.

---

## TokenService

Accessed via `client.tokens`.

```ts
generateToken(request: KsefTokenRequest): Promise<KsefTokenResponse>
```
Generate a new KSeF authentication token.

```ts
queryTokens(options?: QueryKsefTokensOptions): Promise<QueryKsefTokensResponse>
```
List all tokens for the current subject.

```ts
getToken(ref: string): Promise<AuthenticationKsefToken>
```
Get a specific token by reference.

```ts
revokeToken(ref: string): Promise<void>
```
Revoke a token by reference.

---

## CertificateApiService

Accessed via `client.certificates`.

```ts
getLimits(): Promise<CertificateLimitResponse>
```
Get certificate enrollment limits.

```ts
getEnrollmentData(): Promise<CertificateEnrollmentsInfoResponse>
```
Get certificate enrollment configuration data.

```ts
enroll(request: SendCertificateEnrollmentRequest): Promise<CertificateEnrollmentResponse>
```
Submit a certificate enrollment request (CSR).

```ts
getEnrollmentStatus(ref: string): Promise<CertificateEnrollmentStatusResponse>
```
Check the status of a certificate enrollment by reference.

```ts
retrieve(request: CertificateListRequest): Promise<CertificateListResponse>
```
Retrieve certificates matching the given criteria.

```ts
revoke(serialNumber: string, request: CertificateRevokeRequest): Promise<void>
```
Revoke a certificate by serial number.

```ts
query(request: CertificateMetadataListRequest): Promise<CertificateMetadataListResponse>
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
getContextLimits(): Promise<SessionLimitsInCurrentContextResponse>
```
Get session limits for the current context.

```ts
getSubjectLimits(): Promise<CertificatesLimitInCurrentSubjectResponse>
```
Get certificate limits for the current subject.

```ts
getRateLimits(): Promise<EffectiveApiRateLimits>
```
Get the effective API rate limits.

---

## PeppolService

Accessed via `client.peppol`.

```ts
queryProviders(pageOffset?: number, pageSize?: number): Promise<QueryPeppolProvidersResponse>
```
Query registered PEPPOL providers.

---

## TestDataService

Accessed via `client.testData`. Available only in the TEST environment.

### Subject Management

```ts
createSubject(request: SubjectCreateRequest): Promise<void>
```
Create a test subject (NIP entity).

```ts
removeSubject(request: SubjectRemoveRequest): Promise<void>
```
Remove a test subject.

### Person Management

```ts
createPerson(request: PersonCreateRequest): Promise<void>
```
Create a test person (PESEL identity).

```ts
removePerson(request: PersonRemoveRequest): Promise<void>
```
Remove a test person.

### Permissions

```ts
grantPermissions(request: TestDataPermissionsGrantRequest): Promise<void>
```
Grant test permissions directly (bypasses normal flow).

```ts
revokePermissions(request: TestDataPermissionsRevokeRequest): Promise<void>
```
Revoke test permissions directly.

### Attachment Permissions

```ts
enableAttachment(request: AttachmentPermissionGrantRequest): Promise<void>
```
Enable attachment permissions for a test subject.

```ts
disableAttachment(request: AttachmentPermissionRevokeRequest): Promise<void>
```
Disable attachment permissions for a test subject.

### Session Limits

```ts
changeSessionLimits(request: SetSessionLimitsRequest): Promise<void>
```
Override session limits in the current context.

```ts
restoreDefaultSessionLimits(): Promise<void>
```
Restore default session limits.

### Certificate Limits

```ts
changeCertificatesLimit(request: SetSubjectLimitsRequest): Promise<void>
```
Override subject limits (enrollment/certificate) for the current subject.

```ts
restoreDefaultCertificatesLimit(): Promise<void>
```
Restore default certificate limits.

### Rate Limits

```ts
setRateLimits(request: SetRateLimitsRequest): Promise<void>
```
Set custom API rate limits.

```ts
restoreDefaultRateLimits(): Promise<void>
```
Restore default API rate limits.

```ts
setProductionRateLimits(): Promise<void>
```
Set production-level rate limits in the test environment.

### Context Blocking

```ts
blockContext(request: BlockContextAuthenticationRequest): Promise<void>
```
Block a context (simulate maintenance or ban).

```ts
unblockContext(request: UnblockContextAuthenticationRequest): Promise<void>
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
  .addPermission(type: EntityPermissionItemType, canDelegate?: boolean) // repeatable
  .withPermissions(permissions: EntityPermission[])                     // or set all
  .withDescription(description: string)
  .withSubjectDetails(details: EntityDetails)
  .build(): GrantPermissionsEntityRequest
```

### AuthorizationPermissionGrantBuilder

Builds a `GrantPermissionsAuthorizationRequest`.

```ts
new AuthorizationPermissionGrantBuilder()
  .withPermission(permission: EntityAuthorizationPermissionType)
  .build(): GrantPermissionsAuthorizationRequest
```

---

## Error Types

### KSeFError

Base error class for all KSeF-related errors. Extends `Error`.

```ts
class KSeFError extends Error {
  constructor(message: string)
}
```

All other error classes extend `KSeFError`, so you can catch all library errors with a single `instanceof KSeFError` check.

### KSeFApiError

Extends `KSeFError`. Thrown on non-2xx responses from the KSeF API.

| Field           | Type                | Description                           |
| --------------- | ------------------- | ------------------------------------- |
| `message`       | `string`            | Human-readable error description      |
| `statusCode`    | `number`            | HTTP status code                      |
| `errorResponse` | `ApiErrorResponse?` | Parsed error body from the API        |

```ts
static fromResponse(statusCode: number, body?: ApiErrorResponse): KSeFApiError
```

### KSeFRateLimitError

Extends `KSeFApiError`. Thrown on HTTP 429 responses (too many requests).

| Field               | Type      | Description                                    |
| ------------------- | --------- | ---------------------------------------------- |
| `retryAfterSeconds` | `number?` | Seconds to wait (from `Retry-After` header)    |
| `retryAfterDate`    | `Date?`   | Absolute retry time (if header was a date)     |
| `recommendedDelay`  | `number`  | Seconds to wait (falls back to 60 if unknown)  |

```ts
static fromRetryAfterHeader(statusCode: number, retryAfterHeader?: string | null, body?: ApiErrorResponse): KSeFRateLimitError
```

### KSeFUnauthorizedError

Extends `KSeFError`. Thrown on HTTP 401 responses when the body matches `UnauthorizedProblemDetails`.

| Field      | Type      | Description                      |
| ---------- | --------- | -------------------------------- |
| `statusCode` | `401`  | Always 401                       |
| `detail`   | `string`  | Error detail from the API        |
| `traceId`  | `string?` | Trace ID for debugging           |
| `instance` | `string?` | Request instance identifier      |
| `timestamp` | `string?` | UTC timestamp recorded by the server (KSeF API v2.4.0+) |

### KSeFForbiddenError

Extends `KSeFError`. Thrown on HTTP 403 responses when the body matches `ForbiddenProblemDetails`.

| Field        | Type                  | Description                          |
| ------------ | --------------------- | ------------------------------------ |
| `statusCode` | `403`                 | Always 403                           |
| `detail`     | `string`              | Error detail from the API            |
| `reasonCode` | `ForbiddenReasonCode` | One of: `missing-permissions`, `ip-not-allowed`, `insufficient-resource-access`, `auth-method-not-allowed`, `security-service-blocked`, `context-type-not-allowed` |
| `instance`   | `string?`             | Request instance identifier          |
| `security`   | `Record<string, unknown>?` | Additional security context    |
| `traceId`    | `string?`             | Trace ID for debugging               |
| `timestamp`  | `string?`             | UTC timestamp recorded by the server (KSeF API v2.4.0+) |

### KSeFGoneError

Extends `KSeFError`. Thrown on HTTP 410 responses when an async operation status has aged out of the KSeF retention window (KSeF API v2.4.0+). Retention is 7 days for authentication and export operations and 30 days for certificate and permission enrollments.

| Field        | Type      | Description                                  |
| ------------ | --------- | -------------------------------------------- |
| `statusCode` | `410`     | Always 410                                   |
| `detail`     | `string`  | Server detail, or default retention-expired message if absent |
| `instance`   | `string?` | Request instance identifier                  |
| `traceId`    | `string?` | Trace ID for debugging                       |
| `timestamp`  | `string?` | UTC timestamp recorded by the server         |

### ApiErrorResponse

```ts
interface ApiErrorResponse {
  exception?: {
    serviceCtx?: string;
    serviceCode?: string;
    serviceName?: string;
    timestamp?: string;
    referenceNumber?: string;
    exceptionDetailList?: ExceptionDetails[];
  };
}

interface ExceptionDetails {
  exceptionCode: number;
  exceptionDescription: string;
  details?: string[];
}
```

### KSeFAuthStatusError

Extends `KSeFError`. Thrown when an authentication operation fails or times out.

| Field               | Type      | Description                          |
| ------------------- | --------- | ------------------------------------ |
| `referenceNumber`   | `string?` | Auth operation reference number      |
| `statusDescription` | `string?` | Status description from the API      |

```ts
constructor(message: string, referenceNumber?: string, statusDescription?: string)
```

### KSeFSessionExpiredError

Extends `KSeFError`. Thrown when a stored session has expired.

```ts
constructor(message?: string)  // default: 'KSeF session has expired'
```

### KSeFValidationError

Extends `KSeFError`. Thrown when client-side validation fails (e.g., invalid NIP, missing required fields).

| Field     | Type                | Description                    |
| --------- | ------------------- | ------------------------------ |
| `details` | `ValidationDetail[]` | List of validation issues     |

```ts
constructor(message: string, details?: ValidationDetail[])

static fromField(field: string, message: string): KSeFValidationError
static fromMessages(messages: string[]): KSeFValidationError
```

```ts
interface ValidationDetail {
  field?: string;
  message: string;
}
```

### Error Hierarchy

```
Error
  └── KSeFError                       // base class for all library errors
        ├── KSeFApiError              // HTTP API errors (non-2xx, generic)
        │     └── KSeFRateLimitError  // HTTP 429 (too many requests)
        ├── KSeFUnauthorizedError     // HTTP 401 (unauthorized)
        ├── KSeFForbiddenError        // HTTP 403 (forbidden)
        ├── KSeFGoneError             // HTTP 410 (operation status retention expired)
        ├── KSeFAuthStatusError       // auth operation failed/timed out
        ├── KSeFSessionExpiredError   // stored session expired
        └── KSeFValidationError       // client-side validation failed
```

`RestClient.ensureSuccess` dispatches errors in order: 429 → 401 → 403 → 410 → (exceptionCode `21208` → `KSeFBatchTimeoutError`) → generic `KSeFApiError`.

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

Each returns `boolean`. Functions marked with **CRC-8** verify the checksum in addition to regex format.

```ts
isValidNip(value: string): boolean          // regex + weighted checksum (mod 11)
isValidPesel(value: string): boolean        // regex + weighted checksum (mod 10)
isValidKsefNumber(value: string): boolean   // regex + CRC-8 (handles 35 and 36-char formats)
isValidKsefNumberV35(value: string): boolean // regex + CRC-8 (35-char canonical format)
isValidKsefNumberV36(value: string): boolean // regex + CRC-8 (36-char format with middle hyphen)
isValidVatUe(value: string): boolean
isValidNipVatUe(value: string): boolean
isValidInternalId(value: string): boolean
isValidPeppolId(value: string): boolean
isValidReferenceNumber(value: string): boolean
isValidCertificateName(value: string): boolean
isValidCertificateFingerprint(value: string): boolean
isValidBase64(value: string): boolean
isValidIp4Address(value: string): boolean
isValidSha256Base64(value: string): boolean
```

#### KSeF Number CRC-8 Validation

KSeF invoice numbers are exactly 35 characters: 32 data chars + separator + 2-char CRC-8 checksum (uppercase hex). The CRC-8 uses polynomial `0x07` with init value `0x00`, matching the [official specification](https://github.com/CIRFMF/ksef-docs).

```
5265877635-20250826-0100001AF629-AF
|          |        |            |
NIP(10)    Date(8)  TechHex(12)  CRC-8(2)
```

`isValidKsefNumber()` accepts both 35-char (`HHHHHHHHHHHH`) and 36-char (`HHHHHH-HHHHHH`) formats, normalizing internally before CRC verification.

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
  environment?: EnvironmentName;            // 'TEST' | 'DEMO' | 'PROD'
  baseUrl?: string;                         // Override API base URL
  baseQrUrl?: string;                       // Override QR verification base URL
  lighthouseUrl?: string;                   // Override lighthouse status URL
  apiVersion?: string;                      // Default: 'v2'
  timeout?: number;                         // Default: 30000 (ms)
  customHeaders?: Record<string, string>;   // Extra headers for all requests
  authManager?: AuthManager;                // Custom AuthManager (default: DefaultAuthManager)
  transport?: TransportFn;                  // Custom fetch implementation
  retry?: Partial<RetryPolicy>;            // Retry policy overrides
  rateLimit?: { globalRps?: number; endpointLimits?: ... } | null; // null disables
  presignedUrlHosts?: string[];            // Additional allowed hosts for presigned URLs
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
| `TEST` | `https://api-test.ksef.mf.gov.pl` | `https://qr-test.ksef.mf.gov.pl`   |
| `DEMO` | `https://api-demo.ksef.mf.gov.pl` | `https://qr-demo.ksef.mf.gov.pl`   |
| `PROD` | `https://api.ksef.mf.gov.pl`      | `https://qr.ksef.mf.gov.pl`        |

---

## Workflows

High-level orchestration functions that combine multiple service calls into common multi-step operations. All functions are exported from the package root.

### Authentication Workflows

```ts
import { authenticateWithToken, authenticateWithCertificate, authenticateWithPkcs12 } from 'ksef-client-ts';

// Token auth: challenge → encrypt → submit → poll → redeem tokens
const result = await authenticateWithToken(client, {
  token: 'your-ksef-token',
  nip: '1234567890',
});
// result: { accessToken, refreshToken, accessTokenExpiry, refreshTokenExpiry }

// Certificate auth: challenge → XAdES sign → submit → poll → redeem tokens
const result = await authenticateWithCertificate(client, {
  certPem: '-----BEGIN CERTIFICATE-----...',
  keyPem: '-----BEGIN PRIVATE KEY-----...',
  nip: '1234567890',
});

// PKCS#12 auth: load P12 → delegate to certificate auth
const result = await authenticateWithPkcs12(client, {
  p12Buffer: fs.readFileSync('cert.p12'),
  password: 'secret',
  nip: '1234567890',
});
```

### Online Session Workflows

```ts
import { openOnlineSession, openSendAndClose } from 'ksef-client-ts';

// Open a session and get a handle for sending invoices
const handle = await openOnlineSession(client, { formCode, encryption });
await handle.sendInvoice(invoiceRequest);
await handle.close();
const upo = await handle.waitForUpo();

// Or do it all in one call: open → send → close → poll UPO
const upo = await openSendAndClose(client, {
  formCode, encryption, invoices: [invoice1, invoice2],
});
```

### Batch Session Workflow

```ts
import { uploadBatch } from 'ksef-client-ts';

const result = await uploadBatch(client, {
  formCode, encryption, parts: [{ partContent, partSize, partHash }],
});
// result: { sessionReference, upo }
```

### Invoice Export Workflows

```ts
import { exportInvoices, exportAndDownload } from 'ksef-client-ts';

// Initiate export and poll until ready
const result = await exportInvoices(client, { queryFilters });
// result: { parts: [{ ordinal, url, size, hash, expiration }] }

// Or export + download + decrypt in one call
const result = await exportAndDownload(client, { queryFilters, cipherKey, cipherIv });
// result: { parts: [...], decryptedParts: [Uint8Array, ...] }
```

### Polling Utility

```ts
import { pollUntil } from 'ksef-client-ts';

// Generic polling with configurable interval and max attempts
const result = await pollUntil(
  () => client.sessionStatus.getSessionStatus(ref),
  (status) => status.processingCode === 200,
  { intervalMs: 2000, maxAttempts: 30 },
);
```

### Workflow Types

| Type | Description |
|------|-------------|
| `PollOptions` | `intervalMs`, `maxAttempts`, `onProgress` callback |
| `OnlineSessionHandle` | Session ref + `sendInvoice()`, `close()`, `waitForUpo()` methods |
| `UpoInfo` | Pages with reference numbers, download URLs, invoice counts |
| `BatchUploadResult` | Session reference + UPO info |
| `ExportResult` | Export parts array (ordinal, URL, size, hash, expiration) |
| `ExportDownloadResult` | Extends `ExportResult` with `decryptedParts: Uint8Array[]` |
| `AuthResult` | Access/refresh tokens with expiry timestamps |

---

## KSeF Feature Constants

Constants for the `X-KSeF-Feature` header, used to negotiate UPO format version and XAdES compliance.

```ts
import { KSEF_FEATURE_HEADER, UpoVersion, ENFORCE_XADES_COMPLIANCE } from 'ksef-client-ts';
```

| Constant | Value | Description |
|----------|-------|-------------|
| `KSEF_FEATURE_HEADER` | `'X-KSeF-Feature'` | HTTP header name for feature negotiation |
| `UpoVersion.V4_2` | `'upo-v4-2'` | UPO format v4-2 (default before 2026-01-05) |
| `UpoVersion.V4_3` | `'upo-v4-3'` | UPO format v4-3 (adds InvoicingMode field) |
| `ENFORCE_XADES_COMPLIANCE` | `'enforce-xades-compliance'` | Strict XAdES validation in auth requests |

Session open methods (`onlineSession.openSession()`, `batchSession.openSession()`) and `auth.submitXadesAuthRequest()` accept an optional `upoVersion` parameter to set this header.
