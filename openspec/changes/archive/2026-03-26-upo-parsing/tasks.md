## 1. Test Fixtures

- [x] 1.1 Create `tests/fixtures/upo/` directory and copy 6 UPO XML examples from `ref/ksef-docs/faktury/upo/przyklady/v4-3/` (kontekst-nip single + session, kontekst-internal-id single + session, kontekst-id-zlozony-vat-ue single + session)
- [x] 1.2 Create additional malformed XML fixtures for error tests: missing root element, missing required field, empty string field, no Dokument elements, unsupported context type, invalid numeric OpisPotwierdzenia

## 2. UPO Types & Parser Core

- [x] 2.1 Create `src/xml/upo-parser.ts` with type definitions: `UpoContextId` (discriminated union, 4 variants), `UpoAuthProof` (discriminated union, 2 variants), `UpoUwierzytelnienie`, `UpoOpisPotwierdzenia`, `UpoDokument`, `UpoPotwierdzenie`
- [x] 2.2 Implement validation helper functions in `src/xml/upo-parser.ts`: `requireString`, `requireRecord`, `optionalRecord`, `requireNumberFromString`, `ensureArray` — all throwing `KSeFValidationError` with field path context
- [x] 2.3 Implement internal parsers: `parseIdKontekstu(obj)` (4 variant detection), `parseProof(obj)` (2 variant detection), `parseOpisPotwierdzenia(obj)` (optional, numeric fields), `parseDokument(obj)` (8 required string fields)
- [x] 2.4 Implement main `parseUpoXml(xml: string | Buffer): UpoPotwierdzenie` function with `fast-xml-parser` v5 XMLParser configured per D5 (removeNSPrefix, parseTagValue:false), Buffer→UTF-8 decoding, root element validation

## 3. Module Wiring & Exports

- [x] 3.1 Create `src/xml/index.ts` barrel exporting all types and `parseUpoXml` from `./upo-parser.js`
- [x] 3.2 Add `export * from './xml/index.js'` to `src/index.ts`

## 4. Unit Tests

- [x] 4.1 Create `tests/unit/xml/upo-parser.test.ts` with happy-path tests: parse single-invoice NIP UPO, parse multi-document session UPO, parse Buffer input, verify namespace prefix stripping
- [x] 4.2 Add context identifier variant tests: NIP, IdWewnetrzny, IdZlozonyVatUE, IdDostawcyUslugPeppol — one test per fixture file
- [x] 4.3 Add auth proof variant tests: NumerReferencyjnyTokenaKSeF, SkrotDokumentuUwierzytelniajacego
- [x] 4.4 Add OpisPotwierdzenia tests: present with correct numeric parsing, absent → undefined
- [x] 4.5 Add error/validation tests: missing root, missing required field, empty string, no documents, unsupported context, invalid numeric field
- [x] 4.6 Add array normalization test: single Dokument → array of 1, multiple Dokument → array of N

## 5. Workflow Integration

- [x] 5.1 Add `ParsedUpoInfo` interface (extends `UpoInfo` with `parsed: UpoPotwierdzenie[]`) to `src/workflows/types.ts`, add `waitForUpoParsed` to `OnlineSessionHandle` interface
- [x] 5.2 Implement `waitForUpoParsed()` in `src/workflows/online-session-workflow.ts`: call `waitForUpo()`, download each UPO page XML via `client.sessionStatus.getSessionUpo()`, parse each with `parseUpoXml()`, return `ParsedUpoInfo`
- [x] 5.3 Add `ParsedBatchUploadResult` type and implement parsed UPO support in `src/workflows/batch-session-workflow.ts`
- [x] 5.4 Export new types from `src/workflows/index.ts`

## 6. CLI `--parsed` Flag

- [x] 6.1 Add `--parsed` boolean option to `ksef session upo` command in `src/cli/commands/session.ts`
- [x] 6.2 Implement parsed branch: when `--parsed` is set, call `parseUpoXml()` on fetched XML, output `JSON.stringify(result, null, 2)` to stdout or file via `-o`

## 7. Build & Verify

- [x] 7.1 Run `yarn build` — verify clean compilation with no type errors
- [x] 7.2 Run `yarn lint` — verify `tsc --noEmit` passes
- [x] 7.3 Run `yarn test` — verify all existing + new unit tests pass
