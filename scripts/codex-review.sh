#!/usr/bin/env bash
#
# Run a local Codex code review by hand — no PR, no GitHub Actions.
# Uses the Codex CLI logged in via your ChatGPT subscription (not OPENAI_API_KEY),
# runs read-only, prints the review, and saves it under plans/reviews/.
#
# Usage:
#   scripts/codex-review.sh                 # review current branch vs origin/main
#   scripts/codex-review.sh --worktree      # review uncommitted changes (incl. staged)
#   scripts/codex-review.sh --staged        # review only staged changes
#   scripts/codex-review.sh <path> [path…]  # review specific files/dirs
#   scripts/codex-review.sh --ci-prompt     # use .github/codex/prompts/review.md verbatim
#
# Options (env):
#   CODEX_MODEL=gpt-5-codex   # pick a model (default: CLI default)
#   BASE_REF=origin/main      # base for branch diff (default: origin/main)
#
set -euo pipefail

cd "$(dirname "$0")/.."

# --- preflight -------------------------------------------------------------
if ! command -v codex >/dev/null 2>&1; then
  echo "error: codex CLI not found. Install it, then run: codex login" >&2
  exit 1
fi
if ! codex login status >/dev/null 2>&1; then
  echo "error: codex is not logged in. Run: codex login" >&2
  exit 1
fi

BASE_REF="${BASE_REF:-origin/main}"
OUT_DIR="plans/reviews"
mkdir -p "$OUT_DIR"

# Shared review rubric appended to every prompt.
RUBRIC="Prioritize correctness, security, backward compatibility, and missing \
tests; ignore pure style nits unless they hide a real defect. Group findings by \
severity (high/medium/low); for each give: title, why it matters, location \
(file path + symbol), and a concrete suggested fix. If there are no blocking \
issues, say 'No blocking issues found' and list residual risks or missing tests. \
Keep it practical and short."

# --- pick mode -------------------------------------------------------------
mode="${1:-branch}"
case "$mode" in
  --worktree)
    scope="worktree"
    prompt="Review my uncommitted changes. Run \`git diff\` and \`git diff --staged\` to see them. ${RUBRIC}"
    ;;
  --staged)
    scope="staged"
    prompt="Review my staged changes. Run \`git diff --staged\` to see them. ${RUBRIC}"
    ;;
  --ci-prompt)
    scope="ciprompt"
    PR_BASE_SHA="$(git merge-base "$BASE_REF" HEAD)"
    PR_HEAD_SHA="$(git rev-parse HEAD)"
    export PR_BASE_SHA PR_HEAD_SHA
    prompt="$(cat .github/codex/prompts/review.md)"
    ;;
  --branch|branch)
    scope="$(git branch --show-current | tr / -)"
    base_sha="$(git merge-base "$BASE_REF" HEAD)"
    prompt="Review the changes on this branch. Run \`git diff --find-renames ${base_sha}...HEAD\` to see them, and review only those changes. ${RUBRIC}"
    ;;
  -*)
    echo "error: unknown option '$mode'. See header for usage." >&2
    exit 1
    ;;
  *)
    # Treat all args as paths to review.
    scope="paths"
    prompt="Review the following files/directories: $*. Read them with cat/rg as needed. ${RUBRIC}"
    ;;
esac

out_file="${OUT_DIR}/$(date +%Y-%m-%d)-${scope}.md"

# --- run -------------------------------------------------------------------
model_args=()
[[ -n "${CODEX_MODEL:-}" ]] && model_args=(-c "model=\"${CODEX_MODEL}\"")

echo "› codex review (scope: ${scope}) → ${out_file}" >&2
# ${arr[@]+…} guards against "unbound variable" on an empty array under
# `set -u` in bash 3.2 (the default /bin/bash on macOS).
codex exec --sandbox read-only ${model_args[@]+"${model_args[@]}"} "$prompt" | tee "$out_file"
echo "" >&2
echo "✓ saved to ${out_file}" >&2
