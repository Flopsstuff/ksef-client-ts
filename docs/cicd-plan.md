# KSeF Client — CI/CD Plan

## Overview

GitHub Actions pipelines for quality gates, automated releases, and npm publishing.

---

## Workflows

### 1. `test.yml` — Unit Tests ✅

Triggers: push to `main`, all PRs.

```
Steps:
  1. Checkout                                  ✅
  2. Setup Node.js (matrix: 18, 20, 22)       ✅
  3. Enable Corepack + install dependencies    ✅
  4. Lint (tsc --noEmit)                       ✅
  5. Build (tsup)                              ✅
  6. Run unit tests with coverage              ✅
  7. Coverage summary (Job Summary, Node 20)   ✅
  8. Update coverage badge (gist, Node 20)     ✅
```

Matrix strategy:
- Node 18, 20, 22
- OS: ubuntu-latest
- fail-fast: false

Coverage: `@vitest/coverage-v8`, badge via gist + shields.io.

Deferred:
- Check package size (size-limit) — not added yet
- macOS matrix — not needed currently

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

### 3. `deploy-docs.yml` — Documentation (GitHub Pages) ✅

Triggers: push to `main`, manual (`workflow_dispatch`).

```
Steps:
  1. Checkout                                  ✅
  2. Setup Node.js 20                          ✅
  3. Enable Corepack + install dependencies    ✅
  4. Build docs site (VitePress)               ✅
  5. Deploy to GitHub Pages (actions/deploy-pages) ✅
```

Site structure:
```
site/
├── index.md                  # Landing page
├── getting-started.md        # Installation + quickstart
├── guides/
│   ├── authentication.md     # Auth flows (token, certificate)
│   ├── sessions.md           # Online + batch sessions
│   ├── invoices.md           # Send, query, export
│   ├── permissions.md        # Grant, revoke, search
│   └── certificates.md      # Enrollment, management
├── cli/
│   └── index.md              # CLI reference
├── api/                      # Auto-generated TypeDoc
└── changelog.md              # Release history
```

Tools:
- `VitePress` — docs site (markdown → static HTML)
- `TypeDoc` — API reference from TSDoc comments (future)
- `typedoc-plugin-markdown` — TypeDoc → markdown (future)

### 4. `integration.yml` — Integration Tests (Optional)

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
| Coverage | `@vitest/coverage-v8` | Reported (no threshold) |
| Build | `tsup` | Clean build, dual ESM/CJS |
| Node compat | Matrix CI | Node 18, 20, 22 |

---

## Secrets & Environment Variables

| Secret | Used in | Purpose |
|---|---|---|
| `GIST_ID` | `test.yml` | Coverage badge gist ID |
| `GIST_SECRET` | `test.yml` | GitHub token for gist update |
| `NPM_TOKEN` | `release.yml` | npm publish |
| `KSEF_TEST_NIP` | `integration.yml` | Integration test NIP |
| `KSEF_TEST_TOKEN` | `integration.yml` | Integration test KSeF token |

---

## Future Considerations

- **Dependabot** — automated dependency updates (PR per update)
- **CodeQL** — security scanning
- **Changesets** — automated changelogs + version bumps
- **Provenance** — npm publish with `--provenance` for supply chain security
- **Canary releases** — publish `@next` tag from `dev` branch
- **Package size check** — `size-limit` in CI
