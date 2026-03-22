# Integration Tests Plan

Detailed plan for end-to-end integration tests against the KSeF TEST environment (`api-test.ksef.mf.gov.pl`).

Cross-references to all 4 reference implementations:
- **Java**: `ref/ksef-client-java/demo-web-app/src/integrationTest/java/pl/akmf/ksef/sdk/`
- **C#**: `ref/ksef-client-csharp/KSeF.Client.Tests.Core/E2E/`
- **TS-npm**: `ref/ksef-client-typescript/test/e2e/`
- **TS-lkow**: `ref/ksef-client-ts/tests/api2-demo.test.ts`

---

## 1. Infrastructure

### 1.1 Environment Variables

```bash
# Required for all tests
KSEF_TEST_NIP=<10-digit-test-nip>          # Context NIP for auth

# Token auth tests
KSEF_TEST_TOKEN=<ksef-api-token>           # From KSeF portal or /tokens endpoint

# XAdES auth tests (optional — tests skip if missing)
KSEF_TEST_CERT_PEM=<certificate-pem>       # Or KSEF_TEST_CERT_PEM_B64 (base64-encoded)
KSEF_TEST_KEY_PEM=<private-key-pem>        # Or KSEF_TEST_KEY_PEM_B64 (base64-encoded)
KSEF_TEST_KEY_PASSWORD=<key-password>      # Optional, if key is encrypted

# Gate flag for destructive / long-running tests
KSEF_TEST_E2E_FULL=1                       # Set to enable session, batch, export tests
```

> **Ref**: TS-npm uses the same two-tier approach: lightweight tests run always, full E2E requires `KSEF_E2E_FULL=1`.
> See `ref/ksef-client-typescript/test/e2e/sessions.test.js` and CI workflow `ref/ksef-client-typescript/.github/workflows/e2e-token.yml`.

### 1.2 File Structure

```
tests/
├── e2e/
│   ├── helpers/
│   │   ├── auth.ts                # authenticateWithToken(), authenticateWithCert()
│   │   ├── polling.ts             # pollUntil() utility
│   │   ├── identifiers.ts         # generateRandomNip(), generateRandomPesel()
│   │   ├── invoices.ts            # loadInvoiceTemplate(), replaceTemplatePlaceholders()
│   │   └── env.ts                 # getRequiredEnv(), getOptionalEnv(), skipIfMissing()
│   ├── fixtures/
│   │   ├── invoice-fa2.xml        # FA_2 v1.0E invoice template
│   │   └── invoice-fa3.xml        # FA_3 v1.0E invoice template
│   ├── 01-lighthouse.test.ts      # No auth required
│   ├── 02-auth-token.test.ts      # Token auth + challenge
│   ├── 03-auth-xades.test.ts      # XAdES certificate auth
│   ├── 04-session-online.test.ts  # Online session E2E
│   ├── 05-session-batch.test.ts   # Batch session E2E
│   ├── 06-invoices.test.ts        # Invoice query + export
│   ├── 07-permissions.test.ts     # Grant → query → revoke
│   ├── 08-tokens.test.ts          # Token lifecycle
│   ├── 09-certificates.test.ts    # Certificate enrollment lifecycle
│   ├── 10-limits.test.ts          # Rate limits + session limits
│   ├── 11-active-sessions.test.ts # Session list + revoke
│   └── 12-test-data.test.ts       # TestData API operations
│   └── 13-peppol.test.ts          # Peppol provider query
├── unit/
│   └── ... (existing 60 files)
```

### 1.3 Vitest Configuration

Add to `vitest.config.ts`:

```ts
export default defineConfig({
  test: {
    // existing config...
    include: ['tests/unit/**/*.test.ts'],       // default: unit only
  },
});
```

New script in `package.json`:

```json
{
  "test:e2e": "vitest run tests/e2e --reporter=verbose",
  "test:e2e:watch": "vitest tests/e2e --reporter=verbose"
}
```

> Keep `yarn test` running unit tests only. Integration tests run explicitly via `yarn test:e2e`.

### 1.4 Polling Utility

Central async polling function — all refs implement a variation of this pattern.

```ts
// tests/e2e/helpers/polling.ts
export async function pollUntil<T>(
  action: () => Promise<T>,
  condition: (result: T) => boolean,
  options?: { intervalMs?: number; maxAttempts?: number; description?: string },
): Promise<T> { ... }
```

