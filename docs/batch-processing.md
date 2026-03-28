# Batch Processing & Auto-Split

Guide to uploading invoices in bulk via KSeF batch sessions. Covers the full pipeline: preparing a ZIP, automatic splitting, encryption, part upload, and UPO retrieval. Also covers PKCS#12 certificate loading for batch auth.

---

## Overview

Batch sessions are designed for high-volume invoice submission. Instead of sending invoices one-by-one (online session), you pack them into a ZIP file and upload it as a set of encrypted parts. KSeF processes the entire batch asynchronously and returns a UPO (official receipt) when done.

```
Your invoice XMLs
  │
  ▼
Pack into a ZIP file (your code or createZip utility)
  │
  ▼
uploadBatch(client, zipData, options)
  │
  ├── 1. crypto.init() + getEncryptionData()
  │      Generate AES-256 key + IV, wrap key with KSeF RSA cert
  │
  ├── 2. BatchFileBuilder.build(zip, encryptFn)
  │      ├── Validate ZIP (non-empty, ≤ 5 GB)
  │      ├── Split into parts (≤ 100 MB each, ≤ 50 parts)
  │      ├── SHA-256 hash of original ZIP
  │      ├── Encrypt each part with AES-256-CBC
  │      └── SHA-256 hash of each encrypted part
  │
  ├── 3. batchSession.openSession(batchFile, encryption, formCode)
  │      KSeF returns presigned upload URLs for each part
  │
  ├── 4. batchSession.sendParts(openResponse, parts)
  │      Upload all encrypted parts in parallel to presigned URLs
  │
  ├── 5. batchSession.closeSession(ref)
  │      Signal that all parts have been uploaded
  │
  └── 6. pollUntil(getSessionStatus, code === 200)
         Wait for KSeF to process the batch and return UPO
```

---

## Files

| File | Role |
|------|------|
| `src/builders/batch-file.ts` | `BatchFileBuilder` — ZIP splitting, encryption, SHA-256 hashing |
| `src/services/batch-session.ts` | `BatchSessionService` — API calls: open, sendParts, close |
| `src/workflows/batch-session-workflow.ts` | `uploadBatch` / `uploadBatchParsed` — end-to-end orchestration |
| `src/models/sessions/batch-types.ts` | Types: `BatchFileInfo`, `BatchFilePartInfo`, `OpenBatchSessionRequest/Response`, `BatchPartSendingInfo` |
| `src/models/common.ts` | Shared types: `EncryptionInfo`, `FileMetadata`, `FormCode` |
| `src/crypto/pkcs12-loader.ts` | `Pkcs12Loader` — extract cert + key from P12/PFX files |
| `src/utils/zip.ts` | `createZip()` — pack files into a ZIP buffer |
| `src/xml/upo-parser.ts` | `parseUpoXml()` — parse UPO XML from batch results |

---

## Quick Start

```typescript
import { KSeFClient, authenticateWithToken, uploadBatch } from 'ksef-client-ts';
import { createZip } from 'ksef-client-ts/utils/zip';

const client = new KSeFClient({ environment: 'TEST' });
await authenticateWithToken(client, { nip: '1234567890', token: 'your-token' });

// 1. Pack invoices into a ZIP
const zipData = await createZip([
  { fileName: 'invoice-001.xml', content: Buffer.from(invoiceXml1) },
  { fileName: 'invoice-002.xml', content: Buffer.from(invoiceXml2) },
]);

// 2. Upload the batch (auto-split, encrypt, upload, poll)
const result = await uploadBatch(client, zipData);
console.log(`Session: ${result.sessionRef}`);
console.log(`Invoices: ${result.upo.invoiceCount}`);
console.log(`Success: ${result.upo.successfulInvoiceCount}`);
console.log(`Failed: ${result.upo.failedInvoiceCount}`);
```

---

## Auto-Split

**File:** `src/builders/batch-file.ts`

KSeF limits individual upload parts. `BatchFileBuilder.build()` automatically splits the ZIP into parts, encrypts each one, and computes all required hashes.

### Limits

| Constant | Value | Description |
|----------|-------|-------------|
| `BATCH_MAX_PART_SIZE` | 100 MB (100,000,000 bytes) | Maximum size of a single unencrypted part |
| `BATCH_MAX_TOTAL_SIZE` | 5 GB (5,000,000,000 bytes) | Maximum total ZIP size |
| `BATCH_MAX_PARTS` | 50 | Maximum number of parts per batch session |

