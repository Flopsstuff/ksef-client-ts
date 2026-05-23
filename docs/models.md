# Models & Type System

Complete reference for the model layer that defines every request, response, enum, and identifier type used by the KSeF client. All types are derived from the KSeF OpenAPI spec (API v2.6.0, build 2.5.0-te) and organized by API domain.

---

## Overview

The model layer lives in `src/models/` and contains **only TypeScript types and interfaces** -- no runtime code, no classes, no side effects. Each domain folder maps to a KSeF API resource group and a corresponding service in `src/services/`. The single exception is `src/models/document-structures/types.ts`, which exports `const` objects (`FORM_CODES`, `INVOICE_TYPES_BY_SYSTEM_CODE`) because they serve as typed constants, not runtime logic.

Types are re-exported through barrel files (`index.ts`) at each level:

```
src/models/index.ts          -- re-exports all 13 domain barrels + common.ts
src/models/{domain}/index.ts -- re-exports types.ts (and any additional files)
src/index.ts                 -- re-exports src/models/index.ts (among others)
```

This means every model type is available from the package root:

```typescript
import { InvoiceQueryFilters, AuthChallengeResponse, ContextIdentifier } from 'ksef-client-ts';
```

Or from domain-specific paths for tree-shaking / clarity:

```typescript
import type { InvoiceQueryFilters } from 'ksef-client-ts/models/invoices/types.js';
```

---

## Domain Map

The model layer has 13 domain folders plus one shared module:

| Domain folder | KSeF business context | Key types | Service |
|---|---|---|---|
| `common.ts` | Cross-domain shared types | `ContextIdentifier`, `TokenInfo`, `FormCode`, `EncryptionInfo`, `OperationStatusInfo` | All services |
| `auth/` | Authentication ceremonies | `AuthChallengeResponse`, `AuthKsefTokenRequest`, `AuthenticationInitResponse`, `AuthorizationPolicy` | `AuthService` |
| `sessions/` | Online & batch session lifecycle | `OpenOnlineSessionRequest`, `SendInvoiceRequest`, `SessionStatusResponse`, `BatchFileInfo` | `OnlineSessionService`, `BatchSessionService`, `SessionStatusService` |
| `invoices/` | Invoice querying, metadata, export | `InvoiceQueryFilters`, `InvoiceMetadata`, `InvoiceExportRequest`, `InvoiceExportStatusResponse` | `InvoiceDownloadService` |
| `permissions/` | Permission grants, queries, roles | `GrantPermissionsPersonRequest`, `PersonPermissionType`, `QueryPersonalGrantsRequest`, `InvoicePermissionType` | `PermissionsService` |
| `tokens/` | KSeF token CRUD | `KsefTokenRequest`, `KsefTokenResponse`, `AuthenticationKsefToken`, `KsefTokenStatus` | `TokensService` |
| `certificates/` | Certificate enrollment & management | `EnrollCertificateRequest`, `CertificateListItem`, `CertificateLimitsResponse`, `CertificateStatus` | `CertificatesService` |
| `lighthouse/` | System status & messages | `KsefStatusResponse`, `LighthouseMessage`, `KsefSystemStatus` | `LighthouseService` |
| `limits/` | Rate limits & session context limits | `EffectiveApiRateLimits`, `EffectiveContextLimits`, `SetRateLimitsRequest`, `EffectiveSubjectLimits` | `LimitsService` |
| `peppol/` | Peppol provider registry | `PeppolProvider`, `QueryPeppolProvidersResponse` | `PeppolService` |
| `test-data/` | Test environment data seeding | `SubjectCreateRequest`, `PersonCreateRequest`, `TestDataPermissionsGrantRequest` | `TestDataService` |
| `crypto/` | Cryptographic operations (client-side) | `PublicKeyCertificate`, `EncryptionData`, `CsrResult`, `SelfSignedCertificateResult` | `CryptographyService` |
| `qrcode/` | QR code generation | `QrCodeResult`, `QrCodeOptions` | `QrCodeService` |
| `document-structures/` | Form codes & invoice type mappings | `FORM_CODES`, `SystemCode`, `INVOICE_TYPES_BY_SYSTEM_CODE` | Used by sessions & invoices |

---

## Shared Types (common.ts)

**File:** `src/models/common.ts`

These types appear in requests and responses across multiple domains.

### ContextIdentifier

Identifies the taxpayer context for a session or operation:

```typescript
type ContextIdentifierType = 'Nip' | 'InternalId' | 'NipVatUe' | 'PeppolId';

interface ContextIdentifier {
  type: ContextIdentifierType;
  value: string;
}
```

- `Nip` -- Polish tax identification number (10 digits). The most common context type.
- `InternalId` -- KSeF-internal identifier for subunits.
- `NipVatUe` -- VAT-UE identifier for EU entities.
- `PeppolId` -- Peppol participant identifier.

