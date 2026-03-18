## Why

Validation, Errors, and Config modules already have substantial test coverage (patterns: ~70 tests, constraints: 7, errors: ~25, config: ~15), but two error classes — `KSeFUnauthorizedError` (401) and `KSeFForbiddenError` (403) — were added in the transport layer upgrade and have zero tests. These are part of the error hierarchy used by `RestClient.ensureSuccess` and need coverage to complete the "pure functions, no mocking" testing tier.

## What Changes

- Add unit tests for `KSeFUnauthorizedError`: constructor fields, default message, `statusCode`, inheritance chain, optional fields (`traceId`, `instance`)
- Add unit tests for `KSeFForbiddenError`: constructor fields, default message, `statusCode`, `reasonCode` variants, optional fields (`security`, `traceId`, `instance`), inheritance chain
- No source code changes — tests only

## Capabilities

### New Capabilities

- `test-unauthorized-forbidden-errors`: Unit tests for `KSeFUnauthorizedError` and `KSeFForbiddenError` error classes covering construction, field storage, inheritance, and edge cases

### Modified Capabilities

_(none)_

## Impact

- New test file(s) in `tests/unit/errors/`
- No source code changes
- No API or dependency changes
- Estimated ~12 new tests