These are enforced by `BatchFileBuilder.build()` — it throws `KSeFValidationError` if any limit is exceeded. The part size is configurable via `maxPartSize`.

### Split algorithm

```typescript
// src/builders/batch-file.ts — splitBuffer()
function splitBuffer(data: Uint8Array, maxPartSize: number): Uint8Array[] {
  if (data.length <= maxPartSize) return [data];  // no split needed
  const parts: Uint8Array[] = [];
  for (let offset = 0; offset < data.length; offset += maxPartSize) {
    parts.push(data.subarray(offset, Math.min(offset + maxPartSize, data.length)));
  }
  return parts;
}
```

The split is byte-level — it doesn't care about ZIP structure. KSeF reassembles the parts in ordinal order and decrypts the concatenation as a single ZIP.

### Examples by ZIP size

| ZIP size | maxPartSize | Parts | Notes |
|----------|-------------|-------|-------|
| 50 MB | 100 MB (default) | 1 | No split needed |
| 250 MB | 100 MB | 3 | Parts: 100 + 100 + 50 MB |
| 1 GB | 100 MB | 10 | |
| 5 GB | 100 MB | 50 | Maximum allowed |
| 5.1 GB | any | — | Rejected: exceeds `BATCH_MAX_TOTAL_SIZE` |
| 1 GB | 20 MB | — | Rejected: 50 parts needed, but 20 MB * 50 = 1 GB < 1 GB actual → 51 parts exceeds `BATCH_MAX_PARTS` |

### Hashes

`BatchFileBuilder` computes two types of SHA-256 hashes:

```
Original ZIP ─────────── SHA-256 → batchFile.fileHash
    │
    ├── Part 1 (plaintext) ─── encryptFn() → Encrypted Part 1 ─── SHA-256 → fileParts[0].fileHash
    ├── Part 2 (plaintext) ─── encryptFn() → Encrypted Part 2 ─── SHA-256 → fileParts[1].fileHash
    └── Part N (plaintext) ─── encryptFn() → Encrypted Part N ─── SHA-256 → fileParts[N-1].fileHash
```

| Hash | Computed from | Sent in | Purpose |
|------|---------------|---------|---------|
| `batchFile.fileHash` | Original unencrypted ZIP | `OpenBatchSessionRequest` | KSeF decrypts all parts, concatenates them, and verifies this hash matches the reassembled ZIP |
| `fileParts[i].fileHash` | Encrypted part bytes | `OpenBatchSessionRequest.batchFile.fileParts` | KSeF verifies each uploaded part matches the declared hash (upload integrity) |

Both are base64-encoded SHA-256 digests.

### BatchFileBuilder.build()

```typescript
static build(
  zipBytes: Uint8Array,
  encryptFn: (part: Uint8Array) => Uint8Array,
  options?: { maxPartSize?: number },
): BatchFileBuildResult
```

**Parameters:**
- `zipBytes` — Raw unencrypted ZIP data
- `encryptFn` — Encryption function called once per part (typically `crypto.encryptAES256(part, key, iv)`)
- `options.maxPartSize` — Override default 100 MB limit

**Returns:**

```typescript
interface BatchFileBuildResult {
  batchFile: BatchFileInfo;      // metadata for OpenBatchSessionRequest
  encryptedParts: Uint8Array[];  // encrypted data for upload, indexed 0..N-1
}

interface BatchFileInfo {
  fileSize: number;              // original ZIP byte length
  fileHash: string;              // SHA-256 of original ZIP (base64)
  fileParts: BatchFilePartInfo[];
}

interface BatchFilePartInfo {
  ordinalNumber: number;         // 1-based
  fileSize: number;              // encrypted part byte length
  fileHash: string;              // SHA-256 of encrypted part (base64)
}
```

**Validation (throws `KSeFValidationError`):**
- `maxPartSize <= 0`
- `zipBytes.length === 0` (empty ZIP)
- `zipBytes.length > 5 GB`
- `parts.length > 50`

---

## BatchSessionService

**File:** `src/services/batch-session.ts`

Low-level service that maps directly to KSeF batch API endpoints.

