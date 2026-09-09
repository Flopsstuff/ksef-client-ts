# ADR-0001: Retire the Codex PR review workflow

- **Date:** 2026-09-09
- **Status:** Accepted

## Context

`codex-pr-review.yml` ran on every pull request open and synchronize, and reported a `codex-review` status check. It never reviewed anything.

The workflow needs `OPENAI_API_KEY`. That secret was never configured for this repository, and no organization secret supplied it. The workflow handled the missing key by writing `available=false`, skipping the review step through an `if:` condition, and finishing **success**. The follow-up job that posts the review comment was gated on a non-empty final message, so it skipped too. The result was a green check and silence — which reads exactly like "reviewed, nothing to flag."

The evidence was unambiguous: the twelve most recent runs all finished `success` in 11–18 seconds against a 15-minute timeout, and no pull request in the repository ever carried the workflow's `<!-- codex-pr-review -->` comment marker. The repository's earlier on-demand Claude review workflow was retired for the same class of failure — an inert automation whose only visible output was a passing check.

An immediate fix made the guard fail loudly: with no key, the job now errors with an annotation instead of passing. That converted the false green into a true red and left one question open — fund the Codex channel, or drop it.

Automated review coverage does not depend on the answer. CodeRabbit runs on every pull request through `.coderabbit.yaml` as a GitHub App, not a workflow, and human sign-off happens on top of it.

## Decision

**Remove `codex-pr-review.yml`.** Automated pull-request review is CodeRabbit; human review continues unchanged. `OPENAI_API_KEY` is not introduced.

## Options considered

**Configure `OPENAI_API_KEY` and revive the channel.** Rejected. It requires a repository-settings and billing commitment, and what it buys is a second general-purpose review bot reading the same diff as the first. Two bots with one role produce duplicate findings, not better coverage; a second reviewer earns its cost only when it looks at something the first one does not.

**Keep the now-red check as a standing reminder.** Rejected. A check that is red on every pull request trains reviewers to ignore red, exactly as the false green trained them to trust green. The fail-loud guard was a way to make the gap visible while the decision was pending, not a destination.

**Remove the workflow (chosen).** The repository stops running an automation nobody funds, and the checks that remain on a pull request are all ones that mean something.

## Consequences

- Pull requests get one automated reviewer (CodeRabbit) plus human review. The `codex-review` check disappears from the checks list.
- Nothing becomes unmergeable: `main` requires only `deletion`, `non_fast_forward`, `required_linear_history`, and `required_deployments` — `codex-review` was never a required check.
- `.github/codex/prompts/review.md` stays. `yarn codex-review --ci-prompt` reads it, and that script is a manual local review run through the Codex CLI on a developer's own subscription — it never depended on the repository secret and keeps working. The flag now means "the standing review rubric" rather than "what CI runs".
- Restoring the channel means re-adding the workflow and the secret. The full workflow, including the fixed guard, stays in git history.
- CodeRabbit is now the only automated reviewer. If it is ever disabled, bot coverage drops to zero — that has to be a deliberate call, not something discovered later from a quiet pull request.
