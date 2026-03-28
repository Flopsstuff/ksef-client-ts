### Requirement: Safe ZIP extraction with bomb protection
The `unzip(buffer, options?)` function SHALL extract a ZIP archive from a `Buffer` into a `Map<string, Buffer>` of filename→content entries. It SHALL enforce configurable safety limits and reject archives that violate any limit by throwing an `Error`.

#### Scenario: Successful extraction of a valid archive
- **WHEN** `unzip()` is called with a valid ZIP buffer containing 3 files totaling 1 KB
- **THEN** it returns a `Map` with 3 entries, each key being the file name and each value being the file content as `Buffer`

#### Scenario: Directory entries are skipped
- **WHEN** the ZIP contains entries whose file names end with `/`
- **THEN** those entries SHALL be skipped and not included in the result `Map`

#### Scenario: Empty archive
- **WHEN** `unzip()` is called with a valid ZIP buffer containing zero files
- **THEN** it returns an empty `Map`

### Requirement: File count limit
The `unzip()` function SHALL reject archives containing more files than the `maxFiles` limit (default: 10,000).

#### Scenario: Archive exceeds file count limit
- **WHEN** `unzip()` is called with a ZIP containing 11,000 files and default options
- **THEN** it throws an `Error` with message containing `"too many files"`

#### Scenario: Custom file count limit
- **WHEN** `unzip()` is called with `{ maxFiles: 5 }` and a ZIP containing 6 files
- **THEN** it throws an `Error` with message containing `"too many files"`

#### Scenario: File count limit disabled
- **WHEN** `unzip()` is called with `{ maxFiles: 0 }` and a ZIP containing any number of files
- **THEN** the file count check SHALL be skipped

### Requirement: Total uncompressed size limit
The `unzip()` function SHALL reject archives whose total uncompressed content exceeds the `maxTotalUncompressedSize` limit (default: 2,000,000,000 bytes).

#### Scenario: Archive exceeds total uncompressed size
- **WHEN** the cumulative uncompressed size of all entries exceeds `maxTotalUncompressedSize`
- **THEN** it throws an `Error` with message containing `"max_total_uncompressed_size"`

#### Scenario: Total size limit disabled
- **WHEN** `unzip()` is called with `{ maxTotalUncompressedSize: 0 }`
- **THEN** the total size check SHALL be skipped

### Requirement: Per-file uncompressed size limit
The `unzip()` function SHALL reject any individual entry whose uncompressed size exceeds the `maxFileUncompressedSize` limit (default: 500,000,000 bytes).

#### Scenario: Single entry exceeds per-file limit
- **WHEN** a ZIP entry has `uncompressedSize` greater than `maxFileUncompressedSize`
- **THEN** it throws an `Error` with message containing `"max_file_uncompressed_size"`

#### Scenario: Per-file limit disabled
- **WHEN** `unzip()` is called with `{ maxFileUncompressedSize: 0 }`
- **THEN** the per-file size check SHALL be skipped

### Requirement: Compression ratio limit
The `unzip()` function SHALL reject entries with a compression ratio (`uncompressedSize / compressedSize`) exceeding the `maxCompressionRatio` limit (default: 200).

#### Scenario: Entry exceeds compression ratio
- **WHEN** a ZIP entry has `uncompressedSize / compressedSize > maxCompressionRatio`
- **THEN** it throws an `Error` with message containing `"max_compression_ratio"`

#### Scenario: Suspicious zero-compressed metadata
- **WHEN** a ZIP entry has `compressedSize === 0` and `uncompressedSize > 0`
- **THEN** it throws an `Error` with message containing `"suspicious compression metadata"`

#### Scenario: Compression ratio disabled
- **WHEN** `unzip()` is called with `{ maxCompressionRatio: null }`
- **THEN** all compression ratio checks SHALL be skipped (including suspicious metadata detection)

### Requirement: Limits are checked incrementally
Safety limits SHALL be checked entry-by-entry during extraction, NOT after full decompression. If a limit is violated, extraction MUST stop immediately without processing further entries.

#### Scenario: Early termination on violation
- **WHEN** the 3rd entry in a 100-entry archive violates a limit
- **THEN** extraction stops after examining the 3rd entry; entries 4-100 are not read

### Requirement: ZIP creation utility
The `createZip(entries)` function SHALL create a ZIP archive from an array of `ZipEntryInput` objects (each with `fileName: string` and `content: Buffer | Uint8Array`) and return the archive as a `Promise<Buffer>`.

#### Scenario: Create archive from entries
- **WHEN** `createZip()` is called with `[{ fileName: "a.xml", content: Buffer.from("...") }]`
- **THEN** it returns a `Buffer` containing a valid ZIP archive with one entry named `"a.xml"`

#### Scenario: Created archive is extractable
- **WHEN** a ZIP is created with `createZip()` and then extracted with `unzip()`
- **THEN** the extracted files match the original inputs exactly

### Requirement: UnzipOptions interface
The `UnzipOptions` interface SHALL expose four optional fields:
- `maxFiles?: number` — max file count (default 10,000; `0` disables)
- `maxTotalUncompressedSize?: number` — max total bytes (default 2,000,000,000; `0` disables)
- `maxFileUncompressedSize?: number` — max per-file bytes (default 500,000,000; `0` disables)
- `maxCompressionRatio?: number | null` — max ratio (default 200; `null` disables)

#### Scenario: Default options applied when none provided
- **WHEN** `unzip()` is called without an options argument
- **THEN** all four limits SHALL use their default values

#### Scenario: Partial options merge with defaults
- **WHEN** `unzip()` is called with `{ maxFiles: 50 }` only
- **THEN** `maxFiles` is 50 and all other limits use their defaults

### Requirement: Public API exports
`unzip`, `createZip`, `UnzipOptions`, and `ZipEntryInput` SHALL be exported from the library's public API (`src/index.ts`).

#### Scenario: Importable from package root
- **WHEN** a consumer imports `{ unzip, createZip }` from the package
- **THEN** both functions are available and callable
