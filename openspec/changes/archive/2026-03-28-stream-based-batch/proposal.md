## Why

The current batch upload pipeline loads entire ZIP parts (up to 100 MB each) into `ArrayBuffer` in memory before encryption and upload. For large batches (up to 5 GB / 50 parts), this means peak memory usage can reach hundreds of megabytes. Both official reference implementations (C# and Java) provide a stream-based alternative (`BatchPartStreamSendingInfo`) that keeps memory usage constant regardless of part size. Adding stream-based batch upload makes the library viable for server-side and memory-constrained environments processing large invoice volumes.

## What Changes

- New `BatchPartStreamSendingInfo` type using `ReadableStream<Uint8Array>` instead of `ArrayBuffer` for part data
- New `sendPartsWithStream()` method on `BatchSessionService` that uploads parts from streams via `fetch()` with streaming body
- New stream-based splitting utility that reads a ZIP stream in chunks, encrypts each chunk, and produces stream-based parts
- New `uploadBatchStream()` workflow function as a stream-based alternative to `uploadBatch()`
- Stream-based AES-256-CBC encryption in `CryptographyService` (encrypt from readable stream to readable stream)
- Stream-based SHA-256 hashing in `CryptographyService` (hash a readable stream without buffering)
- CLI `ksef session batch` gains a `--stream` flag to use the stream-based pipeline for file inputs
- Existing in-memory `BatchPartSendingInfo` / `sendParts()` / `uploadBatch()` remain unchanged (no breaking changes)

## Capabilities

### New Capabilities

- `stream-batch-upload`: Stream-based batch part splitting, encryption, hashing, and upload with constant memory usage

### Modified Capabilities

_(none -- existing in-memory batch pipeline is preserved as-is)_

## Impact

- **Code**: `src/services/batch-session.ts`, `src/builders/batch-file.ts`, `src/crypto/cryptography.ts`, `src/workflows/batch-session-workflow.ts`, `src/models/sessions/batch-types.ts`, `src/cli/commands/session.ts`
- **APIs**: New public methods on `BatchSessionService` and `CryptographyService`; new workflow export. No changes to existing public APIs.
- **Dependencies**: Node.js 18+ `ReadableStream` / Web Streams API (already available, no new deps)
- **Testing**: Unit tests for stream splitting, stream encryption, stream hashing; integration test for full stream upload pipeline
