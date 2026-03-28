## 1. Types

- [x] 1.1 Add `BatchPartStreamSendingInfo` interface to `src/models/sessions/batch-types.ts` with `dataStream: ReadableStream<Uint8Array>`, `metadata: FileMetadata`, `ordinalNumber: number`
- [x] 1.2 Export the new type from `src/models/sessions/index.ts` barrel

## 2. Crypto — Stream Primitives

- [x] 2.1 Add `encryptAES256Stream(input: ReadableStream<Uint8Array>, key: Uint8Array, iv: Uint8Array): ReadableStream<Uint8Array>` to `CryptographyService` — wrap `node:crypto` Cipher in a `TransformStream` (transform: `cipher.update()`, flush: `cipher.final()`)
- [x] 2.2 Add `getFileMetadataFromStream(stream: ReadableStream<Uint8Array>): Promise<FileMetadata>` to `CryptographyService` — incremental SHA-256 hash + byte count via `node:crypto` Hash
- [x] 2.3 Write unit tests for `encryptAES256Stream`: verify output matches `encryptAES256()` for same input/key/iv, test multi-chunk input, test empty-ish input (single AES block)
- [x] 2.4 Write unit tests for `getFileMetadataFromStream`: verify output matches `getFileMetadata()`, test multi-chunk stream, verify stream is consumed after call

## 3. Builder — Stream Splitting

- [x] 3.1 Add static `BatchFileBuilder.buildFromStream(zipStreamFactory: () => ReadableStream<Uint8Array>, zipSize: number, encryptStreamFn: (stream: ReadableStream<Uint8Array>) => ReadableStream<Uint8Array>, options?: BatchFileBuildOptions): Promise<BatchStreamBuildResult>` — two-pass: hash ZIP stream, then split fresh stream into parts, encrypt each, compute per-part metadata
- [x] 3.2 Add `BatchStreamBuildResult` type to `src/builders/batch-file.ts` with `batchFile: BatchFileInfo` and `streamParts: BatchPartStreamSendingInfo[]`
- [x] 3.3 Write unit tests for `buildFromStream`: correct split count, correct hashes match buffer-based build, validation errors (empty, >5GB, >50 parts), custom maxPartSize

## 4. Service — Stream Upload

- [x] 4.1 Add `sendPartsWithStream(openResponse: OpenBatchSessionResponse, parts: BatchPartStreamSendingInfo[]): Promise<void>` to `BatchSessionService` — sequential `for` loop, pass `part.dataStream` as `fetch()` body
- [x] 4.2 Write unit tests for `sendPartsWithStream`: verify sequential upload (not concurrent), verify ordinal mismatch throws, verify correct headers are set

## 5. Workflow — Stream Pipeline

- [x] 5.1 Add `uploadBatchStream(client: KSeFClient, zipStreamFactory: () => ReadableStream<Uint8Array>, zipSize: number, options?: BatchUploadOptions): Promise<BatchUploadResult>` to `src/workflows/batch-session-workflow.ts` — init crypto, hash pass, split+encrypt pass, open session, sequential upload, close, poll UPO
- [x] 5.2 Add `uploadBatchStreamParsed()` variant that parses UPO pages
- [x] 5.3 Re-export `uploadBatchStream`, `uploadBatchStreamParsed`, and `BatchStreamBuildResult` from `src/workflows/index.ts`
- [x] 5.4 Write unit tests for `uploadBatchStream`: mock client, verify call sequence (init→hash→split→open→upload→close→poll), verify result structure matches `uploadBatch()`

## 6. CLI

- [x] 6.1 Add `--stream` boolean option to `ksef invoice send` command in `src/cli/commands/invoice.ts`
- [x] 6.2 When `--stream` is set: `fs.stat()` for size, create factory `() => Readable.toWeb(createReadStream(path))`, call `uploadBatchStream()`
- [x] 6.3 Error when `--stream` is used without a `.zip` file path

## 7. Integration Verification

- [x] 7.1 Run `yarn lint` — type-check passes with no errors
- [x] 7.2 Run `yarn test` — all existing + new unit tests pass
