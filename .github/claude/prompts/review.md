You are reviewing PR #$PR_NUMBER against `$BASE_REF`.

Read `CLAUDE.md` at the repo root and treat its Rules and Key conventions as authoritative.
Use `git diff origin/$BASE_REF...HEAD` to scope your review to PR changes.

Check specifically:

1. **Import style** — TypeScript imports of local modules must use `.js` extensions (ESM resolution convention).
2. **CHANGELOG entries** (if `packages/ksef-client-ts/CHANGELOG.md` changed) — each bullet must be one sentence, user-facing, no class/method/field names, no CLI flags, no header names. KSeF API version in parentheses at the end if relevant.
3. **Fenced code blocks** in `packages/ksef-client-ts/README.md`, `packages/ksef-client-ts/docs/**`, `plans/**`, `packages/ksef-client-ts/CHANGELOG.md` — ASCII tables, tree diagrams, plain text must use ` ```text ` tag, never bare ` ``` `.
4. **Error hierarchy** — new server-side HTTP error classes must extend `KSeFApiError` and expose a `toProblemFields()` override so the CLI renderer picks them up automatically.
5. **Naming collisions** — watch for name clashes with `CertificateService`/`CertificateApiService`, `SubjectIdentifierType`/`PermissionSubjectIdentifierType`, `InvoicingMode`/`InvoiceFilterInvoicingMode`.
6. **Test coverage** — any new public method or new error path should have a unit test. New CLI commands should have a CLI test under `packages/ksef-client-ts/tests/unit/cli/`.
7. **README.md ↔ docs/index.md sync** — feature-list changes must land in both (`packages/ksef-client-ts/README.md` and `packages/ksef-client-ts/docs/index.md`).
8. **Security sanity** — any new file that takes user input (CLI args, HTTP bodies, file paths) or touches crypto should be spot-checked for obvious injection / path-traversal / unsafe defaults.

Skip:

- Style nits on existing code outside the diff.
- Generic "consider using X library" suggestions.
- Tests you cannot run — just note what's untested, don't speculate on outcomes.

Output a single concise comment with one section per finding: severity (nit / warning / must-fix), file:line, what's wrong, suggested fix. If the PR is clean, say so in one sentence. Do not paraphrase the diff.
