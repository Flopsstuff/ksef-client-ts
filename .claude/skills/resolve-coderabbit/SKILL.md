---
name: resolve-coderabbit
description: Walk through unresolved CodeRabbit inline review comments on a GitHub PR one by one — verify each claim against the current code, fix/reject with the user's approval, commit+push, reply to the comment, and resolve the thread. Use this skill whenever the user asks to resolve CodeRabbit comments, address PR review from the CodeRabbit bot, go through inline suggestions, handle the bot review, or anything similar — even when they phrase it as "пройдись по комментам", "resolve review", "fix the bot's suggestions", or just name-drop CodeRabbit alongside a PR number.
---

Resolve unresolved **CodeRabbit** inline review comments on a GitHub PR. Loop through each thread, verify the bot's claim against the current code with the user, apply a fix (or reject with justification), commit + push + reply + resolve the thread.

**Input**: `$ARGUMENTS` — optional PR number. If empty, resolve to the PR attached to the current branch via `gh pr view --json number --jq .number`. If that fails, ask the user for the PR number.

## Why the loop looks the way it does

CodeRabbit has a hard-earned habit of attaching a `🤖 Prompt for AI Agents` block to every inline comment, prefixed with "Verify each finding against the current code and only fix it if needed." The bot can be wrong (mismatched versions of the code, outdated assumptions, style nits that don't apply in this repo), so slavishly applying suggestions is worse than doing nothing. This skill mirrors that instruction: always read the code the claim refers to *before* deciding to fix.

Also: replies reference commit SHAs, so commits must be pushed before the reply is posted. One commit per comment keeps each reply's SHA meaningful and the PR history legible.

## Steps

### 1. Resolve the PR number and pull the comment set

```bash
# PR number (from $ARGUMENTS or the current branch)
PR=${ARGUMENTS:-$(gh pr view --json number --jq .number)}

# Inline comments (REST) — gets the body, file, line, and comment_id
gh api "repos/$OWNER/$REPO/pulls/$PR/comments" \
  --jq '.[] | {id, path, line, body}' > /tmp/pr-$PR-comments.json

# Thread IDs + resolved flag (GraphQL) — REST cannot resolve threads
gh api graphql -f query='query {
  repository(owner:"'"$OWNER"'",name:"'"$REPO"'") {
    pullRequest(number:'"$PR"') {
      reviewThreads(first:100) {
        nodes {
          id
          isResolved
          comments(first:1) { nodes { databaseId author { login } path line } }
        }
      }
    }
  }
}' --jq '.data.repository.pullRequest.reviewThreads.nodes[]
  | select(.isResolved == false)
  | select(.comments.nodes[0].author.login == "coderabbitai")
  | {thread_id: .id, comment_id: .comments.nodes[0].databaseId, path: .comments.nodes[0].path, line: .comments.nodes[0].line}' \
  > /tmp/pr-$PR-threads.json
```

`$OWNER/$REPO` can come from `gh repo view --json nameWithOwner --jq .nameWithOwner`.

### 2. Seed a task list — one task per unresolved comment

Use `TaskCreate` to create one task per comment (subject: severity marker + short file:line, e.g. "🟠 C1: CHANGELOG.md:15"). This makes progress visible in the spinner and lets the user see at a glance what's left. Skip threads already resolved and comments from non-CodeRabbit authors.

### 3. For each unresolved comment — verify, then ask the user

Claude Code runs this skill in **with-confirmation mode**: for every comment, present the user with enough context to decide, *then* wait for explicit approval before touching anything.

**3a. Extract the CodeRabbit signal**

From the comment body, pull out:
- **Severity** — `🟠 Major` / `🟡 Minor` / `🔵 Trivial` / `🧹 Nitpick` / `⚠️ Potential issue`
- **Claim** — the bold-headed problem statement (first `**...**` line in the comment)
- **Suggested fix** — the diff block inside `<summary>💡 Proposed fix</summary>` or `<summary>📝 Committable suggestion</summary>`
- **AI prompt** — the contents of `<details><summary>🤖 Prompt for AI Agents</summary>` (optional but usually informative)

**3b. Verify against the current code**

Read the file at `path` around `line`. Ask: does the bot's claim still match what's there? Common mismatches:

- The bot is looking at a stale version; the issue was already fixed in a later commit on the branch.
- The "suggested fix" overlaps with a pattern elsewhere in the repo that's intentional (e.g. our `CLAUDE.md` rule against method/class names in CHANGELOG entries might conflict with a bot that prefers descriptive class names).
- The bot's type assumption is wrong (e.g. it says "the method expects `X`" when our local signature is broader).
- The claim is technically true but the fix is cosmetic overreach — the bot cropped parts of a sentence without understanding their purpose.

If the claim is a real problem in the current code, it's a **fix**. If the code is already fine, or the suggested fix would make things worse, it's a **reject** — but still thread-resolve with a short justification so the reviewer (or the next person) sees a closed, explained thread instead of lingering noise.

**3c. Present the decision to the user**

Output a compact block per comment:

```text
━━━ C<N>/<TOTAL> · 🟠 Major · path/to/file.ts:42 ━━━

Claim: <one-line bold summary from the bot>

Relevant code (path/to/file.ts:40-45):
   …actual lines…

AI prompt summary: <1-2 lines from the bot's Prompt for AI Agents>

Proposed action:
  [x] FIX — <concrete edit you will make>
  (or)
  [x] REJECT — <reason the bot is wrong / out of scope>

OK to proceed? (y/apply = go, n/reject = reject instead, s/skip = leave open)
```

Wait for the user's answer before doing anything destructive. The user's `n` can flip a FIX into a REJECT and vice versa.

**3d. Apply the decision**

**FIX path:**

1. Edit the file(s) — use `Edit` with exact surrounding context from step 3b so we don't drift.
2. If the fix touches `src/` or `tests/`, run the focused test that covers the change (`yarn vitest run <file>`) to confirm it still passes. If it touches only docs or CHANGELOG, skip focused tests — they'd be pointless.
3. Commit with a one-line subject + body that cites the review:

   ```
   <type>(<scope>): <short imperative summary>

   Per CodeRabbit PR review on #<PR>: <one or two sentences on what
   and why, referencing the file/line that was off>.

   Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
   ```

   `<type>` follows this repo's convention (`fix`, `feat`, `docs`, `test`, `chore`, `refactor`).
4. `git push` — the reply will reference this SHA and the SHA has to exist on origin for the GitHub UI to link it.
5. Reply to the comment with the SHA + a brief note on what was done. If the fix deviates from the bot's suggested wording, explain why (one sentence).
6. Resolve the thread.

**REJECT path:**

1. No edit. No commit.
2. Reply explaining *why* the claim doesn't apply here — specific (not "disagree"): cite the file/line, the project convention, or the existing test that already covers it.
3. Resolve the thread anyway — the goal is a clean thread list, not an endless debate with a bot.

**SKIP path:**

Leave the thread open and move on. Use this only when the comment needs human judgment you can't supply (e.g. architectural question, missing context).

### 4. Posting replies and resolving threads

Replying is REST, resolving is GraphQL — they're separate APIs and both are required.

```bash
# Reply to an inline comment (creates a child comment in the same thread)
REPLY_BODY='Fixed in <SHA>. <one-line what/why>.'
gh api "repos/$OWNER/$REPO/pulls/$PR/comments/$COMMENT_ID/replies" \
  -f body="$REPLY_BODY" --jq '.id'

# Mark the thread resolved (GraphQL — note the curly-brace input syntax)
gh api graphql \
  -f query='mutation { resolveReviewThread(input:{threadId:"'"$THREAD_ID"'"}) { thread { isResolved } } }' \
  --jq '.data.resolveReviewThread.thread.isResolved'
```

Two traps that are easy to hit:

- The GraphQL input is an **object**, not a string. `input:"PRRT_..."` → `argumentLiteralsIncompatible`. Always `input:{threadId:"..."}`.
- If the `$REPLY_BODY` has apostrophes (`'`), don't try to nest HEREDOCs inside `gh api ... -f body="$(cat <<EOF…EOF)"` — bash quote-nesting will bite you. Put the body in a shell variable first and pass `-f body="$REPLY_BODY"`.

### 5. After the loop — one final check

If any fixes touched `src/` or `tests/`, run the full unit suite one last time:

```bash
yarn lint && yarn test
```

E2E (`yarn test:e2e`) is heavier and hits real KSeF TEST — run it only when the fixes touched HTTP/auth/session-level code where unit mocks can't catch real regressions.

Report back to the user with a short summary:

```text
Processed <N> CodeRabbit comments on PR #<N>:
  ✅ <K> fixed and resolved (commits: <sha1>, <sha2>, …)
  ⚠️  <M> rejected with justification and resolved
  ⏸  <L> skipped (still open)

All threads that remain open: <list>
```

## Commit & reply examples

**Good commit message** (from the real PR #10 workflow):

```text
fix(http): normalize partial 410 payloads before constructing KSeFGoneError

Per CodeRabbit PR review on #10: the 410 branch accepted any body with
either `title` or `detail` and passed it straight to the error
constructor, leaving `detail` / `status` / `title` as undefined on the
instance whenever the server returned a partial Problem Details shape.
Always build a complete GoneProblemDetails object with sensible
fallbacks before instantiating.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
```

**Good reply** (adopted partial, explains what was skipped):

```text
Applied in d5167fd. Took the intent of the suggestion but kept the original
wording where it was already user-focused:
- dropped "PRD rollout 2026-04-16" (rollout timing, not user impact)
- dropped "dedicated error type/class" (lands in implementation detail)
- did not adopt "improves compatibility with current API behavior" — felt
  too vague vs. the concrete outcomes we can name.
```

**Good reject reply**:

```text
Leaving as-is: our `CLAUDE.md:162` rule explicitly forbids method/class
names in CHANGELOG entries, which is what this suggestion would add back.
The current wording is the user-facing rewording that satisfies both the
style rule and the `KSeF API v2.4.0` traceability.
```

## When *not* to use this skill

- There are no CodeRabbit comments on the PR (human reviewers only) — use general PR review workflow, not this.
- The PR isn't yet opened / the branch hasn't been pushed.
- The user wants to dispute CodeRabbit's findings in bulk without going comment-by-comment — handle that conversationally, don't loop through the skill.
- The current working tree is dirty with unrelated changes — commit or stash first; one-commit-per-comment cannot coexist with "work in progress" in the staging area.