### openSession

```typescript
openSession(request: OpenBatchSessionRequest, upoVersion?: string): Promise<OpenBatchSessionResponse>
```

Sends `BatchFileInfo` (metadata: ZIP hash, part count, part hashes) and `EncryptionInfo` (encrypted AES key + IV) to KSeF. The server validates the metadata and returns presigned upload URLs — one per declared part.

**Request:**

```typescript
interface OpenBatchSessionRequest {
  formCode: FormCode;             // e.g., { systemCode: 'FA', schemaVersion: '3', value: 'FA (3)' }
  batchFile: BatchFileInfo;       // from BatchFileBuilder.build()
  encryption: EncryptionInfo;     // from crypto.getEncryptionData()
  offlineMode?: boolean;          // KSeF offline mode flag
}
```

**Response:**

```typescript
interface OpenBatchSessionResponse {
  referenceNumber: string;                 // session reference
  partUploadRequests: PartUploadRequest[]; // one per part
}

interface PartUploadRequest {
  method: string;              // HTTP method (typically 'PUT')
  ordinalNumber: number;       // matches BatchFilePartInfo.ordinalNumber
  url: string;                 // presigned upload URL
  headers: Record<string, string | null>; // required headers for upload
}
```

### sendParts

```typescript
sendParts(openResponse: OpenBatchSessionResponse, parts: BatchPartSendingInfo[]): Promise<void>
```

Uploads all encrypted parts to their respective presigned URLs. Parts are uploaded **in parallel** via `Promise.all()`.

Each part is matched to its upload URL by `ordinalNumber`. The upload uses the method and headers from `PartUploadRequest`.

```typescript
interface BatchPartSendingInfo {
  data: ArrayBuffer;         // encrypted part bytes
  metadata: FileMetadata;    // { hashSHA, fileSize } of encrypted part
  ordinalNumber: number;     // 1-based, matches PartUploadRequest
}
```

### closeSession

```typescript
closeSession(batchRef: string): Promise<void>
```

Signals to KSeF that all parts have been uploaded. KSeF begins processing (decrypting, reassembling, validating, and importing invoices).

---

## Batch Workflow

**File:** `src/workflows/batch-session-workflow.ts`

### uploadBatch

Orchestrates the full pipeline: crypto init → split → encrypt → open → upload → close → poll.

```typescript
import { uploadBatch } from 'ksef-client-ts';

const result = await uploadBatch(client, zipData, {
  formCode: { systemCode: 'FA', schemaVersion: '3', value: 'FA (3)' },  // default
  maxPartSize: 50_000_000,   // 50 MB parts
  offlineMode: false,
  upoVersion: 'upo-v4-3',
  pollOptions: {
    intervalMs: 5000,        // poll every 5 seconds
    maxAttempts: 120,        // wait up to 10 minutes
    onProgress: (attempt, max) => console.log(`Waiting... ${attempt}/${max}`),
  },
});
```

**Returns:**

```typescript
interface BatchUploadResult {
  sessionRef: string;
  upo: UpoInfo;
  // UpoInfo: { pages, invoiceCount, successfulInvoiceCount, failedInvoiceCount }
}
```

### uploadBatchParsed

Same as `uploadBatch`, but additionally downloads each UPO page and parses it into typed `UpoPotwierdzenie` objects:

```typescript
import { uploadBatchParsed } from 'ksef-client-ts';

const result = await uploadBatchParsed(client, zipData);

for (const upo of result.upo.parsed) {
  console.log(`Session: ${upo.numerReferencyjnySesji}`);
  for (const doc of upo.dokumenty) {
    console.log(`  ${doc.numerFaktury} → ${doc.numerKSeFDokumentu}`);
  }
}
```

**Returns:**

```typescript
interface ParsedBatchUploadResult {
  sessionRef: string;
  upo: ParsedUpoInfo;
  // ParsedUpoInfo extends UpoInfo with: parsed: UpoPotwierdzenie[]
}
```

### Encryption shared across parts

A single `(key, IV)` pair is generated per batch session via `crypto.getEncryptionData()`. All parts are encrypted with the same AES-256-CBC parameters. KSeF receives the RSA-wrapped key in `OpenBatchSessionRequest.encryption` and uses it to decrypt all parts.

