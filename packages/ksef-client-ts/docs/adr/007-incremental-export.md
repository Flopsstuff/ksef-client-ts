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
2. `permanentStorageHwmDate` exists -> use it (stable HWM from snapshot mode)
3. Neither -> delete the entry (export for this subject type is complete)

This priority is consistent with KSeF API documentation (see [ADR-004](004-ksef-api-behavior.md)).

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
