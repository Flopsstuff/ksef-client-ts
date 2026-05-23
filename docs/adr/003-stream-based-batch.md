# ADR-003: Stream-Based Batch Upload

- **Date:** 2026-03-28
- **Status:** Accepted

## Context

The batch upload pipeline operated entirely in memory: `BatchFileBuilder.build()` takes a `Uint8Array` ZIP, splits into parts (up to 100 MB each), encrypts each part, and produces `Uint8Array[]` encrypted parts. For a 500 MB ZIP split into 5 parts, peak memory holds the original ZIP + all 5 encrypted parts (~1 GB).

The C# and Java official references solve this with `BatchPartStreamSendingInfo` — a stream-based alternative where data flows through encryption and upload without full buffering.

## Decisions

### Web Streams API, not Node.js streams

Use `ReadableStream<Uint8Array>` and `TransformStream` from the Web Streams API (globally available in Node 18+).

**Key insight:** `fetch()` natively accepts `ReadableStream` as body. Node.js streams would require conversion (`Readable.toWeb()`). Web Streams are the platform standard and align with our `fetch()`-based HTTP layer.

**Rejected:** Node.js `stream.pipeline()` — lower-level, better backpressure, but requires conversion for `fetch()` and introduces a second streaming paradigm.

### Two-pass with factory function (not tee)

The ZIP's SHA-256 hash must be computed before opening the session. Since Web `ReadableStream` is single-use, the workflow accepts `() => ReadableStream<Uint8Array>` instead of a bare stream.

1. **Pass 1** — consume stream to compute `fileHash`
2. **Re-create** via factory function (e.g., re-open the file)
3. **Pass 2** — split, encrypt, upload

**Key insight:** C# uses `MemoryStream` with `Position = 0` (resettable), but Web `ReadableStream` is not resettable. A factory function is the idiomatic JS equivalent.

**Rejected:** `tee()` — buffers internally when branches read at different rates, defeating the memory goal. Pre-computing hash by caller — pushes complexity to every call site.

### Sequential part upload

Upload parts one at a time in a `for` loop, not with `Promise.all()`.

The whole point of streaming is constant memory. Concurrent uploads would require multiple streams open simultaneously. The in-memory path keeps `Promise.all()` for throughput — the stream variant prioritizes memory.

### TransformStream wrapper for node:crypto cipher

`encryptAES256Stream()` creates a `TransformStream` wrapping a `node:crypto` `Cipher`:

- `transform(chunk)`: `cipher.update(chunk)` -> enqueue
- `flush()`: `cipher.final()` -> enqueue (PKCS7 padding)

Clean composition: `sourceStream.pipeThrough(encryptTransform)` produces a `ReadableStream` that lazily pulls from source and encrypts on-the-fly.

### Per-part buffering (not true zero-copy streaming)

Each part (up to 100 MB) is buffered in memory to compute its hash before upload. True zero-copy would require complex async coordination (hash needs all bytes before upload can set headers).

**Memory profile:**

- In-memory path: O(zip_size + all_encrypted_parts) — can be ~2x total size
- Stream path: **O(max_part_size)** — at most 100 MB at any point

This matches the C# (`MemoryStream`) and Java (`ByteArrayOutputStream`) reference implementations.

### AES-CBC cipher state is sequential

Each `cipher.update()` depends on the previous block's output (CBC chaining). Encryption within a part cannot be parallelized. This is inherent to the algorithm and aligns with the sequential stream processing model.

## Risks

- **Per-part buffering is not true streaming** — Accepted. Reduces peak memory from O(total) to O(max_part_size). Same approach as C# and Java references.
- **`fetch()` streaming body support** — Requires Node.js 18.13+ (undici). Our minimum is Node 18+.
- **Factory function API complexity** — Slightly more complex than bare stream. CLI handles transparently; programmatic callers use `() => Readable.toWeb(createReadStream(path))`.
