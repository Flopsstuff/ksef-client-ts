# FA(2) → FA(3) Migration Plan

## Context

Since February 1, 2026, KSeF requires the FA(3) invoice schema. FA(2) is no longer accepted.
The codebase currently hardcodes `FA (2)` in two CLI commands. The library layer is clean — `FormCode` is passed as a parameter.

Key FA(3) changes: attachments support (up to 3 MB), expanded field lengths (name 512 chars, IBAN 34 chars), mandatory currency code, new contractor type "Employee", payment terms as day count.

---

## Scope

### 1. Update hardcoded `formCode` in CLI — **2 files**

| File | Line | Current | Target |
|---|---|---|---|
| `src/cli/commands/session.ts` | 46 | `'FA (2)'` | `'FA (3)'` |
| `src/cli/commands/invoice.ts` | 113 | `'FA (2)'` | `'FA (3)'` |

Both use `schemaVersion: '1-0E'` and `value: 'FA'` — these stay the same.

### 2. Extract `formCode` default to config — **optional improvement**

Instead of hardcoding in each CLI command, define a shared default:

```typescript
// src/config/defaults.ts (or add to options.ts)
export const DEFAULT_FORM_CODE: FormCode = {
  systemCode: 'FA (3)',
  schemaVersion: '1-0E',
  value: 'FA',
};
```

Then import it in both CLI commands. This makes future schema changes a one-line edit.

### 3. Add `--schema` CLI flag — **optional improvement**

Allow overriding the form code system code from CLI for edge cases (e.g. testing with FA(2)):

```
ksef session open --schema "FA (2)"
ksef invoice send dir/ --schema "FA (2)"
```

Default: `FA (3)`.

### 4. Update tests — **if they exist**

No tests currently reference `FA (2)` directly (checked via grep). Unit tests for CLI commands are not yet written (per testing-plan.md). No test changes needed now, but future CLI tests should use `FA (3)`.

### 5. Update OpenAPI spec — **verify**

Current `docs/open-api.json` already contains `"systemCode": "FA (3)"` in most endpoints. One legacy reference to `FA (2)` exists (line ~7148). Verify whether this reflects the actual API or is stale.

---

## Tasks

- [ ] **T1**: Change `'FA (2)'` → `'FA (3)'` in `src/cli/commands/session.ts:46`
- [ ] **T2**: Change `'FA (2)'` → `'FA (3)'` in `src/cli/commands/invoice.ts:113`
- [ ] **T3**: Extract `DEFAULT_FORM_CODE` constant to `src/config/options.ts`
- [ ] **T4**: Import and use `DEFAULT_FORM_CODE` in both CLI commands
- [ ] **T5** *(optional)*: Add `--schema` flag to `session open` and `invoice send`
- [ ] **T6**: Run `yarn build && yarn lint && yarn test` — confirm no regressions
- [ ] **T7**: Verify `docs/open-api.json` FA(2) reference is expected or update it

---

## Risk Assessment

**Low risk.** The change is mechanical — two string literals in CLI code. The library layer already accepts `FormCode` as a parameter, so no API surface changes. The `schemaVersion` and `value` fields are identical between FA(2) and FA(3).

## Notes

- FA(3) corrective invoices must use FA(3) even if the original was FA(2) — the API enforces this server-side
- Attachment support (new in FA(3)) is a separate feature and not part of this migration
