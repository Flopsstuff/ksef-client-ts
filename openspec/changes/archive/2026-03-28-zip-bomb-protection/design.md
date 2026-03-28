## Context

`exportAndDownload()` returns `decryptedParts: Uint8Array[]` — raw decrypted ZIP part buffers. Consumers must concatenate and extract these themselves. There is no ZIP extraction in production code today; `jszip` exists only in devDependencies for E2E test fixtures.

The smekcio reference implementation provides a proven pattern: a standalone `unzip()` function with configurable safety limits, used transparently in the export workflow. We follow this pattern closely.

## Goals / Non-Goals

**Goals:**
- Provide safe ZIP extraction with configurable bomb protection limits
- Provide ZIP creation for building archives from in-memory entries (needed by batch workflows, future invoice XML serialization)
- Integrate extraction into `exportAndDownload()` via an opt-in `extract` flag
- Export utilities publicly so library consumers can use them independently

**Non-Goals:**
- Streaming extraction to disk (all extraction is in-memory; streaming is a separate future concern)
- Replacing the existing `jszip` usage in tests (it stays as a devDependency for fixture generation)
- ZIP encryption/password protection (KSeF uses AES-256-CBC at the transport layer, not within ZIP)

## Decisions

### 1. Library choice: yauzl + yazl

**Decision**: Use `yauzl` for extraction and `yazl` for creation.

**Alternatives considered**:
- **jszip** — already in devDependencies, simpler API. Rejected: synchronous decompression makes it impossible to check limits entry-by-entry before full extraction. Also bundles both zip/unzip which inflates production size.
- **adm-zip** — simpler but loads entire archive into memory before parsing, defeating bomb protection.
- **Node.js zlib only** — raw deflate/inflate. Would require implementing ZIP format parsing from scratch.

**Rationale**: yauzl processes entries lazily (one at a time via `readEntry()`), letting us enforce limits incrementally. It's the same choice smekcio made. yazl is its counterpart for creation. Both are well-maintained, have zero dependencies, and are the recommended ZIP libraries in the Node.js ecosystem.

### 2. File placement: `src/utils/zip.ts`

**Decision**: New `src/utils/` directory with `zip.ts` and barrel `index.ts`.

**Rationale**: ZIP utilities are general-purpose, not tied to a specific service or workflow. `src/utils/` is the natural home. The barrel re-export from `src/index.ts` makes `unzip`, `createZip`, `UnzipOptions`, and `ZipEntryInput` publicly available.

### 3. Error handling: throw plain `Error` (not `KSeFError`)

**Decision**: ZIP bomb violations throw standard `Error` with descriptive messages.

**Alternatives considered**:
- Custom `KSeFZipBombError` subclass — over-engineering for a utility that may be used outside KSeF context.
- `KSeFValidationError` — semantically wrong; this is a security check, not input validation.

**Rationale**: These are infrastructure-level safety checks, not KSeF API errors. A descriptive message like `"zip exceeds max_total_uncompressed_size"` is sufficient. Consumers can catch by message or instanceof `Error`.

### 4. Integration into export workflow: opt-in `extract` option

**Decision**: Add an `extract` option to `ExportAndDownloadOptions`. When set, `exportAndDownload()` concatenates decrypted parts, extracts the ZIP, and returns an `ExportExtractedResult` with a `files: Map<string, Uint8Array>` field.

**Return type approach**: Overloaded signatures — `exportAndDownload(client, filters, { extract: true })` returns `ExportExtractedResult`, without `extract` returns `ExportDownloadResult` as before. This preserves backward compatibility.

**Alternatives considered**:
- Separate `exportAndExtract()` function — cleaner but duplicates the download logic.
- Always extract — breaking change, and sometimes consumers want raw parts.

### 5. Default limits: match smekcio

| Limit | Default | Rationale |
|-------|---------|-----------|
| `maxFiles` | 10,000 | KSeF exports are invoice collections; 10K is generous |
| `maxTotalUncompressedSize` | 2 GB | Prevents memory exhaustion on typical Node.js heaps |
| `maxFileUncompressedSize` | 500 MB | Single invoice XML should never be this large |
| `maxCompressionRatio` | 200 | ZIP bombs typically have ratios of 1000:1+ |

All limits are optional. Pass `0` to disable a specific limit, or `maxCompressionRatio: null` to skip ratio checks entirely.

### 6. Compression ratio edge case: zero compressed size

**Decision**: If `compressedSize === 0` and `uncompressedSize > 0`, reject with `"zip entry has suspicious compression metadata"`.

**Rationale**: This is a known ZIP bomb indicator — stored metadata claims large uncompressed size but zero compressed bytes. Follows smekcio's approach.

## Risks / Trade-offs

**[Risk] yauzl callback-based API is verbose** → Wrap in a Promise-based function. The `unzip()` function returns `Promise<Map<string, Buffer>>`, hiding the callback complexity.

**[Risk] Memory usage for large legitimate exports** → All extraction is in-memory. For truly massive exports (near the 2 GB limit), consumers should reduce `maxTotalUncompressedSize` or process parts individually. Stream-to-disk extraction is a future enhancement (non-goal for this change).

**[Risk] New production dependencies (yauzl + yazl)** → Both are zero-dependency, well-audited packages widely used in the Node.js ecosystem. Combined size is ~50 KB. The `@types/yauzl` package provides TypeScript types.

**[Trade-off] Overloaded return type for `exportAndDownload()`** → TypeScript overloads add complexity but preserve full backward compatibility. The alternative (separate function) would duplicate download logic.
