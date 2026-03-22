# Changelog

All notable changes to this project will be documented in this file.

## [0.1.1] - Planned

### Added
- Added `onlyMetadata` to `InvoiceExportRequest` for metadata-only export requests.
- Added `scripts/check-openapi-coverage.mjs` to validate OpenAPI spec coverage in the codebase.
- Added and expanded spec-alignment notes in `docs/spec-alignment-fix-plan.md`.

### Changed
- Updated OpenAPI source to KSeF API version `2.3.0`.
- Updated selected constraints and examples for limits (`maxEnrollments`, `maxCertificates`).
- Updated invoice types and replaced deprecated `RR` usage with `FA_RR`.
- Clarified selected schema descriptions, including VAT amount currency (PLN) and invoice metadata/query descriptions.
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