Used by: auth requests, session opening, token management, permission scoping.

### TokenInfo

Authentication/refresh token with expiration:

```typescript
interface TokenInfo {
  token: string;
  validUntil: string;  // ISO 8601 datetime
}
```

Returned by `AuthenticationInitResponse.authenticationToken`, `AuthenticationTokensResponse.accessToken`, and `AuthenticationTokensResponse.refreshToken`.

### FormCode

Identifies the invoice schema (document structure):

```typescript
interface FormCode {
  systemCode: string;    // e.g. 'FA (2)', 'PEF (3)'
  schemaVersion: string; // e.g. '1-0E', '2-1'
  value: string;         // e.g. 'FA', 'PEF', 'RR', 'FA_RR'
}
```

Required for opening sessions (both online and batch). Pre-defined constants are available in `src/models/document-structures/types.ts` as `FORM_CODES`.

### EncryptionInfo

AES-256-CBC encryption metadata sent with session-opening and export requests:

```typescript
interface EncryptionInfo {
  encryptedSymmetricKey: string;  // RSA-encrypted AES key (base64)
  initializationVector: string;   // AES IV (base64)
}
```

The `CryptographyService` generates these values -- callers typically do not construct `EncryptionInfo` manually.

### FileMetadata

SHA-256 hash and size for integrity verification:

```typescript
interface FileMetadata {
  hashSHA: string;   // base64-encoded SHA-256
  fileSize: number;
}
```

Used by batch upload parts and stream-based operations.

### OperationResponse & OperationStatusInfo

Standard response wrappers:

```typescript
interface OperationResponse {
  referenceNumber: string;
}

interface OperationStatusInfo {
  code: number;
  description: string;
  details?: string[] | null;
}
```

`OperationStatusInfo` appears in session status, auth operation status, permission operation status, and certificate enrollment status responses.

### Session & Sort Enums

```typescript
type SessionType = 'Online' | 'Batch';
type SessionStatus = 'Succeeded' | 'InProgress' | 'Failed' | 'Cancelled';
type SortOrder = 'Asc' | 'Desc';
type InvoicingMode = 'Online' | 'Offline';
```

### PermissionSubjectIdentifierType

```typescript
type PermissionSubjectIdentifierType = 'Nip' | 'Pesel' | 'Fingerprint';
```

