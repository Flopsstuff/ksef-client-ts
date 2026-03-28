## 1. Model Layer

- [x] 1.1 Create `src/models/document-structures/types.ts` with `SystemCode` const object + type, `FORM_CODES` (`as const satisfies`), `OnlineSessionFormCode` / `BatchSessionFormCode` unions, `INVOICE_TYPES_BY_SYSTEM_CODE` mapping, `FORM_CODE_KEYS` CLI mapping
- [x] 1.2 Create `src/models/document-structures/helpers.ts` with `getFormCode()`, `parseFormCode()`, `validateFormCodeForSession()`
- [x] 1.3 Create `src/models/document-structures/index.ts` barrel and add re-export in `src/models/index.ts`

## 2. Unit Tests

- [x] 2.1 Add tests for `SystemCode` values (5 members, correct wire format strings)
- [x] 2.2 Add tests for `FORM_CODES` constants (7 entries, correct field values, satisfy `FormCode` interface)
- [x] 2.3 Add tests for `getFormCode()` (all 5 system codes, FA_RR returns current variant)
- [x] 2.4 Add tests for `parseFormCode()` (exact match returns constant, FA_RR transition, unknown passthrough)
- [x] 2.5 Add tests for `validateFormCodeForSession()` (PEF invalid for batch, FA valid for both, all online accepted)
- [x] 2.6 Add tests for `INVOICE_TYPES_BY_SYSTEM_CODE` (correct types per system code)
- [x] 2.7 Add tests for `FORM_CODE_KEYS` (5 keys resolve correctly, case-sensitive)

## 3. Workflow Integration

- [x] 3.1 Replace `DEFAULT_FORM_CODE` in `src/workflows/online-session-workflow.ts` with `FORM_CODES.FA_2` import
- [x] 3.2 Replace `DEFAULT_FORM_CODE` in `src/workflows/batch-session-workflow.ts` with `FORM_CODES.FA_2` import

## 4. CLI Integration

- [x] 4.1 Add `--form-code` option to `ksef session open` in `src/cli/commands/session.ts` — resolve via `FORM_CODE_KEYS`, validate key, replace inline FormCode object
- [x] 4.2 Add `--form-code` option to `ksef invoice send` in `src/cli/commands/invoice.ts` — resolve via `FORM_CODE_KEYS`, reject PEF for batch (directory) mode, replace inline FormCode objects
- [x] 4.3 Add CLI tests for `--form-code` validation (invalid key error, PEF batch rejection)

## 5. Cleanup

- [x] 5.1 Run `yarn lint` and `yarn test` — verify no regressions