| Parameter     | Default | Notes |
|---------------|---------|-------|
| `intervalMs`  | 2000    | Java uses 1-5s, C# uses 2s, TS-npm uses 2s |
| `maxAttempts` | 60      | = 2 min at 2s interval. Java: 30s max. C#: 60 attempts. |
| `description` | `''`    | For error messages on timeout |

Throws `Error('Polling timeout: {description}')` after max attempts.

> **Ref**: Java uses Awaitility (`await().atMost(30, SECONDS).pollInterval(2, SECONDS).until(...)`).
> C# uses `AsyncPollingUtils.PollAsync()` and `PollWithBackoffAsync()` — see `ref/ksef-client-csharp/KSeF.Client.Tests.Utils/AsyncPollingUtils.cs`.
> TS-npm uses `pollIntervalMs` + `maxAttempts` params in workflow methods.

### 1.5 Random Identifier Generators

Both Java and C# generate valid random NIPs/PESELs per test to avoid collisions.

```ts
// tests/e2e/helpers/identifiers.ts
export function generateRandomNip(): string { ... }   // 10-digit with checksum
export function generateRandomPesel(): string { ... }  // 11-digit with date + checksum
```

> **Ref**: Java — `IdentifierGeneratorUtils.generateRandomNIP()` in `ref/ksef-client-java/...`.
> C# — `MiscellaneousUtils.GetRandomNip()` / `GetRandomPesel()` in `ref/ksef-client-csharp/KSeF.Client.Tests.Utils/MiscellaneousUtils.cs`.

### 1.6 Invoice Templates

XML templates in `tests/e2e/fixtures/` with placeholders:

| Placeholder          | Replaced with |
|----------------------|---------------|
| `#nip#`              | Context NIP |
| `#invoice_number#`   | `UUID` |
| `#invoicing_date#`   | Current date `yyyy-MM-dd` |
| `#buyer_nip#`        | Random NIP (or context NIP for self-invoicing) |

> **Ref**: Java stores templates in `demo-web-app/src/integrationTest/resources/xml/invoices/`.
> C# stores templates in `KSeF.Client.Tests.Core/E2E/Templates/invoice-template-fa-X.xml`.

### 1.7 Auth Helpers

```ts
// tests/e2e/helpers/auth.ts

/** Token auth: challenge → encrypt → submit → poll → redeem */
export async function authenticateWithToken(
  client: KSeFClient, nip: string, token: string,
): Promise<{ accessToken: string; refreshToken: string }> { ... }

/** XAdES auth: challenge → sign → submit → poll → redeem */
export async function authenticateWithCert(
  client: KSeFClient, nip: string, certPem: string, keyPem: string,
): Promise<{ accessToken: string; refreshToken: string }> { ... }
```

