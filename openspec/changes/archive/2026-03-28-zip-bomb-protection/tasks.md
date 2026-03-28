## 1. Dependencies

- [x] 1.1 Add `yauzl`, `yazl`, and `@types/yauzl` to package.json (`yarn add yauzl yazl && yarn add -D @types/yauzl`)

## 2. Core ZIP utilities

- [x] 2.1 Create `src/utils/zip.ts` with `UnzipOptions` interface, `ZipEntryInput` interface, and `DEFAULT_UNZIP_OPTIONS` constant
- [x] 2.2 Implement `unzip(buffer, options?)` — yauzl-based extraction with incremental limit checks (file count, total size, per-file size, compression ratio, suspicious metadata)
- [x] 2.3 Implement `createZip(entries)` — yazl-based archive creation from `ZipEntryInput[]`
- [x] 2.4 Create `src/utils/index.ts` barrel export

## 3. Public API exports

- [x] 3.1 Add `export * from './utils/index.js'` to `src/index.ts`

## 4. Export workflow integration

- [x] 4.1 Add `extract?: boolean` and `unzipOptions?: UnzipOptions` to `ExportAndDownloadOptions`
- [x] 4.2 Add `ExportExtractedResult` type to `src/workflows/types.ts` (extends `ExportResult` with `files: Map<string, Buffer>`)
- [x] 4.3 Add overloaded signatures to `exportAndDownload()` — returns `ExportExtractedResult` when `extract: true`, `ExportDownloadResult` otherwise
- [x] 4.4 Implement extraction logic: concatenate `decryptedParts`, call `unzip()` with options, return `ExportExtractedResult`

## 5. Unit tests

- [x] 5.1 Test `createZip()` — single entry, multiple entries, roundtrip with `unzip()`
- [x] 5.2 Test `unzip()` happy path — valid archive, empty archive, directory entries skipped
- [x] 5.3 Test `maxFiles` limit — exceeds default, custom limit, disabled with `0`
- [x] 5.4 Test `maxTotalUncompressedSize` — exceeds limit, disabled with `0`
- [x] 5.5 Test `maxFileUncompressedSize` — exceeds limit, disabled with `0`
- [x] 5.6 Test `maxCompressionRatio` — exceeds ratio, suspicious zero-compressed metadata, disabled with `null`
- [x] 5.7 Test incremental checking — early termination on violation
- [x] 5.8 Test default options merge — no options, partial options

## 6. Build & lint verification

- [x] 6.1 Run `yarn build` — verify ESM/CJS output includes new utils
- [x] 6.2 Run `yarn lint` — verify no type errors
- [x] 6.3 Run `yarn test` — verify all tests pass
