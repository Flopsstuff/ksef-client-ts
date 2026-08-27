# Workflows

Workflows are high-level orchestration functions that combine multiple service calls, encryption, polling, and parsing into single, composable operations. They eliminate boilerplate and encode the correct sequencing of KSeF API interactions.

---

## When to use workflows vs low-level API

| Use workflows when | Use low-level API when |
|---|---|
| Standard login → send → close → UPO flow | Custom flow that doesn't fit a workflow |
| You don't need fine-grained control over each step | You need to inspect intermediate responses |
| You want automatic crypto init, encryption, and hash computation | You manage encryption keys externally |
| You want built-in polling with progress callbacks | You have custom polling logic or websocket-based status |

Workflows accept a `KSeFClient` instance as the first argument — they don't create their own client. This means you configure retry, rate limiting, and auth once on the client, and all workflows inherit that behavior.

---

## Files

All source files are in `src/workflows/`:

| File | Role |
|------|------|
| `types.ts` | Shared interfaces: `PollOptions`, `OnlineSessionHandle`, `UpoInfo`, `ParsedUpoInfo`, `BatchUploadResult`, `ExportResult`, `ExportDownloadResult`, `ExportExtractedResult` |
| `polling.ts` | Generic `pollUntil()` utility used by all workflows |
| `auth-workflow.ts` | Authentication workflows: token, certificate, PKCS#12 |
| `online-session-workflow.ts` | Online session: open, send invoices, close, poll UPO |
| `batch-session-workflow.ts` | Batch session: split ZIP, encrypt parts, upload, poll UPO |
| `invoice-export-workflow.ts` | Invoice export: initiate, poll, download, decrypt, extract |
| `incremental-export-workflow.ts` | Incremental export with high-water mark (HWM) tracking |
| `hwm-coordinator.ts` | Continuation point logic for incremental export |
| `hwm-storage.ts` | `HwmStore` interface + `InMemoryHwmStore` / `FileHwmStore` |
| `offline-invoice-workflow.ts` | Offline invoice lifecycle: generate, submit, technical correction |
| `index.ts` | Barrel re-exports for all workflows, types, and HWM utilities |

Supporting files outside `src/workflows/`:

| File | Role |
|------|------|
| `src/builders/batch-file.ts` | `BatchFileBuilder` — ZIP splitting, encryption, SHA-256 hashing |
| `src/xml/upo-parser.ts` | `parseUpoXml()` — UPO XML to typed `UpoPotwierdzenie` objects |
| `src/utils/zip.ts` | `unzip()` with ZIP bomb protection, `createZip()` for tests |

---

## Polling

**File:** `src/workflows/polling.ts`

All workflows that wait for async operations use the same `pollUntil()` utility:

```typescript
async function pollUntil<T>(
  action: () => Promise<T>,       // called each attempt
  condition: (result: T) => boolean, // stop when true
  options?: PollOptions,
): Promise<T>
```

### PollOptions

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `intervalMs` | `number` | `2000` | Milliseconds between polling attempts |
| `maxAttempts` | `number` | `60` | Maximum number of attempts before timeout |
| `onProgress` | `(attempt, maxAttempts) => void` | — | Callback after each non-final attempt |

**Default behavior:** poll every 2 seconds for up to 60 attempts = 2 minutes max wait. Throws `Error` with message `Polling timeout: {description} after {N} attempts` on timeout.

### How workflows use polling

Each workflow polls for a session or export status code:

```typescript
// Typical usage inside a workflow
const result = await pollUntil(
  () => client.sessionStatus.getSessionStatus(sessionRef),
  (s) => s.status.code === 200 || s.status.code >= 400,
  { ...options.pollOptions, description: `UPO for session ${sessionRef}` },
);
if (result.status.code !== 200) {
  throw new Error(`Session failed: ${result.status.code} — ${result.status.description}`);
}
```

- **Code 100**: still processing (keep polling)
- **Code 200**: completed successfully
- **Code >= 400**: failed (stop polling, throw error)

---

## Authentication Workflows

