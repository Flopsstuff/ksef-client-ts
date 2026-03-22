# Changelog

All notable changes to this project will be documented in this file.

## [0.1.1] - 2026-03-22

### Added
- PKCS#12 authentication support (`src/crypto/pkcs12-loader.ts`) for certificate-based login.
- Full E2E test suite — 13 base suites + 5 permission suites (18 files total), zero secrets in code.
- E2E test helpers: auth, env, identifiers, invoices, polling; FA2/FA3 invoice fixtures.
- `scripts/check-openapi-coverage.mjs` to validate OpenAPI spec coverage.
- `scripts/whoami.ts` diagnostic script.
- GitHub Actions: `release.yml` (automated releases from `v*` tags), `e2e.yml` (E2E tests).
- E2E test documentation (`docs/e2e-tests.md`).
- Installation instructions in README.

### Changed
- Updated OpenAPI source to KSeF API version `2.3.0`.
- Renamed `PRD` environment to `PROD` across the codebase.
- Aligned `TestData` service with OpenAPI spec — methods return `void` instead of `OperationStatusInfo`.
- Refactored status handling and type definitions across services.
- Updated invoice types: replaced deprecated `RR` usage with `FA_RR`.
- Improved NIP/PESEL validation patterns.
- Updated bearer auth scheme casing in the OpenAPI definition.

## [0.1.0] - 2026-03-22

### Added
- Initial public release of `ksef-client-ts` on npm.
- OpenAPI source to KSeF API version `2.2.1`
- TypeScript client for KSeF API v2 with typed models and service-based API.
- Dual ESM/CJS build output with generated type declarations.
- Built-in CLI (`ksef`) with command groups for common KSeF operations.
- Documentation site powered by VitePress.

## Info
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
Format:
```
## [{VERSION}] - {DATE}

### Added
- TBD
### Changed
- TBD
### Fixed
- TBD
```