```typescript
// src/workflows/batch-session-workflow.ts, lines 32-33
const encryptFn = (part: Uint8Array) =>
  client.crypto.encryptAES256(part, encData.cipherKey, encData.cipherIv);
```

---

## PKCS#12 Import

**File:** `src/crypto/pkcs12-loader.ts`

PKCS#12 (also called P12 or PFX) is a binary format that bundles a certificate and its private key into a single password-protected file. Commonly used for qualified certificates issued by Polish CAs (e.g., Certum, KIR, Asseco).

### Pkcs12Loader.load

```typescript
static load(p12: Buffer | Uint8Array, password: string): Pkcs12Result

interface Pkcs12Result {
  certificatePem: string;   // X.509 certificate in PEM format
  privateKeyPem: string;    // private key in PEM format
}
```

**Extraction strategy:**

```
P12 binary → ASN.1 parse → PKCS#12 structure
  │
  ├── Certificate bags (pki.oids.certBag)
  │     └── First certificate → PEM
  │
  └── Key bags (two attempts):
        ├── 1st: Shrouded key bags (pki.oids.pkcs8ShroudedKeyBag) — encrypted keys
        └── 2nd: Plain key bags (pki.oids.keyBag) — unencrypted keys
              └── First key → PEM
```

Uses `node-forge` for ASN.1 parsing and PKCS#12 decoding.

### Error cases

| Error | Cause |
|-------|-------|
| `PKCS#12 file does not contain a certificate` | P12 has key bags but no cert bags |
| `PKCS#12 file does not contain a private key` | P12 has cert bags but no key bags (neither shrouded nor plain) |
| `PKCS#12 certificate bag is empty` | Cert bag exists but contains no cert |
| `PKCS#12 key bag is empty` | Key bag exists but contains no key |
| `Failed to export private key from PKCS#12 to PEM` | EC keys that `node-forge` cannot export. Use separate PEM files instead. |
| ASN.1 / password errors | Wrong password or corrupt file — thrown by `node-forge` |

### Usage with auth workflow

```typescript
import { authenticateWithPkcs12 } from 'ksef-client-ts';

const result = await authenticateWithPkcs12(client, {
  nip: '1234567890',
  p12: fs.readFileSync('qualified-cert.p12'),
  password: 'cert-password',
});
// Internally: Pkcs12Loader.load() → authenticateWithCertificate(certPem, keyPem)
```

### When to use P12 vs PEM

| Format | When |
|--------|------|
| **P12/PFX** | You received a single `.p12` or `.pfx` file from a CA (most common for Polish qualified certs) |
| **PEM files** | You have separate `cert.pem` and `key.pem` files, or you have an ECDSA key that `node-forge` can't export |

If you have a P12 and want to extract PEM files manually:

```bash
# Extract certificate
openssl pkcs12 -in cert.p12 -clcerts -nokeys -out cert.pem

# Extract private key
openssl pkcs12 -in cert.p12 -nocerts -nodes -out key.pem
```

---

## Creating ZIP Files

**File:** `src/utils/zip.ts`

The `createZip()` utility creates ZIP buffers from in-memory data. Uses `yazl` for ZIP creation.

```typescript
import { createZip } from 'ksef-client-ts/utils/zip';

const zipBuffer = await createZip([
  { fileName: 'FA_2025_001.xml', content: Buffer.from(invoiceXml1) },
  { fileName: 'FA_2025_002.xml', content: Buffer.from(invoiceXml2) },
  { fileName: 'FA_2025_003.xml', content: fs.readFileSync('invoice3.xml') },
]);

// Pass to uploadBatch
const result = await uploadBatch(client, zipBuffer);
```

### ZipEntryInput

```typescript
interface ZipEntryInput {
  fileName: string;            // path inside the ZIP
  content: Buffer | Uint8Array; // file content
}
```

File names can include directory paths (e.g., `invoices/2025/FA_001.xml`). KSeF processes all XML files in the ZIP regardless of directory structure.

If your invoices are already on disk, read them into buffers. If they are generated in-memory, pass them directly.

---

## Online vs Batch: When to Use Which

