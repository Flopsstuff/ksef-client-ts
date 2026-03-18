## 1. KSeFUnauthorizedError tests

- [x] 1.1 Create `tests/unit/errors/ksef-unauthorized-error.test.ts` with full problem details scenario (detail, traceId, instance stored)
- [x] 1.2 Add test: minimal problem details — optional fields are undefined
- [x] 1.3 Add test: empty detail string falls back to 'Unauthorized'
- [x] 1.4 Add test: `name` equals `'KSeFUnauthorizedError'`, `statusCode` equals `401`
- [x] 1.5 Add test: instanceof KSeFError and Error, but NOT instanceof KSeFApiError

## 2. KSeFForbiddenError tests

- [x] 2.1 Create `tests/unit/errors/ksef-forbidden-error.test.ts` with full problem details scenario (detail, reasonCode, instance, security, traceId stored)
- [x] 2.2 Add test: minimal problem details — optional fields are undefined
- [x] 2.3 Add test: empty detail string falls back to 'Forbidden'
- [x] 2.4 Add test: all 5 ForbiddenReasonCode values accepted (missing-permissions, ip-not-allowed, insufficient-resource-access, auth-method-not-allowed, security-service-blocked)
- [x] 2.5 Add test: `name` equals `'KSeFForbiddenError'`, `statusCode` equals `403`
- [x] 2.6 Add test: instanceof KSeFError and Error, but NOT instanceof KSeFApiError

## 3. Verify

- [x] 3.1 Run `yarn test` — all existing + new tests pass
