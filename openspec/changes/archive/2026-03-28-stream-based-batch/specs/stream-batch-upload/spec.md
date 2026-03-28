## ADDED Requirements

### Requirement: Stream-based batch part type

The system SHALL provide a `BatchPartStreamSendingInfo` interface that accepts a `ReadableStream<Uint8Array>` for part data instead of `ArrayBuffer`. The interface SHALL include `dataStream` (ReadableStream), `metadata` (FileMetadata with hashSHA and fileSize), and `ordinalNumber` (1-based index). This type SHALL coexist with the existing `BatchPartSendingInfo` — callers choose which to use.

#### Scenario: Type structure matches reference implementations
- **WHEN** a developer imports `BatchPartStreamSendingInfo` from the batch types module
- **THEN** the type SHALL have properties `dataStream: ReadableStream<Uint8Array>`, `metadata: FileMetadata`, and `ordinalNumber: number`

#### Scenario: Existing type unchanged
- **WHEN** a developer uses the existing `BatchPartSendingInfo` interface
- **THEN** it SHALL continue to accept `data: ArrayBuffer` with no changes

---

### Requirement: Stream-based part upload

`BatchSessionService` SHALL provide a `sendPartsWithStream()` method that uploads batch parts from `ReadableStream<Uint8Array>` sources. The method SHALL match each stream part to its presigned upload request by `ordinalNumber`, set the required headers, and pass the `ReadableStream` directly as the `fetch()` request body. Parts SHALL be uploaded sequentially (one at a time) to maintain constant memory usage.

#### Scenario: Upload stream parts to presigned URLs
- **WHEN** `sendPartsWithStream()` is called with an `OpenBatchSessionResponse` and an array of `BatchPartStreamSendingInfo`
- **THEN** each part's `dataStream` SHALL be sent via `fetch()` to the matching presigned URL with the correct HTTP method and headers

#### Scenario: Part ordinal mismatch throws error
- **WHEN** a `BatchPartStreamSendingInfo` has an `ordinalNumber` that does not match any `partUploadRequests` entry
- **THEN** the method SHALL throw an Error indicating the missing upload request

#### Scenario: Sequential upload preserves memory bound
- **WHEN** multiple stream parts are uploaded
- **THEN** they SHALL be uploaded one at a time (not concurrently), so only one stream is consumed at a time

---

### Requirement: Stream-based AES-256-CBC encryption

`CryptographyService` SHALL provide an `encryptAES256Stream()` method that accepts a `ReadableStream<Uint8Array>`, an AES-256 key, and an IV, and returns a new `ReadableStream<Uint8Array>` of AES-256-CBC encrypted data. The stream SHALL apply PKCS7 padding on finalization (via `cipher.final()`). The encryption SHALL process data in chunks as they arrive from the source stream, without buffering the entire input.

#### Scenario: Encrypt a stream
- **WHEN** `encryptAES256Stream(inputStream, key, iv)` is called
- **THEN** it SHALL return a `ReadableStream<Uint8Array>` that yields AES-256-CBC encrypted chunks with PKCS7 padding

#### Scenario: Output matches buffer-based encryption
- **WHEN** the same plaintext is encrypted with `encryptAES256()` (buffer) and `encryptAES256Stream()` (stream) using the same key and IV
- **THEN** the concatenated bytes from the stream output SHALL be identical to the buffer output

#### Scenario: Chunk-level processing
- **WHEN** a large input stream is encrypted
- **THEN** the method SHALL NOT buffer the entire input before producing output — encrypted chunks SHALL be yielded as source chunks are read

---

### Requirement: Stream-based SHA-256 hashing

`CryptographyService` SHALL provide a `getFileMetadataFromStream()` method that accepts a `ReadableStream<Uint8Array>` and returns a `Promise<FileMetadata>` containing the SHA-256 hash (base64) and total byte count. The method SHALL consume the stream incrementally without buffering the entire content.

#### Scenario: Hash a stream
- **WHEN** `getFileMetadataFromStream(stream)` is called
- **THEN** it SHALL return `{ hashSHA, fileSize }` where `hashSHA` is the base64-encoded SHA-256 digest and `fileSize` is the total byte count

#### Scenario: Output matches buffer-based hashing
- **WHEN** the same data is hashed with `getFileMetadata()` (buffer) and `getFileMetadataFromStream()` (stream)
- **THEN** both SHALL return identical `hashSHA` and `fileSize` values

