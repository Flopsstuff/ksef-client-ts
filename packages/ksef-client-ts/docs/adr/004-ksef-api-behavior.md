# ADR-004: KSeF API Behavioral Notes

- **Date:** 2026-03-28
- **Status:** Accepted (living document)

## Purpose

Knowledge about KSeF API behavior that is **not documented in the OpenAPI spec** but was learned from reference implementations, testing, and API experimentation. This document consolidates insights from across the project to prevent re-discovery.

## POST Operations Are Idempotent

KSeF POST endpoints are idempotent by design. Invoice submission returns the same KSeF number on re-submit. Session init is recoverable. This justifies retrying all HTTP methods including POST (see [ADR-001](001-transport-layer.md)).

Network errors during POST are indistinguishable from success-but-lost-response — retrying automatically is strictly better than forcing users to retry manually.

## Refresh Token Is Reusable (Not Rotated)

`POST /auth/token/refresh` returns **only** `accessToken` — no new `refreshToken` is issued. The `refreshTokenValidUntil` field on `AuthenticationOperationStatusResponse` confirms the refresh token is long-lived and reusable across the session lifetime (see [ADR-002](002-auth-token-management.md)).

## Rate Limits: Per-Second Is the Binding Constraint

KSeF has multi-tier rate limits (per-second, per-minute, per-hour). The per-second limit is the binding constraint — per-minute/hour limits are proportional and won't be hit if per-second is respected. This justifies using a single-tier token bucket rather than multi-tier sliding window (see [ADR-001](001-transport-layer.md)).

KSeF does not publish official per-second limit values. Default 10 RPS is conservative.

## Batch Sessions Do Not Support PEF/PEF_KOR

Batch session opening with `PEF (3)` or `PEF_KOR (3)` form codes is rejected by the API. Only FA, FA (3), and FA_RR variants are supported in batch mode. Online sessions support all document types.

This is enforced at runtime via `validateFormCodeForSession()`. The type system provides `BatchSessionFormCode` as a narrower union excluding PEF types.

## Continuation Point Priority (Incremental Export)

When processing `InvoiceExportPackage` results for HWM (High-Water Mark) tracking:

1. `isTruncated && lastPermanentStorageDate` — use `lastPermanentStorageDate` (last date in truncated package = resume point)
2. `permanentStorageHwmDate` exists — use it (stable HWM from snapshot mode)
3. Neither — delete the continuation point entry (export complete for this subject type)

This priority matches both the C# and Java (smekcio) reference implementations and is consistent with KSeF API documentation.

## Challenge TTL for External Signing

KSeF authentication challenges have a short TTL. For external signing flows (HSM, EPUAP, smart card) where the user signs out-of-band, the challenge may expire before the signed XML is submitted. The CLI warns about this window during the `--generate` phase.

## Lighthouse Endpoints: No Authentication

`LighthouseService` uses raw `fetch()` against the lighthouse URL — no RestClient, no access token. These endpoints check system status and messages and work without logging in. This is unusual for the KSeF API which otherwise requires authentication for all operations.

## UPO XML Structure

UPO (Official Receipt Confirmation) XML uses XSD `<xs:choice>` elements for context identifiers (4 variants: Nip, IdWewnetrzny, IdZlozonyVatUE, IdDostawcyUslugPeppol) and auth proofs (2 variants). These are modeled as TypeScript discriminated unions with a `kind` field.

UPO XML uses Polish field names from the XSD (`NipSprzedawcy`, `NumerKSeFDokumentu`, etc.). All four reference implementations preserve Polish names. Translating would create a mapping layer users must mentally reverse when debugging against raw XML.

## Form Code Variants

There are 7 valid form code combinations across 5 document types:

| Key | systemCode | schemaVersion | value |
|-----|-----------|---------------|-------|
| FA_2 | FA (2) | 1-0E | FA |
| FA_3 | FA (3) | 1-0E | FA |
| PEF_3 | PEF (3) | 2-1 | PEF |
| PEF_KOR_3 | PEF_KOR (3) | 2-1 | PEF |
| FA_RR_1_LEGACY | FA_RR (1) | 1-0E | RR |
| FA_RR_1_TRANSITION | FA_RR (1) | 1-1E | RR |
| FA_RR_1 | FA_RR (1) | 1-1E | FA_RR |

FA_RR has 3 variants due to an evolution: legacy (value=RR, schema 1-0E), transition (value=RR, schema 1-1E), and current (value=FA_RR, schema 1-1E).

## ZIP Bomb Indicator

A ZIP entry with `compressedSize === 0` and `uncompressedSize > 0` is a known ZIP bomb indicator. The `unzip()` utility rejects such entries with a descriptive error.

## XML Single-Element vs Array Ambiguity

`fast-xml-parser` returns a single XML element as an object but multiple elements as an array. The `ensureArray()` helper normalizes both cases. This is a well-known pattern with the parser — any XML element that can occur 1..N times must be wrapped.