**File:** `src/workflows/auth-workflow.ts`

Three functions that handle the complete authentication ceremony: challenge, crypto, submission, polling, and token storage.

### authenticateWithToken

```
getChallenge() → crypto.init() → encryptKsefToken() → submitKsefTokenAuthRequest()
     → pollUntil(getAuthStatus, code !== 100) → getAccessToken()
     → authManager.setAccessToken() + setRefreshToken()
```

```typescript
import { authenticateWithToken } from 'ksef-client-ts';

const result = await authenticateWithToken(client, {
  nip: '1234567890',
  token: 'your-ksef-token',
  authorizationPolicy: 'GeneralAccess',  // optional
  pollOptions: { intervalMs: 1000 },      // optional
});
// result: { accessToken, accessTokenValidUntil, refreshToken, refreshTokenValidUntil }
```

Internally:

1. `getChallenge()` → receives a challenge string and timestamp
2. `crypto.init()` → fetches and caches KSeF public certificates
3. `encryptKsefToken(token, timestamp)` → encrypts the token with KSeF RSA-OAEP or ECDH+AES-GCM (auto-detected)
4. `submitKsefTokenAuthRequest()` → submits the encrypted token with challenge and NIP
5. `pollUntil(getAuthStatus, ...)` → waits until processing code is no longer 100
6. `getAccessToken()` → redeems the auth token for session tokens
7. Stores both tokens in `authManager`

### authenticateWithCertificate

```
getChallenge() → buildAuthTokenRequestXml() → SignatureService.sign()
     → submitXadesAuthRequest() → pollUntil(getAuthStatus) → getAccessToken()
     → authManager.setAccessToken() + setRefreshToken()
```

```typescript
import { authenticateWithCertificate } from 'ksef-client-ts';

const result = await authenticateWithCertificate(client, {
  nip: '1234567890',
  certPem: fs.readFileSync('cert.pem', 'utf-8'),
  keyPem: fs.readFileSync('key.pem', 'utf-8'),
  verifyCertificateChain: false,   // optional
  enforceXadesCompliance: false,   // optional
});
```

`SignatureService` and `buildAuthTokenRequestXml` are dynamically imported (`await import(...)`) to avoid loading `xml-crypto` when only using token auth.

### authenticateWithPkcs12

```
Pkcs12Loader.load(p12, password) → authenticateWithCertificate(certPem, keyPem)
```

```typescript
import { authenticateWithPkcs12 } from 'ksef-client-ts';

const result = await authenticateWithPkcs12(client, {
  nip: '1234567890',
  p12: fs.readFileSync('certificate.p12'),
  password: 'secret',
});
```

Delegates to `authenticateWithCertificate` after extracting the cert and key from the PKCS#12 container via `Pkcs12Loader` (`src/crypto/pkcs12-loader.ts`).

### AuthResult

All three functions return the same `AuthResult` and store tokens in `client.authManager`:

```typescript
interface AuthResult {
  accessToken: string;
  accessTokenValidUntil: string;   // ISO 8601
  refreshToken: string;
  refreshTokenValidUntil: string;  // ISO 8601
}
```

---

## Online Session Workflow

**File:** `src/workflows/online-session-workflow.ts`

For sending individual invoices interactively. Returns a session handle with methods for sending, closing, and waiting for UPO.

### openOnlineSession

```
crypto.init() → getEncryptionData() → onlineSession.openSession()
     → return OnlineSessionHandle { sendInvoice, close, waitForUpo, waitForUpoParsed }
```

```typescript
import { openOnlineSession } from 'ksef-client-ts';

const handle = await openOnlineSession(client, {
  formCode: { systemCode: 'FA', schemaVersion: '3', value: 'FA (3)' }, // optional, this is the default
  upoVersion: 'upo-v4-3',  // optional
});

console.log(`Session ${handle.sessionRef}, valid until ${handle.validUntil}`);
```

### OnlineSessionHandle

The returned handle encapsulates the session reference and encryption keys. All crypto operations (hashing, encrypting, metadata computation) are done internally.