#### Scenario: Stream is fully consumed
- **WHEN** `getFileMetadataFromStream()` completes
- **THEN** the input stream SHALL be fully consumed (locked and disturbed)

---

### Requirement: Stream-based ZIP splitting

The system SHALL provide a static method `BatchFileBuilder.buildFromStream()` that accepts a stream factory `(() => ReadableStream<Uint8Array>)`, the total ZIP size, a stream-to-stream encryption function, a stream-to-FileMetadata hashing function, and options. It SHALL split the stream into parts of `maxPartSize` bytes (default 100 MB), encrypt each part via the injected encryption function, compute SHA-256 metadata via the injected hashing function for both the original ZIP and each encrypted part, and return a `BatchStreamBuildResult` with `batchFile` metadata and an array of `BatchPartStreamSendingInfo`. The hashing and encryption functions are injected for testability and separation of concerns.

#### Scenario: Split and encrypt a ZIP stream
- **WHEN** `buildFromStream(zipStreamFactory, zipSize, encryptStreamFn, hashStreamFn, options)` is called
- **THEN** it SHALL produce `batchFile` metadata with correct `fileSize`, `fileHash`, and `fileParts` array, plus an array of `BatchPartStreamSendingInfo` with encrypted data streams

#### Scenario: Validate total size limit
- **WHEN** `zipSize` exceeds `BATCH_MAX_TOTAL_SIZE` (5 GB)
- **THEN** the method SHALL throw a `KSeFValidationError`

#### Scenario: Validate part count limit
- **WHEN** splitting produces more than `BATCH_MAX_PARTS` (50) parts
- **THEN** the method SHALL throw a `KSeFValidationError`

#### Scenario: Validate empty input
- **WHEN** `zipSize` is 0
- **THEN** the method SHALL throw a `KSeFValidationError`

#### Scenario: Custom max part size
- **WHEN** `options.maxPartSize` is set to a custom value
- **THEN** the splitting SHALL use that value instead of the default 100 MB

---

### Requirement: Stream-based batch upload workflow

The system SHALL export an `uploadBatchStream()` workflow function that orchestrates the full stream-based batch upload pipeline: init crypto, generate encryption data, split the ZIP stream into parts, encrypt each part, compute metadata, open a batch session, upload parts via streams, close the session, and poll for UPO. The function SHALL accept a `ReadableStream<Uint8Array>` and the total ZIP size (since stream size cannot be known in advance). It SHALL also accept `BatchUploadOptions` for configuring form code, UPO version, poll options, max part size, and offline mode.

#### Scenario: Full stream upload pipeline
- **WHEN** `uploadBatchStream(client, zipStream, zipSize, options)` is called
- **THEN** it SHALL return a `BatchUploadResult` with `sessionRef` and `upo` data, identical in structure to the result of `uploadBatch()`

#### Scenario: Requires explicit ZIP size
- **WHEN** `uploadBatchStream()` is called
- **THEN** the `zipSize` parameter SHALL be required (not optional), because the stream's total length cannot be determined without consuming it

#### Scenario: Parsed variant
- **WHEN** `uploadBatchStreamParsed(client, zipStream, zipSize, options)` is called
- **THEN** it SHALL return a `ParsedBatchUploadResult` with parsed UPO data, analogous to `uploadBatchParsed()`

---

### Requirement: CLI --stream flag for batch upload

The `ksef invoice send` CLI command SHALL accept a `--stream` flag. When this flag is set and the input is a `.zip` file path, the CLI SHALL read the file as a stream (using `fs.createReadStream()` converted to a Web ReadableStream via `Readable.toWeb()`) and use the `uploadBatchStream()` workflow instead of the default in-memory batch upload. The file size SHALL be obtained via `fs.stat()` before streaming. When `--stream` is not set, the existing in-memory behavior SHALL be preserved.

#### Scenario: Stream flag reads file as stream
- **WHEN** `ksef invoice send --stream invoice-batch.zip` is called
- **THEN** the CLI SHALL use `uploadBatchStream()` with a file-based ReadableStream and the file's byte size from `fs.stat()`

#### Scenario: Stream flag without a .zip file
- **WHEN** `ksef invoice send --stream` is called without a `.zip` file path (e.g. a directory, a non-zip file, or no argument)
- **THEN** the CLI SHALL report an error indicating that a `.zip` file path is required

#### Scenario: Default behavior preserved
- **WHEN** `ksef invoice send invoice-batch.zip` is called without `--stream`
- **THEN** the CLI SHALL use the existing in-memory batch upload workflow
