# Offline Mode

Offline mode allows issuing invoices when KSeF is unavailable or by taxpayer's choice. Offline invoices are generated locally with QR codes (KOD I for invoice verification, KOD II for certificate verification), stored on disk, and submitted to KSeF when the system becomes available.

## Offline Modes

KSeF defines four offline modes per Polish VAT Act (art. 106nda/106nh/106nf):

| Mode | Trigger | Deadline |
|------|---------|----------|
| `offline24` | Taxpayer's choice | Next business day after issue date |
| `offline` | KSeF system unavailability (announced via BIP) | Next business day after unavailability ends |
| `awaryjny` | KSeF failure (emergency, announced via BIP) | 7 business days from failure end |
| `awaria_calkowita` | Total system failure (mass media announcement) | Invoice obligation suspended entirely |

Business days exclude Saturdays, Sundays, and [Polish statutory holidays](./polish-holidays.md).

## Quick Start (CLI)

```bash
# 1. Generate offline invoice with QR codes
ksef offline generate invoice.xml --nip 1234567890

# 2. Generate with KOD II signing (requires enrolled Offline certificate)
ksef offline generate invoice.xml --key offline-key.pem --cert-serial 01F20A5D

# 3. List stored offline invoices
ksef offline list

# 4. Submit all pending invoices to KSeF
ksef offline submit --all

# 5. Check submission results
ksef offline list --status ACCEPTED
```

## Quick Start (Programmatic)

```typescript
import { KSeFClient, InMemoryOfflineInvoiceStorage } from 'ksef-client-ts';

const client = new KSeFClient({ environment: 'TEST' });
const storage = new InMemoryOfflineInvoiceStorage();

// Generate offline invoice
const metadata = await client.offline.generate(
  {
    invoiceNumber: 'FV/2026/001',
    invoiceDate: '2026-04-08',
    invoiceXml: '<FA>...</FA>',
    sellerNip: '1234567890',
    sellerIdentifier: { type: 'Nip', value: '1234567890' },
  },
  {
    mode: 'offline24',
    storage,
    certificate: {
      privateKeyPem: fs.readFileSync('offline-key.pem', 'utf-8'),
      certificateSerial: '01F20A5D352AE590',
    },
  },
);

console.log(`Generated: ${metadata.id}`);
console.log(`KOD I: ${metadata.kod1Url}`);
console.log(`KOD II: ${metadata.kod2Url}`);
console.log(`Deadline: ${metadata.submitBy}`);

// Submit when KSeF is available
await client.loginWithToken(token, nip);
// submit() needs the full client for crypto, session, and invoice API calls
const result = await client.offline.submit(client, { storage });
console.log(`Accepted: ${result.accepted}, Rejected: ${result.rejected}`);
```

## Invoice Lifecycle

Offline invoices follow a state machine:

```
GENERATED → QUEUED → SUBMITTED → ACCEPTED
                                → REJECTED
           → EXPIRED (from any non-terminal state)
```

| Status | Description |
|--------|-------------|
| `GENERATED` | Created locally, QR codes generated, saved to storage |
| `QUEUED` | Marked for submission (internal, set during submit) |
| `SUBMITTED` | Sent to KSeF, awaiting response |
| `ACCEPTED` | KSeF assigned a reference number |
| `REJECTED` | KSeF rejected (schema error, duplicate, etc.) |
| `EXPIRED` | Submission deadline passed without submission |

## QR Codes

Every offline invoice requires two QR codes:

### KOD I (Invoice Verification)

Always generated. Contains the invoice hash for verification.

```
https://qr-{env}.ksef.mf.gov.pl/invoice/{NIP}/{DD-MM-YYYY}/{hash_base64url}
```

Label: `OFFLINE` (until KSeF assigns a reference number).

> **Tip:** Use `ksef qr invoice --offline` to generate a standalone KOD I QR with the "OFFLINE" label.

### KOD II (Certificate Verification)

Generated only when an `OfflineCertificate` is provided. Contains a cryptographic signature proving the issuer's identity.

```
https://qr-{env}.ksef.mf.gov.pl/certificate/{contextType}/{contextValue}/{sellerNip}/{certSerial}/{hash_base64url}/{signature_base64url}
```

Label: `CERTYFIKAT`.

**Signing algorithms:**

- RSA-PSS: SHA-256, MGF1-SHA256, salt 32 bytes, min 2048-bit key
- ECDSA P-256: SHA-256, IEEE P1363 format (64 bytes)

The signed data is the URL path without the `https://` prefix.

**Certificate requirement:** The certificate must be enrolled in KSeF as type `Offline` (keyUsage: Non-Repudiation). Authentication-type certificates cannot be used for KOD II.

## Deadline Calculation

