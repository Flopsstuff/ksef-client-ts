## Context

`KSeFUnauthorizedError` and `KSeFForbiddenError` were added in commit `4d6b63a` (transport layer upgrade). They are instantiated by `RestClient.ensureSuccess` for 401 and 403 responses respectively. Both are pure classes with no dependencies beyond `KSeFError` — constructor sets fields from a typed `ProblemDetails` object.

Existing error tests live in `tests/unit/errors/` with one file per error class (`ksef-api-error.test.ts`, `ksef-rate-limit-error.test.ts`) plus a shared `ksef-error.test.ts` for hierarchy and base classes.

## Goals / Non-Goals

**Goals:**
- 100% coverage of `KSeFUnauthorizedError` and `KSeFForbiddenError` constructors and field storage
- Verify inheritance chain (both extend `KSeFError`, not `KSeFApiError`)
- Verify `name` property is set correctly for each class
- Cover all `ForbiddenReasonCode` variants

**Non-Goals:**
- Testing `RestClient.ensureSuccess` dispatch logic (belongs in HTTP layer tests)
- Testing validation/config modules (already fully covered)
- Integration tests with real HTTP responses

## Decisions

**One test file per error class** — consistent with existing pattern (`ksef-api-error.test.ts`, `ksef-rate-limit-error.test.ts`). Two new files:
- `tests/unit/errors/ksef-unauthorized-error.test.ts`
- `tests/unit/errors/ksef-forbidden-error.test.ts`

**No mocking** — both classes are pure constructors. Pass `ProblemDetails` objects directly.

**Test all `ForbiddenReasonCode` values** — there are 5 reason codes (`missing-permissions`, `ip-not-allowed`, `insufficient-resource-access`, `auth-method-not-allowed`, `security-service-blocked`). Each should be verified as accepted by the constructor.

## Risks / Trade-offs

No risks — pure unit tests with no side effects, no mocking, no external dependencies.
