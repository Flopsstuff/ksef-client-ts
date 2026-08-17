# ADR-008: Mirroring Newly Required OpenAPI Fields

- **Date:** 2026-08-17
- **Status:** Accepted

## Context

KSeF ships minor API releases against the same major version, and the live TEST environment is upgraded ahead of any release of this library. Between API 2.6.1 and 2.7.0, `ApiRateLimitsOverride` and `EffectiveApiRateLimits` each gained a `collectiveIdentifier` property, listed in the schema's `required` array. Nothing was removed and no existing property changed shape.

The library found out the way these changes are usually found: an E2E test that had been green for weeks started failing with a live `400` from `POST /v2/testdata/rate-limits`, because our request model had no way to express the new mandatory bucket.

This is not a one-off. Upstream will add required fields to existing schemas again, and each time the question is the same: does our model mirror the spec, or does it stay source-compatible for callers who wrote against the older shape?

## Decision

**Mirror the spec.** A property that upstream declares `required` is declared non-optional in the corresponding TypeScript type, in the same minor release, even when that breaks callers who construct the type as a literal.

`docs/models.md` and `docs/architecture.md` both state that the model layer is a 1:1 projection of the OpenAPI spec. That guarantee is the reason callers can read the official documentation and trust our types. A property marked optional that the server treats as mandatory breaks the guarantee quietly.

## Options considered

**Model the new property as optional (`collectiveIdentifier?:`).** Preserves compilation for existing callers. Rejected: it does not preserve *behaviour*. A caller who omits the property still gets a `400` at runtime, so the only thing optionality buys is that the failure moves from build time to production. It also makes the type assert something untrue about the contract, which is worse the longer it stays.

**Introduce a separate versioned type per API minor.** Rejected as disproportionate: the library targets one API version at a time, pins the vendored spec to it, and states that version in the docs. Parallel type families would multiply every request model to absorb an additive change.

**Mirror the spec (chosen).** The break surfaces at build time with an obvious fix — add the missing property. For response types the change is additive and invisible to consumers, since they only read the extra property.

## Consequences

- Callers constructing an affected request type as an object literal get a compile error and must supply the new property. Callers who only read the response type are unaffected.
- Callers who pass request bodies as untyped JSON — including the CLI, which takes rate limits as a JSON string — do not break at compile time and must be told through the CHANGELOG and the CLI docs.
- Refreshing the vendored spec is part of the same change, not a follow-up: `docs/open-api.json`, the generated chunks, and the spec-version references in the docs move together, so the vendored spec never disagrees with the types.
- New paths and schemas that arrive in the same upstream release are *not* covered by this ADR. They are new surface, tracked and implemented separately, and `yarn check-api` is expected to report them as uncovered until then.
- 0.x versioning permits this in a minor release. After 1.0 the same change belongs in a major release, with the CHANGELOG calling it out as breaking.