```typescript
import { calculateOfflineDeadline, isExpired, getTimeUntilDeadline } from 'ksef-client-ts';

// offline24: next business day after invoice date
const deadline = calculateOfflineDeadline('offline24', '2026-04-10'); // Friday → Monday

// awaryjny: 7 business days after maintenance window ends
const deadline2 = calculateOfflineDeadline('awaryjny', '2026-04-01', {
  id: 'mw-1',
  startTime: '2026-04-06T10:00:00Z',
  endTime: '2026-04-06T18:00:00Z',
  active: false,
  planned: false,
});

// Check expiry
if (isExpired(deadline)) {
  console.log('Deadline passed!');
}
const ms = getTimeUntilDeadline(deadline);
console.log(`${Math.round(ms / 3600000)}h remaining`);
```

### Maintenance Window Cascading

If a new KSeF failure is announced during an existing deadline window, the deadline extends:

```typescript
import { extendDeadlineForMaintenance } from 'ksef-client-ts';

const newDeadline = extendDeadlineForMaintenance(currentDeadline, newMaintenanceWindow, mode);
// Extension depends on mode: next business day (offline24/offline),
// 7 business days (awaryjny), or far-future (awaria_calkowita).
// Default mode is 'awaryjny' for backward compatibility.
```

## Storage

Offline invoices are stored locally. Two built-in implementations:

### InMemoryOfflineInvoiceStorage

For testing and library embedding. Stores invoices in a `Map`.

```typescript
import { InMemoryOfflineInvoiceStorage } from 'ksef-client-ts';
const storage = new InMemoryOfflineInvoiceStorage();
```

### FileOfflineInvoiceStorage

For CLI and persistent use. Stores each invoice as `{uuid}.json` in a directory. Default: `~/.ksef/offline/`.

```typescript
import { FileOfflineInvoiceStorage } from 'ksef-client-ts';

const storage = new FileOfflineInvoiceStorage();           // ~/.ksef/offline/
const custom = new FileOfflineInvoiceStorage('/tmp/offline'); // custom dir
```

Writes are atomic (temp file + rename). Corrupt JSON files are skipped on list.

### Filtering

```typescript
// Filter by status
const pending = await storage.list({ status: ['GENERATED', 'QUEUED'] });

// Filter by mode
const emergency = await storage.list({ mode: 'awaryjny' });

// Expiring within 24 hours
const urgent = await storage.list({
  expiringBefore: new Date(Date.now() + 24 * 60 * 60 * 1000),
});

// Combined (AND logic)
const specific = await storage.list({ status: 'GENERATED', sellerNip: '1234567890' });
```

### Custom Storage

Implement `OfflineInvoiceStorage` for database or cloud backends:

```typescript
import type { OfflineInvoiceStorage } from 'ksef-client-ts';

class PostgresOfflineStorage implements OfflineInvoiceStorage {
  async save(invoice) { /* INSERT INTO offline_invoices ... */ }
  async get(id) { /* SELECT ... WHERE id = $1 */ }
  async list(filter?) { /* SELECT ... WHERE status = $1 AND ... */ }
  async update(id, updates) { /* UPDATE offline_invoices SET ... */ }
  async delete(id) { /* DELETE FROM offline_invoices WHERE id = $1 */ }
}
```

## Technical Correction

Rejected offline invoices can be resubmitted with corrected XML. KSeF links the correction to the original via `hashOfCorrectedInvoice`.

```typescript
const result = await client.offline.correct(client, {
  rejectedInvoiceId: 'original-uuid',
  correctedInvoiceXml: '<FA>...fixed...</FA>',
  storage,
});
```

Only invoices with status `REJECTED` can be corrected. The correction is submitted with `offlineMode: true` and automatically computes the SHA-256 hash of the original invoice XML.

## CLI Reference

### `ksef offline generate <xml-file>`

Generate offline invoice metadata with QR codes.

| Flag | Description |
|------|-------------|
| `--mode` | Offline mode: `offline24` (default), `offline`, `awaryjny`, `awaria_calkowita` |
| `--key` | Private key PEM file for KOD II signing |
| `--cert-serial` | Certificate serial number (hex, required with `--key`) |
| `--context-type` | Seller context type (default: `Nip`) |
| `--context-id` | Seller context value (default: NIP) |
| `--qr-format` | QR output: `png` (default) or `svg` |
| `--qr-out` | Directory to save QR images |
| `--no-store` | Don't save to local store |

### `ksef offline list`

List stored offline invoices.

| Flag | Description |
|------|-------------|
| `--status` | Filter by status (GENERATED, QUEUED, etc.) |
| `--mode` | Filter by offline mode |
| `--expiring` | Show only invoices expiring within 24 hours |

### `ksef offline status <id>`

Show detailed information about a single offline invoice.

### `ksef offline submit [ids...]`

Submit offline invoices to KSeF.

| Flag | Description |
|------|-------------|
| `--all` | Submit all pending (GENERATED/QUEUED) invoices |
| `--no-check-expiry` | Skip expiry check |

### `ksef offline correct <id> <xml-file>`

Resubmit a rejected offline invoice with corrected XML.

### `ksef offline delete <id>`

Remove an invoice from local storage.

| Flag | Description |
|------|-------------|
| `--expired` | Delete all expired invoices |

All commands support `--json`, `--env`, `--verbose`, `--nip`, `--store-dir`.