| Factor | Online session | Batch session |
|--------|---------------|---------------|
| **Volume** | 1-10 invoices per session | 10-100,000+ invoices |
| **Feedback** | Immediate reference per invoice | Single UPO after full processing |
| **Speed** | Lower throughput (one at a time) | Higher throughput (parallel upload + bulk processing) |
| **Encryption** | Each invoice encrypted individually | ZIP split into parts, each part encrypted |
| **Error granularity** | Per-invoice errors during session | Errors in UPO after processing |
| **Use case** | Real-time integrations, interactive apps | Scheduled imports, migrations, bulk uploads |
| **ZIP required** | No | Yes |
| **Max payload** | Single invoice per send | 5 GB ZIP (50 parts of 100 MB) |
| **Session duration** | Limited (validUntil in response) | Processing time depends on volume |

### Rule of thumb

- Sending invoices **as they are created** → online session (`openOnlineSession`)
- Uploading a **batch of invoices** on a schedule → batch session (`uploadBatch`)
- Sending a **single invoice** → `openSendAndClose` (convenience wrapper)

---

## Error Handling

| Error | Thrown by | Cause |
|-------|----------|-------|
| `KSeFValidationError('ZIP data must not be empty')` | `BatchFileBuilder` | Empty ZIP buffer |
| `KSeFValidationError('ZIP size ... exceeds maximum of 5 GB')` | `BatchFileBuilder` | ZIP too large |
| `KSeFValidationError('Data requires N parts, exceeding maximum of 50')` | `BatchFileBuilder` | Too many parts after split |
| `KSeFValidationError('maxPartSize must be a positive number')` | `BatchFileBuilder` | Invalid `maxPartSize` option |
| `Error('No upload request found for part N')` | `BatchSessionService.sendParts` | Part ordinal mismatch between builder output and server response |
| `Error('Batch session failed: CODE — DESC')` | `uploadBatch` workflow | Session processing code >= 400 |
| `Error('Polling timeout: ...')` | `pollUntil` | Processing didn't complete within `maxAttempts` |
| `KSeFApiError` / `KSeFRateLimitError` | `RestClient` | HTTP errors during API calls (retried automatically, see [HTTP Resilience](./http-resilience.md)) |
| PKCS#12 errors (see table above) | `Pkcs12Loader` | Certificate extraction failures |

---

## Complete Example

End-to-end batch upload with PKCS#12 auth, custom part size, progress tracking, and parsed UPO:

```typescript
import fs from 'node:fs';
import {
  KSeFClient,
  authenticateWithPkcs12,
  uploadBatchParsed,
} from 'ksef-client-ts';
import { createZip } from 'ksef-client-ts/utils/zip';

async function batchUpload() {
  const client = new KSeFClient({ environment: 'PROD' });

  // 1. Authenticate with a PKCS#12 certificate
  await authenticateWithPkcs12(client, {
    nip: '1234567890',
    p12: fs.readFileSync('qualified-cert.p12'),
    password: process.env.CERT_PASSWORD!,
  });

  // 2. Prepare invoices
  const invoiceFiles = fs.readdirSync('./invoices')
    .filter(f => f.endsWith('.xml'))
    .map(f => ({
      fileName: f,
      content: fs.readFileSync(`./invoices/${f}`),
    }));
  console.log(`Packing ${invoiceFiles.length} invoices...`);

  const zipData = await createZip(invoiceFiles);
  console.log(`ZIP size: ${(zipData.length / 1_000_000).toFixed(1)} MB`);

  // 3. Upload with progress tracking
  const result = await uploadBatchParsed(client, zipData, {
    maxPartSize: 50_000_000,  // 50 MB parts
    pollOptions: {
      intervalMs: 10_000,     // poll every 10 seconds (large batch)
      maxAttempts: 360,       // wait up to 1 hour
      onProgress: (attempt, max) => {
        console.log(`Processing... (${attempt}/${max})`);
      },
    },
  });

  // 4. Print results
  console.log(`\nBatch session: ${result.sessionRef}`);
  console.log(`Total: ${result.upo.invoiceCount}`);
  console.log(`Success: ${result.upo.successfulInvoiceCount}`);
  console.log(`Failed: ${result.upo.failedInvoiceCount}`);

  for (const upo of result.upo.parsed) {
    for (const doc of upo.dokumenty) {
      console.log(`  ${doc.numerFaktury} → ${doc.numerKSeFDokumentu} (${doc.dataNadaniaNumeruKSeF})`);
    }
  }
}
```
