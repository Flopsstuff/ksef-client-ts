## ADDED Requirements

### Requirement: Update continuation point from export package
The `updateContinuationPoint()` function SHALL update continuation points based on an `InvoiceExportPackage` response. It MUST follow this priority:
1. If `isTruncated === true` AND `lastPermanentStorageDate` exists → store `lastPermanentStorageDate` as the continuation point for the given `subjectType`
2. Else if `permanentStorageHwmDate` exists → store `permanentStorageHwmDate`
3. Else → delete the entry for that `subjectType` (export complete for this subject)

The function MUST mutate the `ContinuationPoints` record in-place.

#### Scenario: Truncated package with lastPermanentStorageDate
- **WHEN** `updateContinuationPoint()` is called with a package where `isTruncated=true` and `lastPermanentStorageDate="2026-01-15T12:00:00Z"`
- **THEN** `points[subjectType]` SHALL equal `"2026-01-15T12:00:00Z"`

#### Scenario: Non-truncated package with permanentStorageHwmDate
- **WHEN** `updateContinuationPoint()` is called with a package where `isTruncated=false` and `permanentStorageHwmDate="2026-01-31T23:59:59Z"`
- **THEN** `points[subjectType]` SHALL equal `"2026-01-31T23:59:59Z"`

#### Scenario: Truncated but no lastPermanentStorageDate, with HWM
- **WHEN** `updateContinuationPoint()` is called with a package where `isTruncated=true`, `lastPermanentStorageDate` is undefined, and `permanentStorageHwmDate="2026-01-20T00:00:00Z"`
- **THEN** `points[subjectType]` SHALL equal `"2026-01-20T00:00:00Z"` (fallback to HWM)

#### Scenario: No HWM dates at all
- **WHEN** `updateContinuationPoint()` is called with a package where both `lastPermanentStorageDate` and `permanentStorageHwmDate` are undefined
- **THEN** `points[subjectType]` SHALL be deleted (entry removed)

#### Scenario: Multiple subject types
- **WHEN** `updateContinuationPoint()` is called for `"Subject1"` then for `"Subject2"` with different packages
- **THEN** each subject type's continuation point SHALL be tracked independently

### Requirement: Get effective start date
The `getEffectiveStartDate()` function SHALL return the saved continuation point for a given `subjectType` if it exists, otherwise return the provided `windowFrom` fallback.

#### Scenario: Continuation point exists
- **WHEN** `getEffectiveStartDate()` is called with `points["Subject1"] = "2026-01-15T12:00:00Z"` and `windowFrom = "2026-01-01"`
- **THEN** the function SHALL return `"2026-01-15T12:00:00Z"`

#### Scenario: No continuation point
- **WHEN** `getEffectiveStartDate()` is called with no entry for `"Subject1"` and `windowFrom = "2026-01-01"`
- **THEN** the function SHALL return `"2026-01-01"`

#### Scenario: Continuation point is undefined
- **WHEN** `getEffectiveStartDate()` is called with `points["Subject1"] = undefined` and `windowFrom = "2026-01-01"`
- **THEN** the function SHALL return `"2026-01-01"`

### Requirement: Deduplicate metadata by KSeF number
The `deduplicateByKsefNumber()` function SHALL accept an array of `InvoiceMetadata` and return a new array with duplicates removed. Deduplication MUST be based on the `ksefNumber` field, case-insensitive. The first occurrence of each KSeF number SHALL be preserved.

#### Scenario: No duplicates
- **WHEN** `deduplicateByKsefNumber()` is called with 3 entries having unique KSeF numbers
- **THEN** all 3 entries SHALL be returned

#### Scenario: Duplicate KSeF numbers
- **WHEN** `deduplicateByKsefNumber()` is called with entries containing `"1234567890-20260115-ABC123"` twice
- **THEN** only the first occurrence SHALL be returned

#### Scenario: Case-insensitive deduplication
- **WHEN** `deduplicateByKsefNumber()` is called with entries containing `"1234567890-20260115-abc123"` and `"1234567890-20260115-ABC123"`
- **THEN** only the first occurrence SHALL be returned (case-insensitive match)

#### Scenario: Empty input
- **WHEN** `deduplicateByKsefNumber()` is called with an empty array
- **THEN** an empty array SHALL be returned

### Requirement: ContinuationPoints type
The module SHALL export a `ContinuationPoints` type defined as `Record<string, string | undefined>` where keys are subject type strings and values are ISO datetime strings representing the last processed permanent storage date.

#### Scenario: Type compatibility
- **WHEN** a `ContinuationPoints` object is created with `{ Subject1: "2026-01-15T12:00:00Z" }`
- **THEN** it SHALL be assignable to the `ContinuationPoints` type

#### Scenario: Empty initialization
- **WHEN** a `ContinuationPoints` object is created as `{}`
- **THEN** it SHALL be valid for first-run scenarios