```typescript
interface OnlineSessionHandle {
  readonly sessionRef: string;
  readonly validUntil: string;
  sendInvoice(invoiceXml: string | Uint8Array): Promise<string>;   // returns invoice reference
  close(): Promise<void>;
  waitForUpo(options?: PollOptions): Promise<UpoInfo>;
  waitForUpoParsed(options?: PollOptions): Promise<ParsedUpoInfo>;
}
```

#### sendInvoice

Accepts raw invoice XML (string or `Uint8Array`). Internally:

1. Encode to `Uint8Array` (if string)
2. Compute `getFileMetadata(plaintext)` → `{ hashSHA, fileSize }`
3. `encryptAES256(plaintext, cipherKey, cipherIv)` → encrypted bytes
4. Compute `getFileMetadata(encrypted)` → `{ hashSHA, fileSize }`
5. Base64-encode the encrypted content
6. Call `onlineSession.sendInvoice(sessionRef, request)`

```typescript
const ref1 = await handle.sendInvoice('<Invoice>...</Invoice>');
const ref2 = await handle.sendInvoice(xmlBuffer);
```

#### close

Closes the session. Always call this — preferably in a `try/finally` block — to avoid orphan sessions.

#### waitForUpo

Polls `sessionStatus.getSessionStatus()` until code 200 (success) or >= 400 (failure). Returns:

```typescript
interface UpoInfo {
  pages: Array<{ referenceNumber: string; downloadUrl: string }>;
  invoiceCount?: number;
  successfulInvoiceCount?: number;
  failedInvoiceCount?: number;
}
```

#### waitForUpoParsed

