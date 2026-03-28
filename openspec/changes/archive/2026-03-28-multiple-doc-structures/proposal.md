## Why

The library currently treats `FormCode` as a loose `{ systemCode: string; schemaVersion: string; value: string }` with no typed variants, no validation, and an incorrect default (`{ systemCode: 'FA', schemaVersion: '3', value: 'FA (3)' }` instead of `{ systemCode: 'FA (3)', schemaVersion: '1-0E', value: 'FA' }`). All four reference implementations (Java 5 types, C# 5 + helper, smekcio 7 typed interfaces, lkow basic) provide structured document type support. Users must manually construct `FormCode` objects with magic strings, risking silent API errors from typos or invalid combinations.

## What Changes

- Add `SystemCode` enum with all 5 KSeF document types: `FA_2`, `FA_3`, `PEF_3`, `PEF_KOR_3`, `FA_RR_1`
- Add typed `FormCode` constant objects (7 variants including FA_RR legacy/transition/current) with compile-time literal types
- Add session-type constrained unions: `OnlineSessionFormCode` (all 7) vs `BatchSessionFormCode` (FA + FA_RR only, no PEF)
- Add `FormCodeHelper` with lookup by `SystemCode`, parsing from API response strings, and validation
- **BREAKING**: Fix incorrect `DEFAULT_FORM_CODE` in `OnlineSessionWorkflow` and `BatchSessionWorkflow` (was `{ systemCode: 'FA', schemaVersion: '3', value: 'FA (3)' }`, becomes `FORM_CODES.FA_2`)
- Update CLI session/invoice commands to accept `--form-code` option with human-friendly keys (`FA2`, `FA3`, `PEF3`, `PEFKOR3`, `FARR1`)
- Add `InvoiceFormCode` type mapping document types to their allowed `InvoiceType` subtypes (e.g., FA → Vat/Kor/Zal/..., PEF → VatPef/KorPef/..., RR → VatRr/KorVatRr)

## Capabilities

### New Capabilities
- `document-structures`: SystemCode enum, typed FormCode constants, session-type constraints, FormCodeHelper (lookup, parse, validate), InvoiceType-per-document mapping

### Modified Capabilities
- `cli-session`: Add `--form-code` option to `ksef session open` and `ksef session open-batch` commands (currently hardcoded to FA (2))
- `cli-invoice`: Add `--form-code` option to `ksef invoice send` for document type selection

## Impact

- **Models**: New `src/models/document-structures/` with types and constants
- **Workflows**: Fix `DEFAULT_FORM_CODE` in `online-session-workflow.ts` and `batch-session-workflow.ts` — **breaking** for users relying on the (incorrect) default
- **Builders**: Update `OpenOnlineSessionRequestBuilder` and `OpenBatchSessionRequestBuilder` to accept `SystemCode` in addition to raw `FormCode`
- **CLI**: `session.ts` and `invoice.ts` gain `--form-code` option
- **No new dependencies**
- **Existing `FormCode` interface preserved** — new types layer on top, no breaking change for users passing raw objects
