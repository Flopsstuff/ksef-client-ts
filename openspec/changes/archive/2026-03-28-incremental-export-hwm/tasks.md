## 1. HWM Coordinator

- [x] 1.1 Create `src/workflows/hwm-coordinator.ts` with `ContinuationPoints` type export and `updateContinuationPoint()` function (priority: isTruncated+lastPermanentStorageDate → permanentStorageHwmDate → delete)
- [x] 1.2 Implement `getEffectiveStartDate()` — return saved point or windowFrom fallback
- [x] 1.3 Implement `deduplicateByKsefNumber()` — case-insensitive dedup on `ksefNumber`, preserve first occurrence
- [x] 1.4 Write unit tests for `updateContinuationPoint()`: truncated with lastPermanentStorageDate, non-truncated with HWM, truncated without lastPermanentStorageDate, no dates (delete), multiple subject types
- [x] 1.5 Write unit tests for `getEffectiveStartDate()`: point exists, no point, undefined point
- [x] 1.6 Write unit tests for `deduplicateByKsefNumber()`: no duplicates, duplicates, case-insensitive, empty input

## 2. HWM Storage

- [x] 2.1 Create `src/workflows/hwm-storage.ts` with `HwmStore` interface (`load(): Promise<ContinuationPoints>`, `save(points): Promise<void>`)
- [x] 2.2 Implement `InMemoryHwmStore` class
- [x] 2.3 Implement `FileHwmStore` class — read/write JSON file, auto-create on first save
- [x] 2.4 Write unit tests for `InMemoryHwmStore`: load empty, save and load, overwrite
- [x] 2.5 Write unit tests for `FileHwmStore`: create new file, read existing, overwrite, handle missing file on load (return empty)

## 3. Export doExport() refactor

- [x] 3.1 Export `doExport()` from `src/workflows/invoice-export-workflow.ts` (add `export` keyword, keep existing API unchanged)
- [x] 3.2 Add `lastPermanentStorageDate` to `ExportResult` in `src/workflows/types.ts` (needed for HWM update from workflow result)
- [x] 3.3 Map `lastPermanentStorageDate` from `InvoiceExportPackage` in `doExport()` result construction
- [x] 3.4 Verify existing unit tests still pass after the refactor

## 4. Incremental Export Workflow

- [x] 4.1 Create `src/workflows/incremental-export-workflow.ts` with `IncrementalExportOptions` and `IncrementalExportResult` types
- [x] 4.2 Implement `incrementalExportAndDownload()` — iteration loop calling `doExport()`, download+decrypt, HWM update, termination conditions
- [x] 4.3 Implement default filters factory (subjectType, dateRange.dateType=PermanentStorage, from=effectiveFrom, to=windowTo)
- [x] 4.4 Implement optional `filtersFactory` callback support
- [x] 4.5 Implement optional `store: HwmStore` integration (load before first iteration, save after each)
- [x] 4.6 Implement `onIterationComplete` callback
- [x] 4.7 Implement single `client.crypto.init()` call before first iteration (not per-iteration)
- [x] 4.8 Write unit tests: single iteration (non-truncated), multiple iterations with HWM advancement, stall termination, max iterations termination
- [x] 4.9 Write unit tests: custom filtersFactory, default filters, consolidated results (parts + referenceNumbers), iterationCount
- [x] 4.10 Write unit tests: HwmStore integration (load/save), onIterationComplete callback, pollOptions forwarding, onlyMetadata forwarding
- [x] 4.11 Write unit tests: continuation points mutation (in-place, same reference returned)

## 5. Barrel exports

- [x] 5.1 Export `incrementalExportAndDownload`, `IncrementalExportOptions`, `IncrementalExportResult` from workflows barrel (create or update `src/workflows/index.ts`)
- [x] 5.2 Export `ContinuationPoints`, `updateContinuationPoint`, `getEffectiveStartDate`, `deduplicateByKsefNumber` from workflows barrel
- [x] 5.3 Export `HwmStore`, `InMemoryHwmStore`, `FileHwmStore` from workflows barrel
- [x] 5.4 Verify exports are accessible from package entry point (`src/index.ts`)

## 6. CLI command

- [x] 6.1 Create `src/cli/commands/export-incremental.ts` with citty command definition: `--from` (required), `--to`, `--subject-type`, `--state-file`, `--output-dir`, `--max-iterations`, `--json`
- [x] 6.2 Implement command handler: create FileHwmStore, build options, call `incrementalExportAndDownload()`, save decrypted parts to output-dir with `iter-NNN-part-NNN.zip` naming
- [x] 6.3 Implement progress display: iteration number, invoice count, HWM date, truncated flag per iteration; summary on completion
- [x] 6.4 Implement JSON output mode (suppress progress, output IncrementalExportResult as JSON)
- [x] 6.5 Register `export-incremental` subcommand in the invoice command group
- [x] 6.6 Write unit tests for CLI command: argument parsing, missing --from error, default values

## 7. Integration & E2E

- [x] 7.1 Run `yarn lint` and fix any type errors
- [x] 7.2 Run `yarn test` and verify all existing + new unit tests pass
- [x] 7.3 Write E2E test: incremental export with test invoices (send invoices, run incremental export, verify parts downloaded and HWM advanced)