Same as `waitForUpo`, but additionally downloads and parses each UPO page XML into typed `UpoPotwierdzenie` objects (see [UPO Parsing](#upo-parsing) below).

```typescript
interface ParsedUpoInfo extends UpoInfo {
  parsed: UpoPotwierdzenie[];
}
```

### openSendAndClose

All-in-one convenience: open → send all invoices → close → poll UPO.

```typescript
import { openSendAndClose } from 'ksef-client-ts';

const upo = await openSendAndClose(client, [invoiceXml1, invoiceXml2], {
  formCode: { systemCode: 'FA', schemaVersion: '3', value: 'FA (3)' },
  pollOptions: { intervalMs: 3000, maxAttempts: 40 },
});
```

Signature: `openSendAndClose(client, invoices: Array<string | Uint8Array>, options?)`.

The invoices are sent sequentially within the same session. If any send fails, the error propagates immediately (the session remains open — you may want to handle cleanup).

---

## Batch Session Workflow

**File:** `src/workflows/batch-session-workflow.ts`

For uploading a ZIP file containing multiple invoices. Automatically handles ZIP splitting, encryption, part upload, and UPO polling.

### uploadBatch

```
crypto.init() → getEncryptionData() → BatchFileBuilder.build(zip, encryptFn)
     → batchSession.openSession() → batchSession.sendParts() → batchSession.closeSession()
     → pollUntil(getSessionStatus) → return BatchUploadResult
```

```typescript
import { uploadBatch } from 'ksef-client-ts';

const result = await uploadBatch(client, zipData, {
  formCode: { systemCode: 'FA', schemaVersion: '3', value: 'FA (3)' },
  maxPartSize: 50_000_000,  // 50 MB parts instead of default 100 MB
  offlineMode: false,
  pollOptions: { intervalMs: 5000, maxAttempts: 120 },
});
console.log(`Batch ${result.sessionRef}: ${result.upo.invoiceCount} invoices`);
```

### How auto-split works

`BatchFileBuilder.build()` (`src/builders/batch-file.ts`) handles the split:

```
Input: raw ZIP (Uint8Array)
  │
  ├── Validate: non-empty, <= 5 GB
  │
  ├── Split into parts of maxPartSize (default 100 MB)
  │     └── Validate: <= 50 parts
  │
  ├── Compute SHA-256 of original ZIP → zipHash
  │
  ├── For each part:
  │     ├── encryptFn(part) → encrypted bytes
  │     └── Compute SHA-256 of encrypted part → fileHash
  │
  └── Return { batchFile: BatchFileInfo, encryptedParts: Uint8Array[] }
```

**Limits:**

| Constant | Value | File |
|----------|-------|------|
| `BATCH_MAX_PART_SIZE` | 100 MB | `src/builders/batch-file.ts` |
| `BATCH_MAX_TOTAL_SIZE` | 5 GB | `src/builders/batch-file.ts` |
| `BATCH_MAX_PARTS` | 50 | `src/builders/batch-file.ts` |

**Two types of hashes:**

- `batchFile.fileHash` — SHA-256 of the **original unencrypted ZIP** (sent in `OpenBatchSessionRequest` so KSeF can verify integrity after decryption)
- `fileParts[i].fileHash` — SHA-256 of the **encrypted part** (sent alongside each part so KSeF can verify upload integrity)

### uploadBatchParsed

Same as `uploadBatch`, but additionally downloads and parses each UPO page:

```typescript
import { uploadBatchParsed } from 'ksef-client-ts';

const result = await uploadBatchParsed(client, zipData);
for (const upo of result.upo.parsed) {
  for (const doc of upo.dokumenty) {
    console.log(`${doc.numerKSeFDokumentu} — ${doc.numerFaktury}`);
  }
}
```

---

## Invoice Export Workflow

**File:** `src/workflows/invoice-export-workflow.ts`

For downloading invoices from KSeF. Supports metadata-only exports, encrypted download with decryption, and ZIP extraction.

### exportInvoices

Initiates an export and polls until ready. Returns part metadata without downloading.

```
crypto.init() → getEncryptionData() → invoices.exportInvoices()
     → pollUntil(getInvoiceExportStatus) → return ExportResult
```

```typescript
import { exportInvoices } from 'ksef-client-ts';

const result = await exportInvoices(client, filters, {
  onlyMetadata: true,  // export _metadata.json only, no invoice XML
});
console.log(`${result.invoiceCount} invoices, truncated: ${result.isTruncated}`);
```

### ExportResult

```typescript
interface ExportResult {
  parts: Array<{
    ordinalNumber: number;
    url: string;             // presigned download URL
    method: string;          // HTTP method for download (usually 'GET')
    partSize: number;
    encryptedPartSize: number;
    encryptedPartHash: string;
    expirationDate: string;  // URL expiration
  }>;
  invoiceCount: number;
  isTruncated: boolean;            // true if more invoices exist beyond this export
  permanentStorageHwmDate?: string; // used by incremental export
  lastPermanentStorageDate?: string;
  compressionType: CompressionType; // 'Zip' | 'TarGz' — how to unpack the parts
}
```

### exportAndDownload

Initiates export, polls, downloads all parts, and decrypts them with AES-256-CBC.

```typescript
import { exportAndDownload } from 'ksef-client-ts';

// Download and get raw decrypted parts
const result = await exportAndDownload(client, filters, {
  transport: customFetch,  // optional custom fetch for downloads
});
// result.decryptedParts: Uint8Array[]

// Download and extract ZIP into named files
const extracted = await exportAndDownload(client, filters, {
  extract: true,
  unzipOptions: { maxFiles: 5000 },
});
// extracted.files: Map<string, Buffer>  (filename → content)
```

The function has two overloads:

- `extract: true` → returns `ExportExtractedResult` with `files: Map<string, Buffer>`
- Default (no extract / `extract: false`) → returns `ExportDownloadResult` with `decryptedParts: Uint8Array[]`

#### Which extractor runs

`extract: true` unpacks the archive using the format the export package reports, so it always matches what the server actually produced — a TarGz package is untarred even when the request asked for nothing. `compressionType` in the options only *requests* a format for the export itself; it is consulted for extraction solely as a fallback, for responses from a KSeF build predating the reported field (KSeF API v2.7.1). Callers therefore no longer have to pass back the same `compressionType` they exported with.

### ZIP bomb protection

When `extract: true`, the decrypted ZIP is passed to `unzip()` (`src/utils/zip.ts`) which enforces safety limits:

| Limit | Default | Description |
|-------|---------|-------------|
| `maxFiles` | 10,000 | Maximum number of files in the ZIP |
| `maxTotalUncompressedSize` | 2 GB | Total uncompressed size of all files |
| `maxFileUncompressedSize` | 500 MB | Maximum size of a single file |
| `maxCompressionRatio` | 200:1 | Maximum compression ratio (null to disable) |

Additionally, entries with `compressedSize === 0` but `uncompressedSize > 0` are rejected as suspicious metadata.

Override defaults via `unzipOptions`:

```typescript
const result = await exportAndDownload(client, filters, {
  extract: true,
  unzipOptions: {
    maxFiles: 50_000,
    maxCompressionRatio: null,  // disable ratio check
  },
});
```

---

## Incremental Export (HWM)

**File:** `src/workflows/incremental-export-workflow.ts`

For continuous invoice synchronization. Tracks a high-water mark (HWM) so each export starts where the previous one left off, avoiding re-downloading already-processed invoices.

### How it works

```
                      ┌─────────────────────────────────────┐
                      │    Incremental Export Loop           │
                      │                                     │
Load HWM store ──────►│  iteration 0..maxIterations:        │
                      │    effectiveFrom = HWM or windowFrom│
                      │    doExport(effectiveFrom..windowTo) │
                      │    download + decrypt parts          │
                      │    update continuation point         │
                      │    save to HWM store                 │
                      │    if !isTruncated → break           │
                      │    if effectiveFrom unchanged → break│
                      └─────────────────────────────────────┘
```

The KSeF export API has a limit on how many invoices it returns per export. If the result is truncated (`isTruncated: true`), the response includes `lastPermanentStorageDate` — the timestamp of the last invoice in the batch. The next iteration uses this as the new start date, effectively "paging" through the full dataset.

### incrementalExportAndDownload

```typescript
import {
  incrementalExportAndDownload,
} from 'ksef-client-ts';
import { FileHwmStore } from 'ksef-client-ts/node';

const result = await incrementalExportAndDownload(client, {
  subjectType: 'Subject1',
  windowFrom: '2025-01-01T00:00:00',
  windowTo: '2025-12-31T23:59:59',
  continuationPoints: {},              // or pass previously saved points
  store: new FileHwmStore('./hwm.json'), // optional persistence
  maxIterations: 20,                   // safety limit (default: 20)
  onIterationComplete: (i, result) => {
    console.log(`Iteration ${i}: ${result.invoiceCount} invoices, truncated: ${result.isTruncated}`);
  },
});

console.log(`Completed in ${result.iterationCount} iterations`);
console.log(`Downloaded ${result.decryptedParts.length} parts`);
```

### IncrementalExportOptions

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `subjectType` | `InvoiceSubjectType` | required | `'Subject1'` (seller), `'Subject2'` (buyer), etc. |
| `windowFrom` | `string` | required | ISO 8601 start of the export window |
| `windowTo` | `string` | required | ISO 8601 end of the export window |
| `continuationPoints` | `ContinuationPoints` | required | `Record<string, string \| undefined>` — subject type → last processed date |
| `maxIterations` | `number` | `20` | Maximum number of export iterations (prevents infinite loops) |
| `filtersFactory` | `(from, to) => InvoiceQueryFilters` | — | Custom filter builder; default uses `PermanentStorage` date type |
| `store` | `HwmStore` | — | Optional persistent storage for continuation points |
| `onIterationComplete` | `(iteration, result) => void` | — | Progress callback after each iteration |
| `pollOptions` | `PollOptions` | — | Polling configuration for each export |
| `onlyMetadata` | `boolean` | — | Export metadata only |
| `transport` | `typeof fetch` | — | Custom fetch for downloads |

### Loop termination

The loop stops when any of these is true:

1. `!result.isTruncated` — all data retrieved within the window
2. `effectiveFrom === previousFrom` — continuation point didn't advance (no new data)
3. `iteration >= maxIterations` — safety limit reached

### HWM Coordinator

**File:** `src/workflows/hwm-coordinator.ts`

Pure functions for managing continuation points:

```typescript
type ContinuationPoints = Record<string, string | undefined>;

// After each export iteration, update the point for a subject type
updateContinuationPoint(points, subjectType, exportPackage);

// Get effective start date: saved HWM or fallback to windowFrom
getEffectiveStartDate(points, subjectType, windowFrom);

// Utility for deduplicating invoice metadata by KSeF number
deduplicateByKsefNumber(entries);
```

`updateContinuationPoint` logic:

- If truncated: save `lastPermanentStorageDate` (the date of the last invoice in the batch)
- If not truncated: save `permanentStorageHwmDate` (the server-reported high-water mark)
- If neither date is available: delete the point (reset to window start)

### HWM Storage

**File:** `src/workflows/hwm-storage.ts`

```typescript
interface HwmStore {
  load(): Promise<ContinuationPoints>;
  save(points: ContinuationPoints): Promise<void>;
}
```

Two built-in implementations:

| Class | Storage | Use case |
|-------|---------|----------|
| `InMemoryHwmStore` | In-process memory | Tests, one-off exports, non-Node environments |
| `FileHwmStore` | JSON file on disk | Persistent synchronization, cron jobs (Node.js only) |

`FileHwmStore` gracefully handles missing files (returns `{}` on `ENOENT`).

Implement `HwmStore` for custom backends (database, Redis, S3):

```typescript
class RedisHwmStore implements HwmStore {
  async load() { return JSON.parse(await redis.get('hwm') ?? '{}'); }
  async save(points) { await redis.set('hwm', JSON.stringify(points)); }
}
```

---

## UPO Parsing

**File:** `src/xml/upo-parser.ts`

UPO (Urzedowe Poswiadczenie Odbioru) is the official receipt issued by KSeF after processing invoices. The raw response is XML. `parseUpoXml()` converts it into typed TypeScript objects.

### parseUpoXml

```typescript
import { parseUpoXml } from 'ksef-client-ts';

const upo: UpoPotwierdzenie = parseUpoXml(xmlString);
```

Uses `fast-xml-parser` with namespace prefix removal. Throws `KSeFValidationError` on missing or malformed fields.

### UpoPotwierdzenie

```typescript
interface UpoPotwierdzenie {
  nazwaPodmiotuPrzyjmujacego: string;   // receiving entity name
  numerReferencyjnySesji: string;       // session reference number
  uwierzytelnienie: UpoUwierzytelnienie; // auth context + proof
  opisPotwierdzenia?: UpoOpisPotwierdzenia; // pagination info (page, total pages, doc range)
  nazwaStrukturyLogicznej: string;      // logical structure name
  kodFormularza: string;                // form code (e.g., 'FA')
  dokumenty: UpoDokument[];             // list of processed invoices
}
```

### UpoDokument

Each invoice in the UPO has:

```typescript
interface UpoDokument {
  nipSprzedawcy: string;          // seller NIP
  numerKSeFDokumentu: string;     // KSeF number assigned to this invoice
  numerFaktury: string;           // original invoice number
  dataWystawieniaFaktury: string; // invoice issue date
  dataPrzeslaniaDokumentu: string; // document submission date
  dataNadaniaNumeruKSeF: string;  // KSeF number assignment date
  skrotDokumentu: string;         // document hash (SHA-256)
  trybWysylki: string;            // submission mode
}
```

### Context identifiers (discriminated union)

The UPO identifies the authenticated entity with one of four context types:

```typescript
type UpoContextId =
  | { kind: 'Nip'; nip: string }
  | { kind: 'IdWewnetrzny'; idWewnetrzny: string }
  | { kind: 'IdZlozonyVatUE'; idZlozonyVatUE: string }
  | { kind: 'IdDostawcyUslugPeppol'; idDostawcyUslugPeppol: string };
```

And the authentication proof is either a token reference or document hash:

```typescript
type UpoAuthProof =
  | { kind: 'NumerReferencyjnyTokenaKSeF'; numerReferencyjnyTokenaKSeF: string }
  | { kind: 'SkrotDokumentuUwierzytelniajacego'; skrotDokumentuUwierzytelniajacego: string };
```

### Usage in workflows

`waitForUpoParsed()` and `uploadBatchParsed()` call `parseUpoXml()` automatically:

```typescript
const handle = await openOnlineSession(client);
await handle.sendInvoice(invoiceXml);
await handle.close();

const result = await handle.waitForUpoParsed();
for (const upo of result.parsed) {
  for (const doc of upo.dokumenty) {
    console.log(`${doc.numerKSeFDokumentu}: ${doc.numerFaktury}`);
  }
}
```

---

## Decision Guide

### Which workflow to use

```
Need to send invoices?
  │
  ├── 1-10 invoices → openOnlineSession or openSendAndClose
  │     • Interactive session, one invoice at a time
  │     • Each invoice gets immediate reference number
  │     • Good for real-time integrations
  │
  └── 10+ invoices → uploadBatch or uploadBatchParsed
        • Pack invoices into a ZIP file
        • Auto-split into ≤100 MB encrypted parts
        • Single upload session, UPO after processing
        • Good for bulk/scheduled imports

KSeF unavailable or issuing offline?
  │
  └── client.offline → OfflineInvoiceWorkflow
        • Generate invoices locally with QR KOD I + KOD II
        • Store in ~/.ksef/offline/, track deadlines
        • Submit when KSeF comes back online
        • See Offline Mode docs for details

Need to download invoices?
  │
  ├── One-time export → exportInvoices or exportAndDownload
  │     • Export a date range, download parts
  │     • Use extract: true to get named files
  │
  └── Continuous sync → incrementalExportAndDownload
        • Tracks high-water mark across runs
        • Automatically pages through truncated results
        • Use FileHwmStore for persistence across restarts
```

### Typical full flow

```typescript
import {
  authenticateWithToken,
  openOnlineSession,
  exportAndDownload,
} from 'ksef-client-ts';

const client = new KSeFClient({ environment: 'PROD' });

// 1. Authenticate
await authenticateWithToken(client, { nip: '...', token: '...' });

// 2. Send invoices
const handle = await openOnlineSession(client);
try {
  for (const xml of invoiceXmls) {
    await handle.sendInvoice(xml);
  }
  await handle.close();
} catch (err) {
  await handle.close().catch(() => {});
  throw err;
}

// 3. Get results
const upo = await handle.waitForUpoParsed();
for (const doc of upo.parsed.flatMap(p => p.dokumenty)) {
  console.log(`Sent: ${doc.numerFaktury} → ${doc.numerKSeFDokumentu}`);
}

// 4. Export received invoices
const result = await exportAndDownload(client, {
  subjectType: 'Subject2',
  dateRange: { dateType: 'PermanentStorage', from: '...', to: '...' },
}, { extract: true });

for (const [name, content] of result.files) {
  console.log(`Received: ${name} (${content.length} bytes)`);
}
```

---

## Error Handling

All workflows throw standard library errors:

| Error | Cause |
|-------|-------|
| `KSeFApiError` / `KSeFRateLimitError` / etc. | HTTP errors from underlying service calls (see [HTTP Resilience](./http-resilience.md)) |
| `KSeFValidationError` | Invalid input to `BatchFileBuilder` (empty ZIP, exceeds limits) or `parseUpoXml` (malformed XML) |
| `Error('Polling timeout: ...')` | `pollUntil` exceeded `maxAttempts` |
| `Error('Session failed: ...')` | Session status code >= 400 after polling |
| `Error('Export failed: ...')` | Export status code >= 400 after polling |
| `Error('Download failed for part N: HTTP ...')` | Presigned URL download returned non-2xx |
| `Error('zip contains too many files')`, etc. | ZIP bomb protection limits exceeded |

HTTP-level resilience (retries, rate limiting, auth refresh) is handled transparently by `RestClient` for all service calls made within workflows. Workflows don't implement their own retry logic — they rely on the [HTTP Resilience Layer](./http-resilience.md).
