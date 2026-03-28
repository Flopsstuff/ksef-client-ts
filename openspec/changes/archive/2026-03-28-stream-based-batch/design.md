## Context

The batch upload pipeline currently operates entirely in memory: `BatchFileBuilder.build()` takes a `Uint8Array` ZIP, splits it into parts (up to 100 MB each), encrypts each part via `encryptAES256()`, and produces `Uint8Array[]` encrypted parts. The workflow then wraps each into `BatchPartSendingInfo` (with `data: ArrayBuffer`) and uploads all parts concurrently via `Promise.all()`.

For a 500 MB ZIP split into 5 parts, peak memory holds the original ZIP + all 5 encrypted parts simultaneously (~1 GB). The C# and Java official references solve this with `BatchPartStreamSendingInfo` — a stream-based alternative where data flows through encryption and upload without full buffering.

Node.js 18+ provides Web Streams API (`ReadableStream`, `TransformStream`) and `fetch()` accepts `ReadableStream` as request body natively (via undici). The `node:crypto` cipher objects are Node.js streams that can be wrapped in Web `TransformStream`.

## Goals / Non-Goals

**Goals:**
- Constant memory usage during batch upload regardless of part size
- Stream-based AES-256-CBC encryption and SHA-256 hashing on `CryptographyService`
- Stream-based split + encrypt builder as alternative to `BatchFileBuilder.build()`
- `uploadBatchStream()` workflow with identical return type to `uploadBatch()`
- CLI `--stream` flag on `ksef session batch`
- No changes to existing in-memory API surface