Shared identifier type for permission subjects. See [Naming Conventions](#naming-conventions--collision-avoidance) for why this exists alongside `SubjectIdentifierType` in other contexts.

---

## Auth Domain

**Files:** `src/models/auth/types.ts`, `src/models/auth/active-sessions-types.ts`

The auth domain models the multi-step authentication ceremony that establishes a KSeF session.

### Authentication Flow Types

The KSeF auth ceremony proceeds in 3 steps. Each step has corresponding request/response types:

```
1. GET  /challenge  ────►  AuthChallengeResponse
2. POST /init       ────►  AuthenticationInitResponse  (contains authenticationToken)
3. POST /redeem     ────►  AuthenticationTokensResponse (contains accessToken + refreshToken)
```

#### AuthChallengeResponse

```typescript
interface AuthChallengeResponse {
  challenge: string;     // random nonce from KSeF
  timestamp: string;     // ISO 8601
  timestampMs: number;   // epoch milliseconds
  clientIp: string;      // caller's IP as seen by KSeF
}
```

The `challenge` value must be included in the init request body (either `AuthTokenRequest` or `AuthKsefTokenRequest`).

#### LoginResult

Returned by `client.loginWithToken()`, `client.loginWithCertificate()`, and `client.loginWithPkcs12()`.

```typescript
interface LoginResult {
  clientIp: string;  // caller's IP as seen by KSeF during challenge
}
```

Use `clientIp` to configure `AuthorizationPolicy.allowedIps` on future auth requests — if the whitelist excludes this IP, KSeF rejects with `ip-not-allowed`.

#### AuthTokenRequest (XAdES certificate login)

```typescript
interface AuthTokenRequest {
  challenge: string;
  contextIdentifier: ContextIdentifier;
  subjectIdentifierType: XadesSubjectIdentifierType;
  authorizationPolicy?: AuthorizationPolicy;
}
```

Used for login via qualified signature/seal. The `XadesSubjectIdentifierType` is XML-specific (not from the REST OpenAPI spec); the known value is `'certificateSubject'`.

#### AuthKsefTokenRequest (token-based login)

```typescript
interface AuthKsefTokenRequest {
  challenge: string;
  contextIdentifier: ContextIdentifier;
  encryptedToken: string;  // RSA-encrypted KSeF token (base64)
  authorizationPolicy?: AuthorizationPolicy;
}
```

Used for login with a KSeF-issued token. The token is encrypted with the KSeF public key before transmission.

#### AuthorizationPolicy

Optional IP restrictions for the session:

```typescript
interface AuthorizationPolicy {
  allowedIps?: AllowedIps | null;
}

interface AllowedIps {
  ip4Addresses?: string[] | null;
  ip4Ranges?: string[] | null;
  ip4Masks?: string[] | null;
}
```

#### AuthenticationInitResponse & AuthenticationTokensResponse

```typescript
interface AuthenticationInitResponse {
  referenceNumber: string;
  authenticationToken: TokenInfo;
}

interface AuthenticationTokensResponse {
  accessToken: TokenInfo;
  refreshToken: TokenInfo;
}
```

The `authenticationToken` from init is used once to call the redeem endpoint. After redeem, the `accessToken` is used for all subsequent API calls, and the `refreshToken` is used for token refresh.

### AuthenticationMethod

```typescript
type AuthenticationMethod =
  | 'Token'
  | 'TrustedProfile'
  | 'InternalCertificate'
  | 'QualifiedSignature'
  | 'QualifiedSeal'
  | 'PersonalSignature'
  | 'PeppolSignature';
```

Deprecated but still required by the spec in `AuthenticationOperationStatusResponse`. New code should use `AuthenticationMethodInfo` instead.

### Active Sessions

**File:** `src/models/auth/active-sessions-types.ts`

```typescript
interface AuthSessionInfo {
  startDate: string;
  authenticationMethodInfo: AuthenticationMethodInfo;
  authenticationMethod: AuthenticationMethod;  // deprecated
  status: OperationStatusInfo;
  referenceNumber: string;
  isCurrent: boolean;
  isTokenRedeemed?: boolean | null;
  lastTokenRefreshDate?: string | null;
  refreshTokenValidUntil?: string | null;
}

interface AuthenticationListResponse {
  continuationToken?: string | null;
  items: AuthSessionInfo[];
}
```

Used by `ActiveSessionsService` to list all active authentication sessions.

---

## Sessions Domain

**Files:** `src/models/sessions/online-types.ts`, `src/models/sessions/batch-types.ts`, `src/models/sessions/status-types.ts`

The sessions domain splits into three concerns: online session operations, batch session operations, and shared session status types.

### Online Session Types

**File:** `src/models/sessions/online-types.ts`

```typescript
interface OpenOnlineSessionRequest {
  formCode: FormCode;
  encryption: EncryptionInfo;
}

interface OpenOnlineSessionResponse {
  referenceNumber: string;
  validUntil: string;
}
```

Opening an online session requires a `FormCode` (which invoice schema) and `EncryptionInfo` (the AES key encrypted with KSeF's RSA public key).

#### SendInvoiceRequest

```typescript
interface SendInvoiceRequest {
  invoiceHash: string;          // SHA-256 of plaintext invoice XML
  invoiceSize: number;          // plaintext size
  encryptedInvoiceHash: string; // SHA-256 of encrypted content
  encryptedInvoiceSize: number;
  encryptedInvoiceContent: string; // base64 AES-encrypted invoice XML
  offlineMode?: boolean;
  hashOfCorrectedInvoice?: string; // for correction invoices
}
```

### Batch Session Types

**File:** `src/models/sessions/batch-types.ts`

Batch sessions upload a ZIP archive of multiple invoices, split into parts:

```typescript
interface BatchFileInfo {
  fileSize: number;
  fileHash: string;
  fileParts: BatchFilePartInfo[];
}

interface BatchFilePartInfo {
  ordinalNumber: number;
  fileSize: number;
  fileHash: string;
}

interface OpenBatchSessionRequest {
  formCode: FormCode;
  batchFile: BatchFileInfo;
  encryption: EncryptionInfo;
  offlineMode?: boolean;
}

interface OpenBatchSessionResponse {
  referenceNumber: string;
  partUploadRequests: PartUploadRequest[];
}

interface PartUploadRequest {
  method: string;
  ordinalNumber: number;
  url: string;
  headers: Record<string, string | null>;
}
```

The `OpenBatchSessionResponse` returns presigned URLs for each part. The `BatchFileBuilder` (see [Builders](#builders)) handles part splitting, encryption, and hash computation.

### Session Status Types

**File:** `src/models/sessions/status-types.ts`

Shared across online and batch sessions:

```typescript
interface SessionStatusResponse {
  status: OperationStatusInfo;
  upo?: UpoResponse;
  invoiceCount?: number;
  successfulInvoiceCount?: number;
  failedInvoiceCount?: number;
  validUntil?: string | null;
  dateCreated: string;
  dateUpdated: string;
}

interface UpoResponse {
  pages: UpoPage[];
}

interface UpoPage {
  referenceNumber: string;
  downloadUrl: string;
  downloadUrlExpirationDate: string;
}
```

The UPO (Urzedowe Poswiadczenie Odbioru / Official Acknowledgment of Receipt) is the legal proof that invoices were accepted by KSeF.

#### Session Invoice Status

```typescript
interface SessionInvoiceStatusResponse {
  ordinalNumber: number;
  invoiceNumber?: string;
  ksefNumber?: string;
  referenceNumber: string;
  invoiceHash: string;
  acquisitionDate?: string;
  invoicingDate: string;
  permanentStorageDate?: string;
  status: InvoiceStatusInfo;
  invoicingMode?: InvoicingMode | null;
  upoDownloadUrl?: string;
  upoDownloadUrlExpirationDate?: string;
}
```

#### Sessions Query

```typescript
interface SessionsFilter {
  referenceNumber?: string;
  dateCreatedFrom?: string;
  dateCreatedTo?: string;
  dateClosedFrom?: string;
  dateClosedTo?: string;
  dateModifiedFrom?: string;
  dateModifiedTo?: string;
  statuses?: SessionStatus[];
}

interface SessionsQueryResponse {
  continuationToken?: string;
  sessions: SessionsQueryResponseItem[];
}
```

Cursor-based pagination uses `continuationToken` (pass the token from the previous response to get the next page).

---

## Invoices Domain

**File:** `src/models/invoices/types.ts`

Types for querying invoice metadata and requesting invoice exports.

### Invoice Enums

```typescript
type InvoiceSubjectType = 'Subject1' | 'Subject2' | 'Subject3' | 'SubjectAuthorized';
type InvoiceQueryDateType = 'Issue' | 'Invoicing' | 'PermanentStorage';
type AmountType = 'Brutto' | 'Netto' | 'Vat';
type BuyerIdentifierType = 'Nip' | 'VatUe' | 'Other' | 'None';
type FormType = 'FA' | 'PEF' | 'FA_RR';

type InvoiceType =
  | 'Vat' | 'Zal' | 'Kor' | 'Roz' | 'Upr' | 'KorZal' | 'KorRoz'
  | 'VatPef' | 'VatPefSp' | 'KorPef'
  | 'VatRr' | 'KorVatRr';
```

`InvoiceSubjectType` defines the taxpayer's role:

- `Subject1` -- seller (invoices issued)
- `Subject2` -- buyer (invoices received)
- `Subject3` -- third party (intermediary)
- `SubjectAuthorized` -- authorized subject acting on behalf of seller/buyer

### InvoiceQueryFilters

The main request body for querying invoice metadata:

```typescript
interface InvoiceQueryFilters {
  subjectType: InvoiceSubjectType;         // required
  dateRange: InvoiceQueryDateRange;        // required
  ksefNumber?: string;
  invoiceNumber?: string;
  amount?: InvoiceQueryAmount;
  sellerNip?: string;
  buyerIdentifier?: InvoiceQueryBuyerIdentifier;
  currencyCodes?: string[];
  invoicingMode?: InvoicingMode;
  isSelfInvoicing?: boolean;
  formType?: FormType;
  invoiceTypes?: InvoiceType[];
  hasAttachment?: boolean;
}
```

Use the `InvoiceQueryFilterBuilder` (see [Builders](#builders)) for fluent construction with validation.

> `InvoiceQueryAmount.from` and `InvoiceQueryAmount.to` accept negative values (KSeF API v2.3.0) — useful for querying corrective invoices and refunds.

### InvoiceMetadata

Rich metadata returned for each invoice:

```typescript
interface InvoiceMetadata {
  ksefNumber: string;
  invoiceNumber: string;
  issueDate: string;
  invoicingDate: string;
  acquisitionDate: string;
  permanentStorageDate: string;
  seller: InvoiceMetadataSeller;
  buyer: InvoiceMetadataBuyer;
  netAmount: number;
  grossAmount: number;
  vatAmount: number;
  currency: string;
  invoicingMode: InvoicingMode;
  invoiceType: InvoiceType;
  formCode: FormCode;
  isSelfInvoicing: boolean;
  hasAttachment: boolean;
  invoiceHash: string;
  hashOfCorrectedInvoice?: string;
  thirdSubjects?: InvoiceMetadataThirdSubject[];
  authorizedSubject?: InvoiceMetadataAuthorizedSubject;
}
```

### Query Response & Pagination

```typescript
interface QueryInvoicesMetadataResponse {
  hasMore: boolean;
  isTruncated: boolean;
  invoices: InvoiceMetadata[];
  permanentStorageHwmDate?: string;
}
```

Offset-based pagination: use `hasMore` to know if more pages exist; `isTruncated` indicates the result set was capped by the server.

### Invoice Export

```typescript
interface InvoiceExportRequest {
  encryption: EncryptionInfo;
  filters: InvoiceQueryFilters;
  onlyMetadata?: boolean;
}

interface InvoiceExportStatusResponse {
  status: OperationStatusInfo;
  completedDate?: string;
  packageExpirationDate?: string;
  package?: InvoiceExportPackage;
}

interface InvoiceExportPackage {
  invoiceCount: number;
  size: number;
  parts: InvoiceExportPackagePart[];
  isTruncated: boolean;
  lastIssueDate?: string;
  lastInvoicingDate?: string;
  lastPermanentStorageDate?: string;
  permanentStorageHwmDate?: string;
}
```

Export is asynchronous: submit the request, poll status until `status.code` indicates completion, then download parts from presigned URLs in `InvoiceExportPackagePart.url`.

---

## Permissions Domain

**File:** `src/models/permissions/types.ts`

The largest domain by type count. KSeF has a rich permission model covering persons, entities, EU entities, subunits, indirect permissions, entity authorizations, and entity roles.

### Permission Type Enums

Each permission grant target has its own set of allowed permission types:

| Enum | Values | Used by |
|---|---|---|
| `PersonPermissionType` | `InvoiceRead`, `InvoiceWrite`, `CredentialsRead`, `CredentialsManage`, `EnforcementOperations`, `SubunitManage`, `Introspection` | `GrantPermissionsPersonRequest` |
| `EntityPermissionItemType` | `InvoiceRead`, `InvoiceWrite` | `GrantPermissionsEntityRequest` |
| `EuEntityPermissionType` | `InvoiceRead`, `InvoiceWrite` | `GrantPermissionsEuEntityRepresentativeRequest` |
| `IndirectPermissionType` | `InvoiceRead`, `InvoiceWrite` | `GrantPermissionsIndirectRequest` |
| `SubunitPermissionScope` | `CredentialsManage` | `GrantPermissionsSubunitRequest` |
| `InvoicePermissionType` | `SelfInvoicing`, `TaxRepresentative`, `RRInvoicing`, `PefInvoicing` | Entity authorization grants |
| `EntityRoleType` | `CourtBailiff`, `EnforcementAuthority`, `LocalGovernmentUnit`, `LocalGovernmentSubUnit`, `VatGroupUnit`, `VatGroupSubUnit` | Entity role queries |

### Grant Request Types (7 total)

Every permission grant follows a consistent pattern: subject identifier + permissions + description + subject details.

| Request type | Target | File |
|---|---|---|
| `GrantPermissionsPersonRequest` | Natural persons (PESEL/NIP/fingerprint) | `permissions/types.ts` |
| `GrantPermissionsEntityRequest` | Polish entities (NIP) | `permissions/types.ts` |
| `GrantPermissionsAuthorizationRequest` | Entity-to-entity authorization (NIP/PeppolId) | `permissions/types.ts` |
| `GrantPermissionsIndirectRequest` | Indirect permissions (delegated) | `permissions/types.ts` |
| `GrantPermissionsSubunitRequest` | Subunit-scoped permissions | `permissions/types.ts` |
| `GrantPermissionsEuEntityAdminRequest` | EU entity administration | `permissions/types.ts` |
| `GrantPermissionsEuEntityRepresentativeRequest` | EU entity representative | `permissions/types.ts` |

Example -- granting person permissions:

```typescript
interface GrantPermissionsPersonRequest {
  subjectIdentifier: PersonSubjectIdentifier;
  permissions: PersonPermissionType[];
  description: string;
  subjectDetails: PersonPermissionSubjectDetails;
}
```

### Query Request Types

| Query type | Target |
|---|---|
| `QueryPersonalGrantsRequest` | Current user's own permissions |
| `QueryPersonsGrantsRequest` | Person permissions (by author/authorized/context) |
| `QuerySubunitsGrantsRequest` | Subunit permissions |
| `QueryEntitiesRolesRequest` | Entity roles (paged) |
| `QueryEntitiesGrantsRequest` | Entity permissions |
| `QueryAuthorizationsGrantsRequest` | Entity authorization grants |
| `QueryEuEntitiesGrantsRequest` | EU entity permissions |
| `QuerySubordinateEntitiesRolesRequest` | Subordinate entity roles |

### Paged Response Wrappers

```typescript
interface PagedPermissionsResponse<T> {
  hasMore: boolean;
  permissions: T[];
}

interface PagedRolesResponse<T> {
  hasMore: boolean;
  roles: T[];
}

interface PagedAuthorizationsResponse<T> {
  hasMore: boolean;
  authorizationGrants: T[];
}
```

### Permission-specific Identifier Types

Each permission context uses its own narrowed identifier types instead of a single union. This reflects the OpenAPI spec's per-endpoint constraints:

```typescript
type EntityAuthorizationPermissionsSubjectIdentifierType = 'Nip' | 'PeppolId';
type EuEntityAdministrationPermissionsSubjectIdentifierType = 'Fingerprint';
type SubunitPermissionsSubjectIdentifierType = 'Nip' | 'Pesel' | 'Fingerprint';
type IndirectPermissionsSubjectIdentifierType = 'Nip' | 'Pesel' | 'Fingerprint';
type IndirectPermissionsTargetIdentifierType = 'Nip' | 'AllPartners' | 'InternalId';
// ... and more
```

---

## Other Domains

### Tokens

**File:** `src/models/tokens/types.ts`

KSeF authentication tokens (not to be confused with JWT access tokens from the auth ceremony).

Key types:

- `KsefTokenRequest` -- create a token with description and permission scopes
- `KsefTokenResponse` -- returns `referenceNumber` + `token`
- `AuthenticationKsefToken` -- full token details including status, permissions, usage dates
- `KsefTokenStatus` -- `'Pending' | 'Active' | 'Revoking' | 'Revoked' | 'Failed'`
- `QueryKsefTokensOptions` -- filtering parameters for token listing (status, description, author)
- `QueryKsefTokensResponse` -- cursor-paginated with `continuationToken`

### Certificates

**File:** `src/models/certificates/types.ts`

Certificate enrollment and management for KSeF internal certificates.

Key types:

- `EnrollCertificateRequest` -- name, type (`'Authentication' | 'Offline'`), CSR (PEM), validFrom
- `CertificateLimitsResponse` -- enrollment and certificate limits with remaining counts
- `CertificateEnrollmentDataResponse` -- X.500 subject fields for CSR generation
- `QueryCertificatesRequest` -- filter by serial number, name, type, status, expiry
- `CertificateListItem` -- full certificate details including status and validity dates
- `CertificateStatus` -- `'Active' | 'Blocked' | 'Revoked' | 'Expired'`
- `CertificateRevocationReason` -- `'Unspecified' | 'Superseded' | 'KeyCompromise'`

### Lighthouse

**File:** `src/models/lighthouse/types.ts`

KSeF system status and operational messages.

```typescript
type KsefSystemStatus = 'AVAILABLE' | 'MAINTENANCE' | 'FAILURE' | 'TOTAL_FAILURE';

interface KsefStatusResponse {
  status: KsefSystemStatus;
  timestamp: string;
}

interface LighthouseMessage {
  id: string;
  eventId: string;
  category: string;
  type: string;
  title: string;
  text: string;
  start: string;
  end?: string;
  version: number;
  published: string;
}
```

### Limits

**File:** `src/models/limits/types.ts`

Effective rate limits and session context limits, plus override types for the test environment.

Key types:

- `EffectiveApiRateLimits` -- per-second/minute/hour limits for 12 endpoint categories
- `EffectiveContextLimits` -- max invoice size and count for online/batch sessions
- `EffectiveSubjectLimits` -- enrollment and certificate limits per subject
- `SetRateLimitsRequest`, `SetSessionLimitsRequest`, `SetSubjectLimitsRequest` -- override requests (test environment only)

### Peppol

**File:** `src/models/peppol/types.ts`

Minimal types for Peppol provider discovery:

```typescript
interface PeppolProvider {
  id: string;
  name: string;
  dateCreated: string;
}

interface QueryPeppolProvidersResponse {
  peppolProviders: PeppolProvider[];
  hasMore: boolean;
}
```

### Test Data

**File:** `src/models/test-data/types.ts`

Types for seeding test data in the KSeF TEST environment: subjects, persons, permissions, attachment permissions, and authentication blocking.

Key types:

- `SubjectCreateRequest` -- create test subjects (with optional subunits)
- `PersonCreateRequest` -- create test persons (NIP, PESEL, bailiff flag)
- `TestDataPermissionsGrantRequest` -- grant test permissions
- `AttachmentPermissionGrantRequest` / `AttachmentPermissionRevokeRequest` -- attachment permissions
- `BlockContextAuthenticationRequest` / `UnblockContextAuthenticationRequest` -- block/unblock auth for a context

### Crypto

**File:** `src/models/crypto/types.ts`

Client-side cryptographic operation types (not KSeF API types):

```typescript
interface PublicKeyCertificate {
  certificate: string;
  validFrom: string;
  validTo: string;
  usage: PublicKeyCertificateUsage[];  // 'KsefTokenEncryption' | 'SymmetricKeyEncryption'
}

interface EncryptionData {
  cipherKey: Uint8Array;
  cipherIv: Uint8Array;
  encryptionInfo: EncryptionInfo;
}

interface CsrResult {
  csrDer: Uint8Array;
  privateKeyPem: string;
}

interface SelfSignedCertificateResult {
  certificatePem: string;
  privateKeyPem: string;
  fingerprint: string;
}

interface X500NameFields {
  commonName?: string;
  givenName?: string;
  surname?: string;
  serialNumber?: string;
  organizationName?: string;
  organizationIdentifier?: string;
  uniqueIdentifier?: string;
  countryCode?: string;
}

type CryptoEncryptionMethod = 'RSA' | 'ECDSA';
```

### QR Code

**File:** `src/models/qrcode/types.ts`

```typescript
interface QrCodeResult {
  url: string;     // verification URL
  qrCode: string;  // encoded image data (PNG base64 or SVG)
}

interface QrCodeOptions {
  width?: number;
  margin?: number;
  errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H';
}

type QRCodeContextIdentifierType = 'Nip' | 'InternalId' | 'NipVatUe' | 'PeppolId';
```

### Document Structures

**File:** `src/models/document-structures/types.ts`

The only model file with runtime values. Provides typed constants for all KSeF document structures:

```typescript
const FORM_CODES = {
  FA_2:               { systemCode: 'FA (2)',      schemaVersion: '1-0E', value: 'FA'    },
  FA_3:               { systemCode: 'FA (3)',      schemaVersion: '1-0E', value: 'FA'    },
  PEF_3:              { systemCode: 'PEF (3)',     schemaVersion: '2-1',  value: 'PEF'   },
  PEF_KOR_3:          { systemCode: 'PEF_KOR (3)', schemaVersion: '2-1',  value: 'PEF'   },
  FA_RR_1_LEGACY:     { systemCode: 'FA_RR (1)',   schemaVersion: '1-0E', value: 'RR'    },
  FA_RR_1_TRANSITION: { systemCode: 'FA_RR (1)',   schemaVersion: '1-1E', value: 'RR'    },
  FA_RR_1:            { systemCode: 'FA_RR (1)',   schemaVersion: '1-1E', value: 'FA_RR' },
} as const satisfies Record<string, FormCode>;
```

And a mapping from system codes to allowed invoice types:

```typescript
const INVOICE_TYPES_BY_SYSTEM_CODE: Record<SystemCode, readonly InvoiceType[]> = {
  'FA (2)':      ['Vat', 'Zal', 'Kor', 'Roz', 'Upr', 'KorZal', 'KorRoz'],
  'FA (3)':      ['Vat', 'Zal', 'Kor', 'Roz', 'Upr', 'KorZal', 'KorRoz'],
  'PEF (3)':     ['VatPef', 'VatPefSp', 'KorPef'],
  'PEF_KOR (3)': ['KorPef'],
  'FA_RR (1)':   ['VatRr', 'KorVatRr'],
};
```

---

## Naming Conventions & Collision Avoidance

The type system has three known naming collisions where a disambiguating prefix or suffix was added:

### 1. CertificateApiService vs CertificateService

**Not a model type collision**, but relevant context. Two classes share the word "Certificate":

- `CertificateApiService` (`src/services/certificates.ts`) -- API CRUD for certificate enrollment (REST endpoints)
- `CertificateService` (`src/crypto/`) -- static utility for self-signed certificate generation (local crypto)

The `Api` suffix on the service disambiguates API operations from local crypto operations.

### 2. InvoiceFilterInvoicingMode vs InvoicingMode

`InvoicingMode` is defined in `src/models/common.ts` as `'Online' | 'Offline'` and re-exported from `src/models/invoices/types.ts` and `src/models/sessions/status-types.ts`. The name `InvoicingMode` is used in both invoice filters and session status contexts. The prefix `InvoiceFilter` was considered to avoid confusion with the session-level invoicing mode but ultimately the shared type in `common.ts` is used directly.

### 3. PermissionSubjectIdentifierType vs SubjectIdentifierType

Two identifier types share a similar concept but serve different domains:

- `PermissionSubjectIdentifierType` (`src/models/common.ts`) -- `'Nip' | 'Pesel' | 'Fingerprint'` -- used in permission grant requests
- `XadesSubjectIdentifierType` (`src/models/auth/types.ts`) -- `'certificateSubject' | (string & {})` -- used in XAdES auth requests (XML-specific)

The `Permission` prefix prevents collision with the auth-domain identifier type and makes it clear which context the type belongs to.

---

## OpenAPI Alignment

All types are aligned with the KSeF OpenAPI spec (API v2.6.0, build 2.5.0-te, `docs/open-api.json`). Key alignment decisions:

| OpenAPI spec | TypeScript type | Note |
|---|---|---|
| `ExceptionDetails` (plural) | `ExceptionDetails` | Not `ExceptionDetail` |
| `exceptionCode` | `exceptionCode` | Not `exceptionDetailCode` |
| `Credentials*` (plural) | `CredentialsRead`, `CredentialsManage` | Not `CredentialRead` |
| `Introspection` | `Introspection` | Not `SelfInvoicing` (which is an `InvoicePermissionType`) |
| `SubjectIdentifierType` values | `'Nip' \| 'Pesel' \| 'Fingerprint'` | Used in permission-domain identifiers; XAdES auth uses `XadesSubjectIdentifierType` (e.g. `certificateSubject`) |

Enum values use PascalCase matching the OpenAPI spec exactly (e.g., `'InvoiceRead'` not `'invoice_read'`, `'VatGroupSubUnit'` not `'VAT_GROUP_SUB_UNIT'`).

---

## Builders

**Files:** `src/builders/`

Builders provide fluent APIs for constructing complex model types with runtime validation. Every builder's `build()` method throws `KSeFValidationError` if required fields are missing.

### AuthTokenRequestBuilder

**File:** `src/builders/auth-token-request.ts`

Builds `AuthTokenRequest` for XAdES certificate login:

```typescript
const request = new AuthTokenRequestBuilder()
  .withChallenge(challenge.challenge)
  .withContextNip('1234567890')
  .withSubjectType('certificateSubject')
  .build();
```

Required fields: `challenge`, `contextIdentifier`, `subjectIdentifierType`.

### AuthKsefTokenRequestBuilder

**File:** `src/builders/auth-ksef-token-request.ts`

Builds `AuthKsefTokenRequest` for token-based login:

```typescript
const request = new AuthKsefTokenRequestBuilder()
  .withChallenge(challenge.challenge)
  .withContextNip('1234567890')
  .withEncryptedToken(encryptedToken)
  .build();
```

Required fields: `challenge`, `contextIdentifier`, `encryptedToken`.

Context helper methods: `withContextNip()`, `withContextInternalId()`, `withContextNipVatUe()`, `withContextPeppolId()`.

### InvoiceQueryFilterBuilder

**File:** `src/builders/invoice-query-filter.ts`

Builds `InvoiceQueryFilters` with fluent chaining for all 13 filter fields:

```typescript
const filters = new InvoiceQueryFilterBuilder()
  .withSubjectType('Subject1')
  .withDateRange('Invoicing', '2025-01-01', '2025-12-31')
  .withAmount('Brutto', 100, 10000)
  .withCurrencyCodes(['PLN', 'EUR'])
  .withInvoiceTypes(['Vat', 'Kor'])
  .build();
```

Required fields: `subjectType`, `dateRange`.

### Permission Grant Builders

**Directory:** `src/builders/permissions/`

Three builders for the most common permission grant scenarios:

| Builder | File | Builds |
|---|---|---|
| `PersonPermissionGrantBuilder` | `permissions/person-permission.ts` | `GrantPermissionsPersonRequest` |
| `EntityPermissionGrantBuilder` | `permissions/entity-permission.ts` | `GrantPermissionsEntityRequest` |
| `AuthorizationPermissionGrantBuilder` | `permissions/authorization-permission.ts` | `GrantPermissionsAuthorizationRequest` |

Example -- granting person permissions:

```typescript
const grant = new PersonPermissionGrantBuilder()
  .withSubjectIdentifier('Pesel', '12345678901')
  .withPermissions(['InvoiceRead', 'InvoiceWrite'])
  .withDescription('Invoice access for accountant')
  .withSubjectDetails({
    subjectDetailsType: 'PersonByIdentifier',
    personById: { firstName: 'Jan', lastName: 'Kowalski' },
  })
  .build();
```

Required fields for all permission builders: subject identifier, at least one permission, description, subject details.

### BatchFileBuilder

**File:** `src/builders/batch-file.ts`

A static builder (not fluent) that splits a ZIP into parts, encrypts each, and computes hashes:

```typescript
const result = BatchFileBuilder.build(zipBytes, encryptFn, { maxPartSize: 50_000_000 });
// result.batchFile  — BatchFileInfo for OpenBatchSessionRequest
// result.encryptedParts — Uint8Array[] ready for upload
```

Also provides `buildFromStream()` for stream-based two-pass processing.

Constants: `BATCH_MAX_PART_SIZE` (100 MB), `BATCH_MAX_TOTAL_SIZE` (5 GB), `BATCH_MAX_PARTS` (50).

---

## Import Patterns

### From the package root (recommended for consumers)

```typescript
// Types
import type {
  InvoiceQueryFilters,
  AuthChallengeResponse,
  ContextIdentifier,
  PermissionSubjectIdentifierType,
} from 'ksef-client-ts';

// Builders
import {
  InvoiceQueryFilterBuilder,
  AuthKsefTokenRequestBuilder,
  PersonPermissionGrantBuilder,
} from 'ksef-client-ts';

// Constants
import { FORM_CODES, INVOICE_TYPES_BY_SYSTEM_CODE } from 'ksef-client-ts';
```

### From domain paths (for internal use / tree-shaking)

```typescript
import type { InvoiceQueryFilters } from '../models/invoices/types.js';
import type { ContextIdentifier } from '../models/common.js';
```

Note the `.js` extension -- this is an ESM resolution convention used throughout the codebase, even though source files are `.ts`.

### Barrel re-export chain

```
src/models/invoices/types.ts
  └── re-exported by src/models/invoices/index.ts
        └── re-exported by src/models/index.ts
              └── re-exported by src/index.ts
```

Every type defined in any `src/models/{domain}/types.ts` is available from the top-level export.