The full auth flow (used by Java, C#, and TS refs):

```
1. client.auth.getChallenge()             → { challenge, timestamp }
2. Build AuthTokenRequest XML             (AuthTokenRequestBuilder + serialize)
3. Sign XML / encrypt token               (XAdES sign or KSeF token encrypt)
4. client.auth.submitXadesAuthRequest()   → { referenceNumber, authenticationToken }
   — or submitKsefTokenAuthRequest()
5. pollUntil(getAuthStatus, status.code !== 100)   // 100 = in progress
6. Assert status.code === 200
7. client.auth.getAccessToken(authToken)  → { accessToken, refreshToken }
```

> **Ref**: Java — `BaseIntegrationTest.authWithCustomNip()`.
> C# — `AuthenticationUtils.AuthenticateAsync()` in `ref/ksef-client-csharp/KSeF.Client.Tests.Utils/AuthenticationUtils.cs`.
> TS-npm — `client.workflows.auth.authenticateWithCertificate()` in `ref/ksef-client-typescript/test/e2e/xades-auth.test.js`.

---

## 2. Test Suites

### 2.1 Lighthouse (01-lighthouse.test.ts)

**No auth required.** Simplest test — validates connectivity to the monitoring service.

| # | Test case | API calls | Assertions |
|---|-----------|-----------|------------|
| 1 | Get KSeF status | `lighthouse.getStatus()` | `status` defined, `code` is number |
| 2 | Get system messages | `lighthouse.getMessages()` | Returns array |

> **Ref**: Java — `LighthouseIntegrationTest.java`. C# — `E2E/Lighthouse/`.

---

### 2.2 Token Authentication (02-auth-token.test.ts)

**Requires**: `KSEF_TEST_TOKEN`, `KSEF_TEST_NIP`

| # | Test case | API calls | Assertions |
|---|-----------|-----------|------------|
| 1 | Get auth challenge | `auth.getChallenge()` | `challenge` non-empty string, `timestamp` present |
| 2 | Full token auth flow | `getChallenge → submitKsefTokenAuthRequest → pollAuthStatus → getAccessToken` | Final status code = 200, `accessToken` non-empty |
| 3 | Refresh access token | `auth.refreshAccessToken(refreshToken)` | New access token returned |
| 4 | Query after auth | `permissions.queryPersonalGrants()` | Returns valid paginated response |

> **Ref**: Java — `AuthorizationIntegrationTest.java` (token refresh test).
> C# — `E2E/Authorization/AuthorizationE2ETests.cs`.
> TS-npm — `test/e2e/connect.test.js` (connect + query).
> TS-lkow — `tests/api2-demo.test.ts` (token flow).

---

### 2.3 XAdES Certificate Authentication (03-auth-xades.test.ts)

**Requires**: `KSEF_TEST_NIP` + either real cert env vars OR generates self-signed certs.

| # | Test case | API calls | Assertions |
|---|-----------|-----------|------------|
| 1 | Generate self-signed cert + sign challenge | `CertificateService.generatePersonalCertificate → auth.getChallenge → SignatureService.sign` | Signed XML contains `ds:Signature`, `ds:X509Certificate` |
| 2 | Full XAdES auth flow (RSA) | `getChallenge → build AuthTokenRequest → sign → submitXadesAuthRequest → pollAuthStatus → getAccessToken` | Status 200, access token valid |
| 3 | Full XAdES auth flow (ECDH) | Same flow but with ECDH encryption | Status 200, access token valid |

> **Ref**: Java — `AuthorizationIntegrationTest.ksefCertificateEnrollmentWithEcdsaTest()` and `...WithRsaTest()`.
> C# — `E2E/Authorization/AuthorizationE2ETests.cs` (supports both RSA and ECDH).
> TS-npm — `test/e2e/xades-auth.test.js`.
> Existing test: `tests/e2e/cert-auth.test.ts` (partial — does not submit to API).

---

### 2.4 Online Session E2E (04-session-online.test.ts)

**Requires**: `KSEF_TEST_E2E_FULL=1`, `KSEF_TEST_TOKEN`, `KSEF_TEST_NIP`

This is the core happy-path test. All 4 reference implementations have this as their primary E2E test.

| # | Test case | API calls | Assertions |
|---|-----------|-----------|------------|
| 1 | Full online session flow | See flow below | All steps succeed, UPO retrieved |
| 2 | Send invoice with wrong NIP | Open session → send invoice with mismatched NIP → close | Status 445, `failedInvoiceCount >= 1` |

**Happy-path flow** (test 1):

```
 1. Authenticate (token or cert) → accessToken
 2. client.crypto.init()          → fetch KSeF public keys
 3. crypto.getEncryptionData()    → { encryptedKey, iv, aesKey }
 4. onlineSession.openSession(request)
        request: formCode (FA_2 or FA_3), encryption info
        → { referenceNumber }
 5. Load invoice template, replace placeholders
 6. Encrypt invoice with AES-256-CBC using aesKey/iv
 7. Calculate SHA-256 hashes (plaintext + encrypted), file sizes
 8. onlineSession.sendInvoice(sessionRef, request)
        request: encryptedBody (base64), hashSHA (plaintext), fileSize, encryptedHashSHA, encryptedFileSize
        → { referenceNumber (invoiceRef) }
 9. pollUntil(sessionStatus.getSessionStatus, s => s.successfulInvoiceCount > 0)
        interval: 5s, max: 30 attempts
10. onlineSession.closeSession(sessionRef)
11. pollUntil(sessionStatus.getSessionStatus, s => s.status.code === 200)
        interval: 5s, max: 30 attempts
12. sessionStatus.getSessionInvoices(sessionRef)
        assert: 1 invoice, ksefNumber present, status 200
13. sessionStatus.getInvoiceUpoByKsefNumber(sessionRef, ksefNumber)
        assert: UPO bytes non-empty
14. sessionStatus.getInvoiceUpoByReference(sessionRef, invoiceRef)
        assert: UPO bytes non-empty
15. sessionStatus.getSessionUpo(sessionRef, upoRef)
        assert: session UPO bytes non-empty
16. invoices.getInvoice(ksefNumber)
        assert: returns invoice XML
```

**Assertions** (per step):
- Step 4: `referenceNumber` non-empty
- Step 8: `referenceNumber` non-empty
- Step 9 (after poll): `successfulInvoiceCount === 1`, `failedInvoiceCount` null or 0
- Step 11 (after poll): `status.code === 200`
- Step 12: `invoices.length === 1`, each has `ksefNumber`, `invoiceNumber`, `ordinalNumber`
- Steps 13-15: UPO data is non-empty Buffer/string
- Step 16: Invoice XML contains original NIP

> **Ref**: Java — `OnlineSessionIntegrationTest.onlineSessionE2EIntegrationTest()`. This is the most detailed reference — 14 steps, including 3 UPO retrieval methods.
> C# — `E2E/OnlineSession/OnlineSessionE2ETests.cs` (`OnlineSessionAsync_FullIntegrationFlow_AllStepsSucceed`). Includes UPO XML parsing and validation.
> TS-npm — `test/e2e/sessions.test.js` (online session section).
> TS-lkow — `tests/api2-demo.test.ts` (full demo flow).

---

### 2.5 Batch Session E2E (05-session-batch.test.ts)

**Requires**: `KSEF_TEST_E2E_FULL=1`, `KSEF_TEST_TOKEN`, `KSEF_TEST_NIP`

| # | Test case | API calls | Assertions |
|---|-----------|-----------|------------|
| 1 | Send batch of N invoices (happy path) | See flow below | All N invoices processed, UPO available |
| 2 | Invalid encrypted key | Corrupt `encryptedSymmetricKey` → send | Status 415 ("key decryption error") |
| 3 | Corrupted encrypted data | Flip byte in encrypted part → send | Status 405 ("part hash mismatch") |

**Happy-path flow** (test 1):

```
 1. Authenticate → accessToken
 2. crypto.init() + getEncryptionData()
 3. Generate N invoices in memory (template + placeholder replacement)
 4. Create ZIP archive from invoice XMLs
 5. Calculate ZIP metadata (SHA-256 hash, file size) BEFORE encryption
 6. Encrypt ZIP with AES-256-CBC
 7. Split encrypted ZIP into parts (max 100MB per part)
 8. Calculate per-part metadata (SHA-256 hash, size)
 9. batchSession.openSession(request)
        request: formCode, batchFile (size + hash), parts[], encryption info
        → { referenceNumber, partUploadUrls[] }
10. batchSession.sendParts(openResponse, encryptedParts)
        Uploads each part to presigned S3 URL
11. batchSession.closeSession(batchRef)
12. pollUntil(sessionStatus.getSessionStatus, s => s.status.code === 200)
        interval: 2s, max: 60 attempts (may use exponential backoff)
13. Assert: successfulInvoiceCount === N, failedInvoiceCount === 0
14. sessionStatus.getSessionInvoices(sessionRef, pageSize=100)
        assert: N invoices returned
15. sessionStatus.getInvoiceUpoByKsefNumber(sessionRef, firstKsefNumber)
        assert: UPO bytes non-empty
16. sessionStatus.getSessionUpo(sessionRef, upoRef)
        assert: session UPO bytes non-empty
```

**Batch parameters**:
- Invoice count: 5-20 (enough to test, fast enough for CI)
- Max total package size: 5 GB (not tested in CI — Java has negative test for this)
- Max part size: 100 MB
- Max part count: 50

> **Ref**: Java — `BatchIntegrationTest.java`. 12 test methods including 7 negative tests for limits, corruption, and validation errors. Key negative scenarios:
> - 10,001 invoices → status 420
> - Missing parts → exception at close (code 21205)
> - 51 parts → exception at open (code 21161)
> - Corrupted encrypted key → status 415
> - Bit-flipped encrypted data → status 405
> - Wrong IV → status 430
>
> C# — `E2E/BatchSession/BatchSessionE2ETests.cs`. Uses `BatchUtils.EncryptAndSplit()` and `PollWithBackoffAsync()`.
> TS-npm — `test/e2e/sessions.test.js` (batch session section, `openUploadAndClose`).

---

### 2.6 Invoice Query & Export (06-invoices.test.ts)

**Requires**: `KSEF_TEST_E2E_FULL=1`, `KSEF_TEST_TOKEN`, `KSEF_TEST_NIP`

Depends on at least 1 invoice having been sent first (shared setup or sequenced after session test).

| # | Test case | API calls | Assertions |
|---|-----------|-----------|------------|
| 1 | Query invoice metadata | `invoices.queryInvoiceMetadata(filters)` | Returns array with expected invoice count |
| 2 | Get invoice by KSeF number | `invoices.getInvoice(ksefNumber)` | Returns XML string containing NIP |
| 3 | Async export full flow | See flow below | Decrypted ZIP contains invoice XMLs + metadata JSON |

**Export flow** (test 3):

```
 1. Authenticate + crypto.init()
 2. invoices.exportInvoices(request)
        request: filters (subjectType, dateRange, dateType), encryptionInfo
        → { referenceNumber }
 3. pollUntil(invoices.getInvoiceExportStatus, s => s.status.code === 200)
        interval: 2s, max: 60 attempts
 4. Download package parts from URLs in export status response
 5. Decrypt each part with AES-256-CBC
 6. Concatenate and unzip
 7. Parse metadata JSON + extract invoice XMLs
 8. Assert: invoice count matches, ksefNumbers in XMLs match metadata
```

> **Ref**: Java — `QueryInvoiceIntegrationTest.java`. Tests metadata query, async export + download + decrypt + unzip. Also has parameterized test for `hasAttachment` filter.
> C# — `E2E/Invoice/InvoiceE2ETests.cs`.
> TS-npm — `test/e2e/export.test.js` (full export workflow) and `incrementalExport.test.js` (incremental export with continuation points).

---

### 2.7 Permissions (07-permissions.test.ts)

**Requires**: `KSEF_TEST_E2E_FULL=1`, `KSEF_TEST_TOKEN`, `KSEF_TEST_NIP`

| # | Test case | API calls | Assertions |
|---|-----------|-----------|------------|
| 1 | Query own personal grants | `permissions.queryPersonalGrants()` | Returns paginated response |
| 2 | Grant + query + revoke person permissions | See flow below | Grant succeeds, query finds it, revoke removes it |
| 3 | Grant + query + revoke entity permissions | Same pattern for entities | Same assertions |
| 4 | Get attachment status | `permissions.getAttachmentStatus()` | Returns `{ allowed: boolean }` |

**Person permissions flow** (test 2):

```
 1. Authenticate → accessToken
 2. Generate random PESEL (target subject)
 3. permissions.grantPersonPermissions(request)
        request: subject (type=Pesel, value), permissions [InvoiceRead, InvoiceWrite],
                 description "E2E test", subjectDetails (firstName, lastName)
        → { referenceNumber }
 4. pollUntil(permissions.getOperationStatus, s => s.status.code === 200)
        interval: 2s, max: 30 attempts
 5. permissions.queryPersonsGrants({ queryType: 'PermissionGrantedInCurrentContext' })
        assert: finds 2 permissions (read + write) with matching description
        collect: permission IDs
 6. For each ID: permissions.revokeCommonGrant(id)
        → { referenceNumber }
 7. pollUntil(getOperationStatus, status.code === 200) for each revoke
 8. permissions.queryPersonsGrants(...) again
        assert: 0 permissions with that description
```

> **Ref**: Java — 11 permission test files covering persons, entities, proxies, indirect, subunits, EU entities, authorization permissions. Key file: `EntityPermissionIntegrationTest.java`.
> C# — `E2E/Permissions/PersonPermission/PersonPermissionE2ETests.cs` (`PersonPermissionsFullFlowGrantSearchRevokeSearch`). Uses `AsyncPollingUtils.PollAsync()` for both grant and revoke operations.
> Both Java and C# test entity + person + EU entity + authorization + indirect + subunit permissions.

---

### 2.8 Token Lifecycle (08-tokens.test.ts)

**Requires**: `KSEF_TEST_E2E_FULL=1`, `KSEF_TEST_TOKEN`, `KSEF_TEST_NIP`

| # | Test case | API calls | Assertions |
|---|-----------|-----------|------------|
| 1 | Generate token | `tokens.generateToken(request)` | Returns ref + token value |
| 2 | Query tokens | `tokens.queryTokens()` | Returns list, includes generated token |
| 3 | Get token by ref | `tokens.getToken(ref)` | Status matches |
| 4 | Revoke token | `tokens.revokeToken(ref)` | No error, subsequent get shows revoked |

> **Ref**: Java — `KsefTokenIntegrationTest.java`.
> TS-lkow — `examples/05-token-management.ts` (example script covering full lifecycle).

---

### 2.9 Certificate Enrollment (09-certificates.test.ts)

**Requires**: `KSEF_TEST_E2E_FULL=1`, `KSEF_TEST_TOKEN`, `KSEF_TEST_NIP`

| # | Test case | API calls | Assertions |
|---|-----------|-----------|------------|
| 1 | Full certificate lifecycle | See flow below | Enroll → poll → retrieve → revoke |
| 2 | Get certificate limits | `certificates.getLimits()` | `canRequest === true` |

**Certificate lifecycle flow** (test 1):

```
 1. Authenticate → accessToken
 2. Grant CREDENTIALSMANAGE permission to a delegate (random NIP)
    permissions.grantPersonPermissions(...)
    pollUntil(operationStatus, code === 200)
 3. Authenticate as delegate in context → delegateAccessToken
 4. certificates.getLimits()
        assert: canRequest === true
 5. certificates.getEnrollmentData()
        assert: organizationIdentifier present
 6. Generate CSR with RSA: CryptographyService.generateCsr(enrollmentData)
 7. certificates.enroll(request)
        request: validFrom, csr (base64), certificateName, certificateType=AUTHENTICATION
        → { referenceNumber }
 8. pollUntil(certificates.getEnrollmentStatus, status.code === 200)
        → { certificateSerialNumber }
 9. certificates.retrieve({ serialNumbers: [serialNumber] })
        assert: 1 certificate returned
10. certificates.revoke(serialNumber, { reason: 'KeyCompromise' })
11. certificates.query({}, pageSize=10)
        assert: serial number in results
```

> **Ref**: Java — `CertificateIntegrationTest.java`. Full lifecycle: grant credential → enroll CSR → poll → retrieve → revoke → query metadata.
> C# — `E2E/Certificates/`.

---

### 2.10 Limits (10-limits.test.ts)

**Requires**: `KSEF_TEST_TOKEN`, `KSEF_TEST_NIP`

| # | Test case | API calls | Assertions |
|---|-----------|-----------|------------|
| 1 | Get context limits | `limits.getContextLimits()` | Returns limits object with numeric fields |
| 2 | Get subject limits | `limits.getSubjectLimits()` | Returns limits object |
| 3 | Get rate limits | `limits.getRateLimits()` | Returns rate limit config |

> **Ref**: Java — `GetRateLimitIntegrationTest.java`, `ContextLimitIntegrationTest.java`, `SubjectLimitIntegrationTest.java`.

---

### 2.11 Active Sessions (11-active-sessions.test.ts)

**Requires**: `KSEF_TEST_E2E_FULL=1`, `KSEF_TEST_TOKEN`, `KSEF_TEST_NIP`

| # | Test case | API calls | Assertions |
|---|-----------|-----------|------------|
| 1 | List active sessions | Auth → open session → `activeSessions.getActiveSessions()` | At least 1 session, `isCurrent` flag present |
| 2 | Revoke current session | `activeSessions.revokeCurrentSession()` → `getActiveSessions()` | Session removed from list |
| 3 | Revoke by reference | Auth twice → open 2 sessions → `revokeSession(ref)` | Second session revoked, first still active |
| 4 | Refresh after revoke fails | Revoke session → `auth.refreshAccessToken(refreshToken)` | Throws `KSeFApiError` (code 21301) |

> **Ref**: Java — `SessionIntegrationTest.java`. Tests: create+search+revoke current, create second+revoke by ref, search by statuses.
> Key assertion: after revoke, `refreshAccessToken()` throws exception with code 21301 ("Status uwierzytelnienia (425) nie pozwala na odświeżenie tokenu dostępowego").

---

### 2.12 TestData API (12-test-data.test.ts)

**Requires**: `KSEF_TEST_E2E_FULL=1`, `KSEF_TEST_TOKEN`, `KSEF_TEST_NIP`. Only works on TEST environment.

| # | Test case | API calls | Assertions |
|---|-----------|-----------|------------|
| 1 | Create + remove subject | `testData.createSubject(req)` → `testData.removeSubject(req)` | Both return void (no error) |
| 2 | Create + remove person | `testData.createPerson(req)` → `testData.removePerson(req)` | Both return void |
| 3 | Grant + revoke test permissions | `testData.grantPermissions(req)` → `testData.revokePermissions(req)` | Both return void |
| 4 | Enable + disable attachment | `testData.enableAttachment(req)` → `testData.disableAttachment(req)` | Both return void |
| 5 | Change + restore session limits | `testData.changeSessionLimits(req)` → `testData.restoreDefaultSessionLimits()` | Both return void |
| 6 | Change + restore cert limits | `testData.changeCertificatesLimit(req)` → `testData.restoreDefaultCertificatesLimit()` | Both return void |
| 7 | Set + restore rate limits | `testData.setRateLimits(req)` → `testData.restoreDefaultRateLimits()` | Both return void |
| 8 | Block + unblock context | `testData.blockContext(req)` → `testData.unblockContext(req)` | Both return void |

> **Ref**: Java uses TestData API extensively in setup of permission tests (e.g., `addAttachmentPermissionTest` in `QueryInvoiceIntegrationTest`).
> C# has `E2E/TestData/` tests.

---

### 2.13 Peppol (13-peppol.test.ts)

**Requires**: `KSEF_TEST_TOKEN`, `KSEF_TEST_NIP`

| # | Test case | API calls | Assertions |
|---|-----------|-----------|------------|
| 1 | Query Peppol providers | `peppol.queryProviders()` | Returns paginated list |

> **Ref**: Java — `PeppolInvoiceIntegrationTest.java` (includes Peppol provider auth and PEF invoice sending).

---

## 3. Session Status Queries (cross-cutting)

The `SessionStatusService` methods are exercised within the online/batch session tests above. Explicit coverage map:

| Method | Covered in test |
|--------|----------------|
| `getSessions(type, ...)` | 11-active-sessions (search by status) |
| `getSessionStatus(ref)` | 04-session-online, 05-session-batch (polling) |
| `getSessionInvoices(ref, ...)` | 04-session-online, 05-session-batch |
| `getSessionInvoice(ref, invoiceRef)` | 06-invoices (permanentStorageDate check) |
| `getSessionFailedInvoices(ref, ...)` | 04-session-online (negative test) |
| `getInvoiceUpoByKsefNumber(...)` | 04-session-online, 05-session-batch |
| `getInvoiceUpoByReference(...)` | 04-session-online |
| `getSessionUpo(ref, upoRef)` | 04-session-online, 05-session-batch |

---

## 4. Error & Edge Case Tests

Embedded within respective test files or as dedicated `describe` blocks.

| Category | Test | Expected behavior | Test file |
|----------|------|-------------------|-----------|
| **Rate limit** | Trigger 429 via rapid requests | `KSeFRateLimitError` thrown, auto-retry in `RestClient` | 10-limits |
| **Expired token** | Use stale token | `KSeFUnauthorizedError` (401) | 02-auth-token |
| **Wrong NIP in invoice** | Send invoice with NIP != context | Session status 445, `failedInvoiceCount >= 1` | 04-session-online |
| **Invalid page size** | `queryInvoiceMetadata(pageSize=5)` | `KSeFApiError` code 400, exceptionCode 21405 | 06-invoices |
| **Invalid batch key** | Corrupt `encryptedSymmetricKey` | Session status 415 | 05-session-batch |
| **Corrupted batch data** | Flip byte in encrypted part | Session status 405 | 05-session-batch |
| **Missing batch parts** | Declare 2 parts, send 1 | Exception at close, code 21205 | 05-session-batch |

> **Ref**: Java has extensive negative tests in `BatchIntegrationTest.java` (7 negative cases) and `EnforcementOperationNegativeIntegrationTest.java`.

---

## 5. CI Configuration

### 5.1 GitHub Actions Workflow

```yaml
# .github/workflows/e2e.yml
name: E2E Tests
on:
  workflow_dispatch:
  schedule:
    - cron: "0 3 * * *"          # Daily at 03:00 UTC
  push:
    branches: [main]

jobs:
  e2e-test:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    env:
      KSEF_TEST_NIP: ${{ secrets.KSEF_TEST_NIP }}
      KSEF_TEST_TOKEN: ${{ secrets.KSEF_TEST_TOKEN }}
      KSEF_TEST_E2E_FULL: "1"
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: corepack enable && yarn install
      - run: yarn build
      - run: yarn test:e2e
```

> **Ref**: TS-npm has 4 CI jobs (TEST×token, TEST×xades, DEMO×token, DEMO×xades) + failure notification via GitHub issues. See `ref/ksef-client-typescript/.github/workflows/e2e-token.yml`.

### 5.2 Secret Management

| Secret | Description |
|--------|-------------|
| `KSEF_TEST_NIP` | 10-digit test NIP |
| `KSEF_TEST_TOKEN` | API token for TEST env |
| `KSEF_TEST_CERT_PEM_B64` | Base64-encoded certificate PEM (optional, for XAdES) |
| `KSEF_TEST_KEY_PEM_B64` | Base64-encoded private key PEM (optional) |

---

## 6. Implementation Priority

### Phase 1 — Foundation + Lightweight Tests

1. **Helpers**: `env.ts`, `polling.ts`, `identifiers.ts`, `auth.ts`, `invoices.ts`
2. **Fixtures**: `invoice-fa2.xml`, `invoice-fa3.xml`
3. **01-lighthouse.test.ts** — no auth, validates connectivity
4. **02-auth-token.test.ts** — token auth flow
5. **03-auth-xades.test.ts** — certificate auth flow (extends existing `cert-auth.test.ts`)

### Phase 2 — Core E2E Workflows

6. **04-session-online.test.ts** — full online session flow (most critical)
7. **06-invoices.test.ts** — query + export
8. **07-permissions.test.ts** — grant/query/revoke cycle

### Phase 3 — Extended Coverage

9. **05-session-batch.test.ts** — batch upload + negative tests
10. **08-tokens.test.ts** — token lifecycle
11. **09-certificates.test.ts** — certificate enrollment
12. **10-limits.test.ts** — limits queries
13. **11-active-sessions.test.ts** — session management
14. **12-test-data.test.ts** — test data API
15. **13-peppol.test.ts** — Peppol providers

### Phase 4 — CI & Hardening

16. GitHub Actions workflow
17. Negative / error tests within each suite
18. Daily scheduled runs + failure alerts

---

## 7. Reference File Index

Quick lookup for specific patterns in reference implementations:

| Pattern | Java | C# | TS-npm | TS-lkow |
|---------|------|----|--------|---------|
| **Base test setup** | `configuration/BaseIntegrationTest.java` | `E2E/TestBase.cs` | (inline in each test) | (inline) |
| **Auth helper** | `BaseIntegrationTest.authWithCustomNip()` | `AuthenticationUtils.cs` | `xades-auth.test.js` | `api2-demo.test.ts` |
| **Polling utility** | Awaitility lib | `AsyncPollingUtils.cs` | built-in workflow methods | (manual) |
| **Random NIP/PESEL** | `IdentifierGeneratorUtils` | `MiscellaneousUtils.cs` | (not used — fixed creds) | (not used) |
| **Invoice template** | `resources/xml/invoices/` | `Templates/` | external sample file | `examples/sample-invoice.xml` |
| **Online session** | `OnlineSessionIntegrationTest.java` | `OnlineSession/OnlineSessionE2ETests.cs` | `sessions.test.js` | `api2-demo.test.ts` |
| **Batch session** | `BatchIntegrationTest.java` | `BatchSession/BatchSessionE2ETests.cs` | `sessions.test.js` | `examples/06-batch-session.ts` |
| **Invoice export** | `QueryInvoiceIntegrationTest.java` | `Invoice/InvoiceE2ETests.cs` | `export.test.js` | (not implemented) |
| **Permissions** | `EntityPermissionIntegrationTest.java` + 10 others | `Permissions/PersonPermission/` + 5 others | (not tested) | `examples/02-permissions.ts` |
| **Certificate lifecycle** | `CertificateIntegrationTest.java` | `Certificates/` | (not tested) | (not implemented) |
| **Token lifecycle** | `KsefTokenIntegrationTest.java` | (not found) | (not tested) | `examples/05-token-management.ts` |
| **Session management** | `SessionIntegrationTest.java` | `Sessions/` | (not tested) | (not implemented) |
| **Batch negative tests** | `BatchIntegrationTest.java` (7 cases) | (not found) | (not tested) | (not implemented) |
| **CI workflow** | Gradle `integrationTest` task | `dotnet test` | `.github/workflows/e2e-token.yml` | (not implemented) |

---

## 8. Key Status Codes Reference

From KSeF API, used in assertions:

| Code | Meaning | Context |
|------|---------|---------|
| 100 | In progress / session opened | Auth status, online session |
| 150 | Batch processing | Batch session status |
| 200 | Success / completed | All operations |
| 405 | Part verification error | Batch — hash mismatch |
| 415 | Key decryption error | Batch — corrupted RSA key |
| 420 | Invoice limit exceeded | Batch — >10,000 invoices |
| 425 | Auth status prevents refresh | After session revoke |
| 430 | Archive decompression error | Batch — wrong IV |
| 440 | Session cancelled | Session status |
| 445 | Validation error (no valid invoices) | Session — wrong NIP |

---

## 9. Timeout Guidelines

| Operation | Interval | Max attempts | Total max |
|-----------|----------|-------------|-----------|
| Auth status polling | 1s | 120 | 2 min |
| Invoice processing | 5s | 30 | 2.5 min |
| Batch processing | 2s | 60 | 2 min |
| Export completion | 2s | 120 | 4 min |
| Permission operation | 2s | 30 | 1 min |
| Certificate enrollment | 2s | 30 | 1 min |
| Vitest per-test timeout | — | — | 120s (default), 300s (batch/export) |

> Derived from Java (Awaitility timings), C# (PollAsync params), and TS-npm (maxAttempts configs).
