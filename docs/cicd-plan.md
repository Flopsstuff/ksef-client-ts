# KSeF Client — CI/CD Plan

## Overview

GitHub Actions pipelines for quality gates, automated releases, and npm publishing.

---

## Workflows

### 1. `ci.yml` — Pull Request & Push

Triggers: push to `main`, all PRs.

```
Steps:
  1. Checkout
  2. Setup Node.js (matrix: 18, 20, 22)
  3. Install dependencies (yarn)
  4. Lint (tsc --noEmit)
  5. Run unit tests (vitest run)
  6. Build (tsup)
  7. Check package size (size-limit or bundlesize)
  8. Upload coverage report (optional)
```

Matrix strategy:
- Node 18, 20, 22
- OS: ubuntu-latest (primary), macos-latest (optional)

Fail-fast: false (run all combos even if one fails).

### 2. `release.yml` — npm Publish

Triggers: push tag `v*` (e.g. `v0.1.0`).

```
Steps:
  1. Checkout
  2. Setup Node.js 20
  3. Install dependencies
  4. Lint + test
  5. Build
  6. Publish to npm (npm publish --provenance)
  7. Create GitHub Release (gh release create)
     - Auto-generate changelog from commits
     - Attach dist tarball
```

npm token stored as `NPM_TOKEN` repository secret.

### 3. `integration.yml` — Integration Tests (Optional)

Triggers: manual (`workflow_dispatch`), nightly schedule.

```
Steps:
  1. Checkout
  2. Setup Node.js 20
  3. Install dependencies
  4. Build
  5. Run integration tests against KSeF TEST environment
```

Secrets: `KSEF_TEST_NIP`, `KSEF_TEST_TOKEN` (or test certificate).

Timeout: 10 min (API can be slow).

---

## Branch Protection Rules (`main`)

- Require CI to pass before merge
- Require at least 1 review (when team grows)
- No direct push to main
- Require linear history (squash merge)

---

## Release Process

### Versioning

Semantic versioning (`MAJOR.MINOR.PATCH`):
- **PATCH** — bug fixes, typos
- **MINOR** — new API methods, new commands
- **MAJOR** — breaking changes (client API signature changes)

### Release Steps

```bash
# 1. Update version
npm version patch|minor|major

# 2. Push tag
git push origin main --tags

# 3. release.yml triggers automatically
#    → builds, tests, publishes to npm, creates GitHub Release
```

Alternative: use `changesets` for automated versioning and changelogs.

---

## Quality Gates

| Check | Tool | Threshold |
|---|---|---|
| Type safety | `tsc --noEmit` | Zero errors |
| Unit tests | `vitest` | All pass |
| Build | `tsup` | Clean build, dual ESM/CJS |
| Package size | `size-limit` | < 100KB (lib only) |
| Node compat | Matrix CI | Node 18, 20, 22 |

---

## Secrets & Environment Variables

| Secret | Used in | Purpose |
|---|---|---|
| `NPM_TOKEN` | `release.yml` | npm publish |
| `KSEF_TEST_NIP` | `integration.yml` | Integration test NIP |
| `KSEF_TEST_TOKEN` | `integration.yml` | Integration test KSeF token |

---

## Future Considerations

- **Dependabot** — automated dependency updates (PR per update)
- **CodeQL** — security scanning
- **Codecov** — coverage tracking with PR comments
- **Changesets** — automated changelogs + version bumps
- **Provenance** — npm publish with `--provenance` for supply chain security
- **Canary releases** — publish `@next` tag from `dev` branch
