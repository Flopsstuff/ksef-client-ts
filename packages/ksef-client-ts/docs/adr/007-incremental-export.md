# ADR-007: Incremental Export with HWM

- **Date:** 2026-03-28
- **Status:** Accepted

## Context

The export workflow (`exportInvoices()`, `exportAndDownload()`) executes a single export -> poll -> download cycle. When the KSeF API returns a truncated package (`isTruncated: true`), it provides `lastPermanentStorageDate` and `permanentStorageHwmDate` — but no automatic pagination existed.

All model types were already in place (`InvoiceExportPackage` with HWM fields, `InvoiceQueryDateRange` with `restrictToPermanentStorageHwmDate`). Only orchestration was needed.

## Decisions

### HWM Coordinator: stateless utility functions, not a class

Three pure functions in `hwm-coordinator.ts`: `updateContinuationPoint()`, `getEffectiveStartDate()`, `deduplicateByKsefNumber()`.

All existing workflows are functional (`exportInvoices()`, `exportAndDownload()`, `pollUntil()`). A `HwmCoordinator` class (as in smekcio) would be the only class-based workflow — inconsistent with project conventions.

### Continuation point update priority

The same algorithm as smekcio and C# (proven pattern):

1. `isTruncated && lastPermanentStorageDate` -> use `lastPermanentStorageDate` (last date in truncated package = resume point)
2. `isTruncated` without `lastPermanentStorageDate` -> use the latest `permanentStorageDate` among the package's records (its `_metadata.json`); if there are none, throw and leave the point unchanged
3. `permanentStorageHwmDate` exists -> use it (stable HWM from snapshot mode)
4. Neither -> delete the entry (export for this subject type is complete)

This priority is consistent with KSeF API documentation (see [ADR-004](004-ksef-api-behavior.md)).

**Amended in v0.15.0.** `lastPermanentStorageDate` is nullable in the spec. The original algorithm (same as C# and Java) fell through to `permanentStorageHwmDate` for a truncated package without it, so every invoice between the package's last record and the HWM was skipped for good. Step 2 follows smekcio ksef-client-python 0.19.0:

- **Latest instant, not the last array entry.** `_metadata.json` has no documented order, and the package is cut at the newest record it holds. The original string is kept, so the server's 7-digit precision is not lost.
- **Restarting at that date is inclusive.** The boundary record comes back in the next package. Records that share its instant but were cut off come back too. `deduplicateByKsefNumber()` removes the repeats, as it already does for adjacent windows.
- **Throw rather than guess.** A truncated package with no resume point at all is an error (`KSeFError`) and the point is not saved. A rerun then retries the same package instead of skipping data or reporting a gappy export as complete.
- **Only for storage-date windows.** `incrementalExportAndDownload()` reads `_metadata.json` only when `lastPermanentStorageDate` is missing and the window is filtered by `PermanentStorage`. Storage dates are no resume point for an `Issue` or `Invoicing` window, so such a package throws.

### Three termination conditions

The iteration loop exits on any of:

1. **No progress** — `effectiveFrom` didn't change (safety valve against infinite loops)
2. **Not truncated** — `isTruncated === false` (happy path, all data exported)
3. **Max iterations** — reached `maxIterations` (default 20, configurable)

### Deduplication by KSeF number, case-insensitive

Overlapping time windows (continuation point may repeat boundary invoices) require dedup. Key is `metadata.ksefNumber.toLowerCase()`, first occurrence wins.

Case-insensitive as a defensive measure against potential API inconsistency.

### Pluggable HWM storage

```typescript
interface HwmStore {
  load(): Promise<ContinuationPoints>;
  save(points: ContinuationPoints): Promise<void>;
}
```

Two implementations: `InMemoryHwmStore` (tests, one-shot runs) and `FileHwmStore` (CLI, persistent between runs). Users can implement custom stores (Redis, DB).

**Rejected:** Only raw `ContinuationPoints` object without storage interface (as in smekcio) — we have a CLI command that needs file persistence between process invocations.

### No changes to KSeFClient class

Incremental export remains a standalone function imported from `'ksef-client-ts/workflows'` — same pattern as `exportAndDownload()`. No `client.workflows` property.

## Risks

- **Metadata dedup requires ZIP parsing** — Full automatic dedup depends on UPO parsing to extract invoice metadata from ZIPs. Without it, `deduplicateByKsefNumber()` is available as a utility for callers who parse metadata themselves.
- **Rate limiting under many iterations** — 20 iterations = 20 export requests + polling. Handled by `RetryPolicy` (exponential backoff on 429) and `RateLimitPolicy` (token bucket).
- **File-based HWM store race conditions** — Two concurrent CLI runs with the same state file may conflict. Documented as unsupported. Lockfile is over-engineering for CLI use case.
- **maxIterations = 20 may be insufficient** — For very large volumes. Configurable parameter; CLI supports `--max-iterations`.
