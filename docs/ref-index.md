# Reference Materials Index (ref/)

## 1. ksef-client-java

Java KSeF API client (Gradle, package `pl.akmf.ksef.sdk`).

### Main client: `ksef-client/src/main/java/pl/akmf/ksef/sdk/`

| Directory | Description |
|---|---|
| `api/builders/auth/` | Authentication request builders |
| `api/builders/batch/` | Batch session builders |
| `api/builders/certificate/` | Certificate handling |
| `api/builders/invoices/` | Invoice request builders |
| `api/builders/permission/` | Permission builders (entity, euentity, indirect, person, personal, proxy, subunit) |
| `api/builders/session/` | Session builders |
| `api/builders/tokens/` | KSeF token handling |
| `api/services/` | API services |
| `client/` | HTTP client and interfaces |
| `client/interfaces/` | Client interfaces |
| `client/model/` | Data models (auth, certificate, invoice, lighthouse, limit, permission, qrcode, session, testdata, xml) |
| `client/peppol/` | Peppol integration |
| `sign/` | Signing (XAdES) |
| `system/` | System utilities |

### Demo app: `demo-web-app/src/`

| Directory | Description |
|---|---|
| `main/java/.../sdk/api/` | Demo API controllers |
| `main/java/.../sdk/util/` | Utilities |
| `main/java/.../sdk/exception/` | Error handling |
| `main/resources/xml/invoices/sample/` | Sample invoice XML files |
| `integrationTest/java/.../sdk/` | Integration tests (all major scenarios) |
| `integrationTest/resources/keys/` | Test keys (RSA, ECDSA) |
| `integrationTest/resources/xml/invoices/sample/` | Test invoice XML files |
| `test/java/.../sdk/api/services/` | Service unit tests |

### HTTP requests: `.http/`

Manual API testing files: `authentication.http`, `certificate.http`, `lighthouse.http`, `permission.http`, `qr_code.http`, `session_and_invoice.http`, `token.http`

---

## 2. ksef-client-csharp

C# KSeF API client (.NET solution `KSeF.Client.sln`).

### Core: `KSeF.Client.Core/`

| Directory | Description |
|---|---|
| `Exceptions/` | API exceptions (KsefApiException, RateLimit, etc.) |
| `Infrastructure/Rest/` | REST infrastructure (RestRequest, Routes, RouteBuilder) |
| `Interfaces/Clients/` | Client interfaces (IOnlineSessionClient, IInvoiceDownloadClient, IBatchSessionClient, ICertificateClient, IPermissionOperationClient, etc.) |
| `Interfaces/Rest/` | REST interfaces |
| `Interfaces/Services/` | Service interfaces |
| `Models/` | Data models |
| `Models/ApiResponses/` | API responses |
| `Models/Authorization/` | Authorization |
| `Models/Certificates/` | Certificates |
| `Models/Invoices/` | Invoices |
| `Models/Lighthouse/` | Lighthouse |
| `Models/Peppol/` | Peppol |
| `Models/Permissions/` | Permissions (Entity, EUEntity, EUEntityRepresentative, IndirectEntity, Person, SubUnit, Identifiers, Authorizations) |
| `Models/QRCode/` | QR codes |
| `Models/RateLimits/` | Rate limits |
| `Models/Sessions/` | Sessions (ActiveSessions, BatchSession, OnlineSession) |
| `Models/Token/` | Tokens |
| `Models/TestData/` | Test data |

### Client: `KSeF.Client/`

| Directory | Description |
|---|---|
| `Api/Builders/` | Builders (Auth, Batch, Certificates, Online, EntityPermissions, EUEntityPermissions, IndirectEntityPermissions, PersonPermissions, SubEntityPermissions, X509Certificates) |
| `Api/Services/` | API services |
| `Clients/` | Client implementations |
| `Http/` | HTTP client and helpers |
| `DI/` | Dependency injection |
| `Extensions/` | Extensions |
| `Helpers/` | Utilities |
| `Validation/` | Validation |
| `Resources/` | Resources (XSD schemas, etc.) |

### Client factory: `KSeF.Client.ClientFactory/`

DI integration, client creation via `IKSeFClientFactory`.

### Tests: `KSeF.Client.Tests.Core/`