**Non-Goals:**
- Streaming ZIP creation (callers still provide a ZIP stream or file; we don't build ZIPs from invoice streams)
- Parallel stream uploads (defeats memory goal; future P4.6 can add this for the buffer path)
- Stream-based batch _download_ or export (separate concern)
- Backpressure tuning or high-water mark configuration (use defaults)

## Decisions

### D1: Web Streams API, not Node.js streams

Use `ReadableStream<Uint8Array>` and `TransformStream` from the Web Streams API (globally available in Node 18+), not `node:stream.Readable/Transform`.

**Rationale:** `fetch()` natively accepts `ReadableStream` as body. Node.js streams would require conversion (`Readable.toWeb()`). Web Streams are the platform standard going forward and align with our existing `fetch()`-based HTTP layer. The `node:crypto` cipher can be wrapped in a `TransformStream` with minimal glue code.

**Alternative considered:** Node.js `stream.pipeline()` with `node:crypto` Transform — lower-level, better backpressure, but requires conversion for `fetch()` and introduces a second streaming paradigm into the codebase.

### D2: Two-pass split strategy (hash pass + encrypt-and-upload pass)

The stream builder must compute the ZIP's SHA-256 hash _before_ opening the session (it goes in `OpenBatchSessionRequest.batchFile.fileHash`). This requires reading the ZIP stream once for hashing. Since streams are single-use, the builder needs a way to read the data twice.

**Approach:** The `uploadBatchStream()` workflow requires callers to provide `zipSize` and will:
1. **Pass 1** — consume the ZIP stream to compute `fileHash` via `getFileMetadataFromStream()`. Since the caller provides `zipSize`, we validate it matches. The stream is consumed.
2. **Re-create the stream** — the workflow accepts a factory function `() => ReadableStream<Uint8Array>` instead of a bare stream. This lets us re-read the source (e.g., re-open the file). The CLI creates this factory from `fs.createReadStream()`.
3. **Pass 2** — split the fresh stream into fixed-size parts, encrypt each part as a stream, compute each encrypted part's metadata, and produce `BatchPartStreamSendingInfo[]`.

**Rationale:** A factory function is the cleanest way to handle two-pass processing. The C# reference uses `MemoryStream` with `Position = 0` (resettable), but Web `ReadableStream` is not resettable. A factory is the idiomatic JS equivalent.

**Alternative considered:** Single-pass with `tee()` — one branch hashes, the other buffers for splitting. But `tee()` buffers internally when branches read at different rates, defeating the memory goal. Also considered requiring the caller to pre-compute `fileHash`, but that pushes complexity to every call site.

**Signature change:** `uploadBatchStream(client, zipStreamFactory, zipSize, options)` where `zipStreamFactory: () => ReadableStream<Uint8Array>`.

### D3: Sequential part upload

Upload parts one at a time in a `for` loop, not with `Promise.all()`.

**Rationale:** The whole point of streaming is constant memory. Concurrent uploads would require multiple streams open simultaneously. The existing `sendParts()` uses `Promise.all()` (concurrent) — that's fine for in-memory buffers. The stream variant prioritizes memory over throughput.

### D4: TransformStream wrapper for node:crypto cipher

`encryptAES256Stream()` creates a `TransformStream` that wraps a `node:crypto` `Cipher` object:
- `transform(chunk)`: call `cipher.update(chunk)` and enqueue the result
- `flush()`: call `cipher.final()` and enqueue (PKCS7 padding block)

This produces a `TransformStream` that the source `ReadableStream` can be piped through: `sourceStream.pipeThrough(encryptTransform)`.

**Rationale:** Clean composition. The caller gets back a `ReadableStream` that lazily pulls from the source and encrypts on-the-fly. No buffering, no callbacks.

### D5: Stream splitting via fixed-size chunking with internal buffering

To split a stream into N parts of `maxPartSize` bytes, we read chunks from the source and accumulate into an internal buffer until `maxPartSize` is reached, then yield that buffer as one part's `ReadableStream`. The last part gets whatever remains.

**Approach:** `splitStream()` is an async generator that yields `{ partStream: ReadableStream, partSize: number }` for each part. Internally it reads from the source reader and builds each part. Since each part must be independently encrypted and hashed, the part data is buffered in memory (up to `maxPartSize` per part, processed one at a time).

**Rationale:** True zero-copy stream splitting (where each part is a live sub-stream of the source) requires complex coordination between the splitter, encryptor, and hasher. Buffering one part at a time (up to 100 MB) is the same peak memory as the existing approach for a single part but avoids holding all parts simultaneously. The C# and Java references also buffer per-part (`MemoryStream` / `ByteArrayOutputStream`).

**Memory profile comparison:**
- Current: O(zip_size + all_encrypted_parts) — can be ~2× total size
- Stream: O(max_part_size) — at most 100 MB at any point (one raw part being processed)

### D6: Files touched and export surface

| File | Change |
|------|--------|
| `src/models/sessions/batch-types.ts` | Add `BatchPartStreamSendingInfo` interface |
| `src/crypto/cryptography-service.ts` | Add `encryptAES256Stream()`, `getFileMetadataFromStream()` |
| `src/builders/batch-file.ts` | Add static `BatchFileBuilder.buildFromStream()` |
| `src/services/batch-session.ts` | Add `sendPartsWithStream()` |
| `src/workflows/batch-session-workflow.ts` | Add `uploadBatchStream()`, `uploadBatchStreamParsed()` |
| `src/workflows/index.ts` | Re-export new workflow functions and types |
| `src/cli/commands/session.ts` | Add `--stream` option to batch subcommand |

No new files — all additions go into existing modules to avoid file bloat.

## Risks / Trade-offs

**[R1] Per-part buffering is not true streaming** → Accepted trade-off. True per-chunk streaming through split→encrypt→hash→upload would require complex async coordination (the hash needs to see all bytes before the upload can set headers with the hash). The per-part buffer approach is what C# and Java do, and reduces peak memory from O(total) to O(max_part_size).

**[R2] `fetch()` streaming body support varies** → Node.js 18.13+ (undici) supports `ReadableStream` as `fetch()` body. Our minimum is Node 18+, so this should work. Mitigation: unit test that `fetch()` accepts a stream body; document Node 18.13+ as the effective minimum for the stream path.

**[R3] Two-pass requires stream factory** → Callers must provide `() => ReadableStream` instead of a bare stream. This is slightly more complex API. Mitigation: the CLI handles this transparently; programmatic callers using files can use the same `() => Readable.toWeb(createReadStream(path))` pattern. Document clearly.

**[R4] AES-CBC cipher state is sequential** → Each `cipher.update()` call depends on the previous block's output (CBC chaining). This means we can't parallelize encryption within a part. Not a concern — we process chunks sequentially within each part's stream, which is the natural flow.

## Open Questions

_(none — all key decisions resolved)_
