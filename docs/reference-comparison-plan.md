# Reference Projects Comparison & Improvement Plan

> Date: 2026-03-22
> Compared: our ksef-client-ts vs 4 reference implementations

## Projects Overview

| Project | Language | Org | Version | Release cadence |
|---|---|---|---|---|
| **ksef-client-ts (ours)** | TypeScript | Flopsstuff | ~0.x (dev) | — |
| **ksef-client-csharp** | C# (.NET) | CIRFMF (MinFin) | 2.3.0 | Quarterly |
| **ksef-client-java** | Java (Gradle) | CIRFMF (MinFin) | 3.0.20 | 1-2/week |
| **ksef-client-ts (lkow)** | TypeScript | lkow | 1.7.1 | Rare |
| **ksef-client-typescript (smekcio)** | TypeScript | smekcio | 0.4.0 | Quarterly |

---

## Maturity Comparison

| Aspect | Ours | C# | Java | lkow | smekcio |
|---|---|---|---|---|---|
| API coverage | 14 services | 16+ clients | 14+ services | 10 services | 12 clients |
| Tests | 853 unit | 81+ E2E + unit | 43 integ + 2 unit | 22 files | 64 (59u + 5e2e) |
| CLI | 14 commands | No (DemoWebApp) | No (DemoWebApp) | No | 9 commands |
| Documentation | VitePress site | README + release notes | README + release notes | 7 guides | Docs + parity |
| CI/CD | GitHub Actions | Yes | GitHub Actions | GitHub Actions | 10 workflows |
| Dual ESM/CJS | Yes | N/A (.NET) | N/A (JVM) | Yes | Yes |
| Demo app | No | ASP.NET Core | Spring Boot | No | No |

---

## Crypto Comparison

| Operation | Ours | C# | Java | lkow | smekcio |
|---|---|---|---|---|---|
| AES-256-CBC | Yes | Yes | Yes | Yes | Yes |
| RSA-OAEP | Yes | Yes | Yes | Yes | Yes |
| ECDH+AES-GCM | Yes | Yes | Yes | Yes | Yes |
| XAdES-B signing | Yes | Yes | Yes (EU-DSS) | Yes | Yes |
| CSR generation | Yes | Yes | Yes | No | No |
| Self-signed certs | Yes | Yes | Yes | No | No |
| PKCS#12 (P12/PFX) | **No** | Yes | Yes | Yes | Yes |

---

## Feature Comparison

| Feature | Ours | C# | Java | lkow | smekcio |
|---|---|---|---|---|---|
| Token auth | Yes | Yes | Yes | Yes | Yes |
| XAdES cert auth | Yes | Yes | Yes | Yes | Yes |
| Online sessions | Yes | Yes | Yes | Yes | Yes |
| Batch sessions | Yes | Yes | Yes | Yes | Yes |
| Invoice query/export | Yes | Yes | Yes | Yes | Yes |
| Permissions (7 types) | Yes | Yes | Yes | Yes | Yes |
| KSeF Tokens CRUD | Yes | Yes | Yes | Yes | Yes |
| Certificates enrollment | Yes | Yes | Yes | Yes | Yes |
| QR codes | Yes | Yes (SkiaSharp) | Yes (ZXing) | Yes (KOD I+II) | Yes (optional) |
| Lighthouse | Yes | Yes | Yes | No | Yes |
| Rate limits API | Yes | Yes | Yes | Yes | Yes |
| Peppol | Yes | Yes | Yes | Yes | Yes |
| Test Data API | Yes | Yes | Yes | Yes (TE-only) | Yes |
| Retry + exponential backoff | Yes | Partial | Yes (429) | Yes | Yes |
| Token bucket rate limiter | Yes | No | No | Yes (3 windows) | No |
| 401 auto-refresh (dedup) | Yes | No | No | No | No |
| Presigned URL validation | Yes | No | No | No | Yes |
| **UPO versioning (v4-2/v4-3)** | **No** | Yes | Yes | Yes | No |
| **Workflows (orchestration)** | **No** | No | No | No | Yes (6) |
| **Offline mode** | **No** | No | Yes | Partial | Yes |
| **Incremental export (HWM)** | **No** | Yes | No | No | Yes |
| **DI/Factory multi-env** | **No** | Yes (Factory) | No | No | No |
| **Batch auto-split (100MB)** | **No** | Yes (stream) | Yes (stream) | Yes | Yes |
| **XSD validation** | **No** | Yes | No | No | No |
| **PKCS#12 import** | **No** | Yes | Yes | Yes | Yes |
| **NIP/PESEL checksum** | **No** | Yes | Yes | Yes | No |
| **Invoice XML serialization** | **No** | No | Yes (JAXB) | No | Yes |
| **Problem Details (RFC 7807)** | **No** | Yes | Yes | No | No |
| **Stream-based batch upload** | **No** | Yes | Yes | No | No |
| Demo Web App | No | Yes (ASP.NET) | Yes (Spring Boot) | No | No |