| Directory | Description |
|---|---|
| `E2E/Authorization/` | Authorization E2E tests |
| `E2E/BatchSession/` | Batch session E2E tests |
| `E2E/Certificates/` | Certificate E2E tests |
| `E2E/Invoice/` | Invoice E2E tests |
| `E2E/OnlineSession/` | Online session E2E tests |
| `E2E/Permissions/` | Permission E2E tests (Entity, EuEntity, EuRepresentative, Indirect, Person, Subunit, Authorization) |
| `E2E/Lighthouse/` | Lighthouse E2E tests |
| `E2E/QrCode/` | QR code E2E tests |
| `E2E/Peppol/` | Peppol E2E tests |
| `E2E/KsefToken/` | Token E2E tests |
| `E2E/Limits/` | Rate limits E2E tests |
| `E2E/Upo/` | UPO E2E tests |
| `UnitTests/` | Unit tests |

### Demo: `KSeF.DemoWebApp/`

ASP.NET demo application with controllers and services.

---

## 3. ksef-docs (original, Polish)

Official KSeF API documentation.

| File/directory | Description |
|---|---|
| `open-api.json` | KSeF API OpenAPI specification |
| `srodowiska.md` | Environments |
| `uwierzytelnianie.md` | Authentication |
| `sesja-interaktywna.md` | Interactive session |
| `sesja-wsadowa.md` | Batch session |
| `uprawnienia.md` | Permissions |
| `tokeny-ksef.md` | KSeF tokens |
| `certyfikaty-KSeF.md` | KSeF certificates |
| `kody-qr.md` | QR codes |
| `tryby-offline.md` | Offline modes |
| `przeglad-kluczowych-zmian-ksef-api-2-0.md` | Overview of key API 2.0 changes |
| `api-changelog.md` | API changelog |
| `dane-testowe-scenariusze.md` | Test data and scenarios |
| `auth/` | Authentication: contexts (NIP, VAT-UE, internal-id), XAdES signatures, sessions, certificates |
| `faktury/` | Invoices: KSeF numbers, status checking, UPO, verification |
| `faktury/schemy/` | Invoice XSD schemas (FA, PEF, RR) |
| `faktury/upo/` | UPO examples and schemas |
| `pobieranie-faktur/` | Invoice retrieval: HWM, incremental retrieval |
| `limity/` | API limits and general limits |
| `offline/` | Automatic offline mode detection, technical correction |
| `qr/` | QR code images |

---

## 4. ksef-docs-translated (translations)

Fork of ksef-docs with EN/RU/UK translations.

| Directory | Description |
|---|---|
| `translations/en/` | English translation of all documents |
| `translations/ru/` | Russian translation of all documents |
| `translations/uk/` | Ukrainian translation of all documents |
| `translations/en/open-api.json` | Translated OpenAPI specification |
| `prompts/` | Translation prompts |
| `scripts/` | Build, sync and translation scripts |
| `site/` | VitePress site |

Translation structure mirrors `ksef-docs` 1:1.

---

## Quick Lookup by Task

| Task | Where to look |
|---|---|
| OpenAPI specification | `ksef-docs/open-api.json` or `ksef-docs-translated/translations/en/open-api.json` |
| How authentication works | `ksef-docs-translated/translations/en/uwierzytelnianie.md`, `ksef-docs-translated/translations/en/auth/` |
| How sessions work | `ksef-docs-translated/translations/en/sesja-interaktywna.md`, `sesja-wsadowa.md` |
| Invoice XSD schemas | `ksef-docs/faktury/schemy/` |
| REST routes | C#: `KSeF.Client.Core/Infrastructure/Rest/Routes.cs` |
| HTTP client (implementation example) | Java: `ksef-client/src/.../sdk/client/`, C#: `KSeF.Client/Http/` |
| Data models | Java: `ksef-client/src/.../sdk/client/model/`, C#: `KSeF.Client.Core/Models/` |
| Request builders | Java: `ksef-client/src/.../sdk/api/builders/`, C#: `KSeF.Client/Api/Builders/` |
| Integration tests (usage examples) | Java: `demo-web-app/src/integrationTest/`, C#: `KSeF.Client.Tests.Core/E2E/` |
| Sample invoice XML | Java: `demo-web-app/src/main/resources/xml/invoices/sample/` |
| XAdES signing | Java: `ksef-client/src/.../sdk/sign/` |
| Peppol | Java: `ksef-client/src/.../sdk/client/peppol/`, C#: `KSeF.Client.Core/Models/Peppol/` |
| QR codes | Java: `ksef-client/src/.../sdk/client/model/qrcode/`, C#: `KSeF.Client.Core/Models/QRCode/` |
| Permissions | Java: `ksef-client/src/.../sdk/api/builders/permission/`, C#: `KSeF.Client/Api/Builders/*Permissions/` |
| API limits | `ksef-docs-translated/translations/en/limity/` |
