## ADDED Requirements

### Requirement: Incremental export and download
The `incrementalExportAndDownload()` function SHALL iteratively export invoices by advancing the HWM continuation point until all matching invoices are retrieved or termination conditions are met. It MUST accept a `KSeFClient`, `IncrementalExportOptions`, and return an `IncrementalExportResult`.

#### Scenario: Single iteration (non-truncated)
- **WHEN** `incrementalExportAndDownload()` is called and the first export returns `isTruncated=false`
- **THEN** the function SHALL complete after 1 iteration, returning all parts and reference number

#### Scenario: Multiple iterations with HWM advancement
- **WHEN** the first export returns `isTruncated=true` with `lastPermanentStorageDate="2026-01-15"`
- **THEN** the function SHALL start a second iteration with `from="2026-01-15"`, and continue until `isTruncated=false` or termination

#### Scenario: Consolidated results across iterations
- **WHEN** 3 iterations complete, each returning decrypted parts
- **THEN** `IncrementalExportResult.decryptedParts` SHALL contain all parts from all iterations concatenated in order, and `referenceNumbers` SHALL contain all 3 reference numbers

### Requirement: Termination conditions
The iteration loop SHALL terminate when ANY of the following conditions is met:
1. `isTruncated === false` — all invoices in the window have been exported
2. `effectiveFrom` has not advanced from the previous iteration (stall protection)
3. `maxIterations` limit has been reached (default: 20)

#### Scenario: Terminate on non-truncated result
- **WHEN** an iteration returns `isTruncated=false`
- **THEN** the loop SHALL stop and return accumulated results

#### Scenario: Terminate on stalled HWM
- **WHEN** `getEffectiveStartDate()` returns the same value as the previous iteration
- **THEN** the loop SHALL stop to prevent infinite cycling

#### Scenario: Terminate on max iterations
- **WHEN** 20 iterations (default) have completed and the result is still truncated
- **THEN** the loop SHALL stop and return accumulated results with updated continuation points

#### Scenario: Custom max iterations
- **WHEN** `maxIterations: 5` is provided in options
- **THEN** the loop SHALL stop after at most 5 iterations

### Requirement: Filters factory
The function SHALL accept an optional `filtersFactory` callback that produces `InvoiceQueryFilters` for each iteration. If not provided, default filters SHALL be used.

#### Scenario: Custom filters factory
- **WHEN** `filtersFactory` is provided as `(from, to) => customFilters`
- **THEN** each iteration SHALL call `filtersFactory(effectiveFrom, windowTo)` to build filters

#### Scenario: Default filters
- **WHEN** no `filtersFactory` is provided
- **THEN** each iteration SHALL use filters with `subjectType` from options, `dateRange.dateType = "PermanentStorage"`, `dateRange.from = effectiveFrom`, `dateRange.to = windowTo`

### Requirement: Crypto initialization
The function SHALL initialize crypto (`client.crypto.init()`) once before the first iteration, not on every iteration.

#### Scenario: Single crypto init
- **WHEN** `incrementalExportAndDownload()` runs 3 iterations
- **THEN** `client.crypto.init()` SHALL be called exactly once

### Requirement: Continuation points mutation
The function SHALL mutate the provided `continuationPoints` object in-place via `updateContinuationPoint()` after each iteration. The same object reference MUST be returned in `IncrementalExportResult.continuationPoints`.

#### Scenario: Continuation points updated after each iteration
- **WHEN** iteration 1 completes with `lastPermanentStorageDate="2026-01-15"` (truncated)
- **THEN** `continuationPoints[subjectType]` SHALL equal `"2026-01-15"` before iteration 2 starts

#### Scenario: Same object reference returned
- **WHEN** the function completes
- **THEN** `result.continuationPoints` SHALL be the same object reference as the input `continuationPoints`

### Requirement: Iteration progress callback
The function SHALL accept an optional `onIterationComplete` callback invoked after each iteration with the iteration number (0-based) and the `ExportResult`.

#### Scenario: Callback invoked per iteration
- **WHEN** `onIterationComplete` is provided and 3 iterations complete
- **THEN** the callback SHALL be called 3 times with `(0, result0)`, `(1, result1)`, `(2, result2)`

#### Scenario: No callback
- **WHEN** `onIterationComplete` is not provided
- **THEN** the function SHALL work without error

### Requirement: Iteration count in result
The `IncrementalExportResult` SHALL include an `iterationCount` field indicating how many export iterations were performed.

#### Scenario: Iteration count
- **WHEN** the function completes after 3 iterations
- **THEN** `result.iterationCount` SHALL equal `3`

### Requirement: Poll and transport options forwarding
The function SHALL forward `pollOptions`, `onlyMetadata`, and `transport` options to the underlying `doExport()` / download logic for each iteration.

#### Scenario: Custom poll interval
- **WHEN** `pollOptions: { intervalMs: 5000, maxAttempts: 120 }` is provided
- **THEN** each iteration's export polling SHALL use 5000ms interval and 120 max attempts

#### Scenario: Only metadata mode
- **WHEN** `onlyMetadata: true` is provided
- **THEN** each iteration SHALL pass `onlyMetadata: true` to the export request

### Requirement: HWM storage integration
The function SHALL accept an optional `store: HwmStore` parameter. If provided, it MUST call `store.load()` before the first iteration to initialize continuation points, and `store.save(points)` after each iteration.

#### Scenario: Store load on start
- **WHEN** a `HwmStore` is provided with saved state `{ Subject1: "2026-01-15" }`
- **THEN** the function SHALL merge loaded points into `continuationPoints` before iterating

#### Scenario: Store save after each iteration
- **WHEN** a `HwmStore` is provided and 3 iterations complete
- **THEN** `store.save()` SHALL be called 3 times with updated continuation points

#### Scenario: No store
- **WHEN** no `HwmStore` is provided
- **THEN** the function SHALL work with in-memory continuation points only