---

## Gaps Identified (what to adopt)

### From C# (CIRFMF)

1. **Multi-Environment Factory** (`IKSeFClientFactory`) — creates clients for Test/Demo/Prod with cached crypto services per environment. Useful for apps working with multiple environments simultaneously.
2. **UPO Versioning** — `X-KSeF-Feature` header for UPO v4-2 / v4-3 format selection. Default v4-3 from 2026-01-05.
3. **Problem Details (RFC 7807)** — `UnauthorizedProblemDetails` and `ForbiddenProblemDetails` structured error responses for 401/403.
4. **Stream-based batch upload** — `SendBatchPartsWithStreamAsync()` for memory-efficient large file uploads.
5. **XSD Validation** — validates invoice XML against FA-3 XSD schema before submission.
6. **Ephemeral key loading** — `X509Certificate2.MergeWithPemKey()` for IIS/Azure compatibility.
7. **KSeF Number Validator** — validates KSeF-assigned invoice numbers with checksum.
8. **Flexible JSON serialization** — runtime switch between PascalCase and camelCase.

### From Java (CIRFMF)

1. **UPO Versioning** — same as C#, `X-KSeF-Feature` header support.
2. **Problem Details** — `ForbiddenApiException`, `UnauthorizedApiException` with structured details.
3. **EU-DSS for XAdES** — more robust XAdES implementation using EU Digital Signature Services library.
4. **Multiple document structures** — `SystemCode` enum: FA v2, FA v3, PEF, PEF_KOR, FA_RR with helpers.
5. **Offline mode** — cryptography service supports offline mode with fallback.
6. **Stream-based batch** — `sendBatchPartsWithStream()` for large file uploads.
7. **ECDSA digest selection** — P-256 -> SHA-256, P-384 -> SHA-384, P-512 -> SHA-512.
8. **Comprehensive release notes** — 120KB changelog with per-release breakdowns.

### From lkow (TS)

1. **PKCS#12 import** — transparent handling of PEM and P12/PFX certificates with password support via node-forge.
2. **NIP/PESEL/VAT-EU validation** — checksum-based validation (not just regex patterns).
3. **Token bucket rate limiter (3 windows)** — per-second/minute/hour sliding windows with endpoint-specific limits.
4. **QR Code KOD II signing** — offline invoice QR codes with RSA-PSS and ECDSA signatures.
5. **Offline mode types** — dedicated types for offline workflow, technical correction flow, deadline tracking.
6. **Batch file builder** — splits large batches into configurable parts (default 5MB) with SHA-256 hashes.
7. **Test Data API guards** — throws if used against non-test environment.
8. **Multiple documentation guides** — CERTIFICATE_GUIDE, TOKEN_LIFECYCLE_GUIDE, OFFLINE_MODE_GUIDE, MULTI_PARTY_GUIDE, EXTERNAL_SIGNING_GUIDE.

### From smekcio (TS)

