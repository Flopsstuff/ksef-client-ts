## Why

The `exportAndDownload()` workflow returns decrypted ZIP parts as raw `Uint8Array[]` without extraction. Consumers must reassemble and extract the ZIP themselves with no safety checks. A malicious or corrupted KSeF export package could trigger a ZIP bomb — exhausting memory or disk via excessive file count, decompressed size, or extreme compression ratios. All four reference implementations address this; smekcio has the most complete solution with configurable limits and ratio detection.

## What Changes

- Add a safe ZIP extraction utility (`unzip`) that validates archive contents before fully decompressing:
  - File count limit (default 10,000)
  - Total uncompressed size limit (default 2 GB)
  - Per-file uncompressed size limit (default 500 MB)
  - Compression ratio limit (default 200:1) with suspicious metadata detection
- Add a ZIP creation utility (`createZip`) for building archives from in-memory entries
- Extend `exportAndDownload()` to optionally extract the ZIP and return named files instead of raw byte arrays
- All limits are configurable; protection can be bypassed by setting limits to `0` / `null`

## Capabilities

### New Capabilities
- `zip-safety`: Safe ZIP extraction and creation utilities with bomb protection (file count, size, ratio limits)

### Modified Capabilities
_(none — the export workflow integration is an implementation detail, not a spec-level requirement change)_

## Impact

- **New file**: `src/utils/zip.ts` — extraction/creation utilities
- **New dependency**: `yauzl` (extraction) + `yazl` (creation) — lightweight, well-maintained, used by smekcio reference
- **Modified**: `src/workflows/invoice-export-workflow.ts` — add `extract` option to `exportAndDownload()`
- **Modified**: `src/workflows/types.ts` — new `ExportExtractedResult` type with named files
- **Tests**: unit tests for all limit checks + ratio detection + happy path
- **No breaking changes**: existing `exportAndDownload()` return type unchanged when `extract` is not set
