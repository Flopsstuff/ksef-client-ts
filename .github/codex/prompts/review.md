Review this pull request diff and provide a concise, actionable review.

Diff context:
- The checkout is the GitHub pull request merge ref.
- Review only changes introduced by this pull request.
- Use the PR metadata from the environment when useful: `PR_NUMBER`, `PR_TITLE`, `PR_BASE_REF`, `PR_HEAD_REF`, `PR_BASE_SHA`, `PR_HEAD_SHA`.
- Inspect the diff explicitly before reviewing. Prefer:

```bash
git diff --find-renames "$PR_BASE_SHA...$PR_HEAD_SHA"
```

- If those SHAs are unavailable locally, use the checked-out merge commit parents:

```bash
git diff --find-renames HEAD^1...HEAD^2
```

Scope:
- Focus only on changes introduced by this pull request.
- Prioritize correctness, security, backward compatibility, and tests.
- Ignore stylistic nits unless they hide a real defect.

Output format:
1. Findings grouped by severity (`high`, `medium`, `low`).
2. For each finding include:
   - `title`
   - `why it matters`
   - `location` (file path and symbol when possible)
   - `suggested fix`
3. If there are no issues, say `No blocking issues found` and list residual risks or missing tests.

Keep the review practical and short.