1. **Workflows (6 high-level orchestrations)** — the most valuable pattern:
   - `AuthCoordinator` — token/cert/XAdES auth flows
   - `OnlineSessionWorkflow` — open -> encrypt -> send -> receive UPO
   - `BatchSessionWorkflow` — open -> ZIP -> split/upload 100MB parts -> close
   - `InvoiceExportWorkflow` — initiate -> poll -> download encrypted ZIP -> decrypt
   - `IncrementalExportWorkflow` — HWM-based export, resume on restart
   - `OfflineInvoiceWorkflow` — prepare offline, send later
2. **Invoice XML serialization** — `serializeInvoiceXml()` for FA/RR/PEF forms.
3. **UPO parsing** — `parseUpoXml()` for receipt/confirmation extraction.
4. **Presigned URL security** — HTTPS validation, IP allowlist.
5. **100% branch coverage** enforced in CI.
6. **OpenAPI type generation** — `openapi.generated.ts` auto-generated from spec.
7. **Parity docs** — coverage checklist vs official KSeF docs.
8. **Release-Please automation** — semantic versioning + auto release PRs.
9. **10 CI workflows** — including validate-models and validate-openapi.

---

## Implementation Plan

### P1 — Quick Wins (low effort, high value)

#### P1.1 UPO Versioning
- **Source**: C#, Java
- **Effort**: Low (1-2 hours)
- **What**: Add `X-KSeF-Feature` header support for UPO version selection (v4-2 / v4-3)
- **Where**: `RestClient` or per-request header, `SessionStatusService.getInvoiceUpo()`
- **Default**: v4-3 (from 2026-01-05)

#### P1.2 Problem Details (RFC 7807) for 401/403
- **Source**: C#, Java
- **Effort**: Low (2-3 hours)
- **What**: Parse `UnauthorizedProblemDetails` and `ForbiddenProblemDetails` from 401/403 responses
- **Where**: `RestClient.ensureSuccess()`, new model types in `src/models/common.ts`
- **Details**: Extract `type`, `title`, `status`, `detail`, `instance` fields per RFC 7807

#### P1.3 NIP/PESEL Checksum Validation
- **Source**: lkow, Java, C#
- **Effort**: Low (2-3 hours)
- **What**: Add checksum digit validation (not just regex) for NIP (10 digits, weights 6-5-7-2-3-4-5-6-7) and PESEL (11 digits, weights 1-3-7-9-1-3-7-9-1-3)
- **Where**: `src/validation/` — extend existing patterns

#### P1.4 Test Data Environment Guard
- **Source**: lkow
- **Effort**: Low (1 hour)
- **What**: `TestDataService` should throw if client environment is not TEST/DEMO
- **Where**: `src/services/test-data-service.ts`

### P2 — Core Improvements (medium effort, high value)

#### P2.1 PKCS#12 (P12/PFX) Import
- **Source**: lkow, smekcio, C#, Java
- **Effort**: Medium (4-6 hours)
- **What**: Support `.p12/.pfx` certificate import with password for XAdES authentication
- **Where**: `src/crypto/` — new helper using `node-forge` (already a dependency)
- **API**: `CertificateService.fromPkcs12(buffer, password)` -> `{ cert, privateKey }`
- **Why**: P12 is the primary format for real-world certificate distribution

#### P2.2 Batch Auto-Split with SHA-256
- **Source**: all 4 references
- **Effort**: Medium (4-6 hours)
- **What**: Automatically split batch ZIP files into parts (default 100MB), compute SHA-256 hash per part
- **Where**: New `BatchFileBuilder` in `src/builders/` or `src/services/batch-session-service.ts`
- **API**: `batchSession.splitAndUpload(zipBuffer, { partSize: 100_000_000 })`

#### P2.3 KSeF Number Validator
- **Source**: C#, Java
- **Effort**: Medium (3-4 hours)
- **What**: Validate KSeF-assigned invoice number format with checksum verification
- **Where**: `src/validation/`

#### P2.4 Workflows (Session Orchestration)
- **Source**: smekcio
- **Effort**: High (2-3 days)
- **What**: High-level workflow classes that orchestrate multi-step API operations
- **Where**: New `src/workflows/` directory
- **Workflows**:
  1. `OnlineSessionWorkflow` — open session -> send invoices -> close -> get UPO
  2. `BatchSessionWorkflow` — open -> split ZIP -> upload parts -> close -> get UPO
  3. `InvoiceExportWorkflow` — initiate export -> poll status -> download -> decrypt
  4. `AuthWorkflow` — challenge -> encrypt/sign -> authenticate -> get token
- **Design**: Each workflow is a class with `execute()` method, progress callbacks, and error recovery

### P3 — Advanced Features (high effort)

#### P3.1 Incremental Export (HWM)
- **Source**: smekcio, C#
- **Effort**: Medium (4-6 hours)
- **What**: Track high-water mark for invoice export, support resume on restart
- **Where**: Part of `InvoiceExportWorkflow`
- **Storage**: Pluggable HWM store (file-based default, custom adapter interface)

#### P3.2 Offline Mode
- **Source**: lkow, smekcio
- **Effort**: High (2-3 days)
- **What**: Prepare invoices without network, QR code KOD II with cryptographic signing
- **Where**: New `src/services/offline-invoice-service.ts`, extend QR service
- **Includes**: Offline types, deadline tracking, technical correction flow

#### P3.3 Invoice XML Serialization
- **Source**: smekcio
- **Effort**: High (3-5 days)
- **What**: Serialize invoice data objects to valid KSeF XML (FA-3, FA-RR, PEF forms)
- **Where**: New `src/xml/` directory
- **Why**: Currently users must form XML manually

#### P3.4 XSD Validation
- **Source**: C#
- **Effort**: Medium (1-2 days)
- **What**: Validate invoice XML against FA-3 XSD schema before submission
- **Where**: New `src/validation/xsd-validator.ts`
- **Dependency**: May need `libxmljs2` or similar

#### P3.5 Stream-based Batch Upload
- **Source**: C#, Java
- **Effort**: Medium (4-6 hours)
- **What**: Upload batch parts from streams instead of loading entire file into memory
- **Where**: `BatchSessionService.sendPartsFromStream()`

#### P3.6 UPO Parsing
- **Source**: smekcio
- **Effort**: Medium (3-4 hours)
- **What**: Parse UPO XML response into typed objects (receipt number, timestamps, hash)
- **Where**: New `src/xml/upo-parser.ts`

### P4 — Nice-to-Have

#### P4.1 Multi-Environment Factory
- **Source**: C#
- **Effort**: Medium (4-6 hours)
- **What**: Factory that creates KSeFClient instances per environment with cached crypto services

#### P4.2 OpenAPI Type Generation
- **Source**: smekcio
- **Effort**: Medium (1-2 days)
- **What**: Auto-generate TypeScript types from OpenAPI spec, validate alignment in CI

#### P4.3 Release-Please Automation
- **Source**: smekcio
- **Effort**: Low (2-3 hours)
- **What**: Automated semantic versioning with release PRs via release-please GitHub Action

#### P4.4 Demo Web App
- **Source**: C#, Java
- **Effort**: High (3-5 days)
- **What**: Express.js or Fastify reference app demonstrating all API operations

---

## Summary: Our Strengths vs Gaps

### Where we lead

- **401 auto-refresh with dedup** — unique among all 5 projects
- **Token bucket rate limiter** — only us and lkow have this
- **Presigned URL validation** — only us and smekcio
- **Test volume** — 853 unit tests, highest count
- **CLI completeness** — 14 command groups with 40+ subcommands
- **Retry policy** — most configurable (retryable status codes, backoff, jitter)

### Where we lag

- **No PKCS#12 import** — all 4 references support this; blocking for real users
- **No batch auto-split** — all 4 references have this
- **No UPO versioning** — trivial to add, needed for API compliance
- **No workflows** — smekcio shows the value of high-level orchestration
- **No offline mode** — growing need as KSeF adoption increases
- **No invoice XML serialization** — users must form XML manually
- **No Problem Details parsing** — less structured error info for 401/403
