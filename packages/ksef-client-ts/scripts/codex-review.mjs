#!/usr/bin/env node
//
// Run a local Codex code review by hand — no PR, no GitHub Actions.
// Uses the Codex CLI logged in via your ChatGPT subscription (not OPENAI_API_KEY),
// runs read-only, prints the review, and saves it under plans/reviews/.
//
// Usage:
//   yarn codex-review                 # review current branch vs origin/main
//   yarn codex-review --worktree      # review uncommitted changes (incl. staged)
//   yarn codex-review --staged        # review only staged changes
//   yarn codex-review <path> [path…]  # review specific files/dirs
//   yarn codex-review --ci-prompt     # use .github/codex/prompts/review.md verbatim
//
// Env:
//   CODEX_MODEL=gpt-5-codex   # pick a model (default: CLI default)
//   BASE_REF=origin/main      # base for branch diff (default: origin/main)
//
import { spawn, execFileSync } from 'node:child_process';
import { createWriteStream, mkdirSync, readFileSync } from 'node:fs';

// Resolve the actual repo root (git toplevel) so paths like
// `.github/codex/prompts/review.md` and the `plans/reviews/` output dir
// resolve correctly regardless of where this script lives in the monorepo.
const repoRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], {
  encoding: 'utf8',
}).trim();
process.chdir(repoRoot);

const die = (msg) => {
  console.error(`error: ${msg}`);
  process.exit(1);
};

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();

// --- preflight -------------------------------------------------------------
try {
  execFileSync('codex', ['--version'], { stdio: 'ignore' });
} catch {
  die('codex CLI not found. Install it, then run: codex login');
}
try {
  execFileSync('codex', ['login', 'status'], { stdio: 'ignore' });
} catch {
  die('codex is not logged in. Run: codex login');
}

const BASE_REF = process.env.BASE_REF || 'origin/main';
const OUT_DIR = 'plans/reviews';
mkdirSync(OUT_DIR, { recursive: true });

// Shared review rubric appended to every prompt.
const RUBRIC =
  'Prioritize correctness, security, backward compatibility, and missing tests; ' +
  'ignore pure style nits unless they hide a real defect. Group findings by severity ' +
  '(high/medium/low); for each give: title, why it matters, location (file path + ' +
  'symbol), and a concrete suggested fix. If there are no blocking issues, say ' +
  "'No blocking issues found' and list residual risks or missing tests. Keep it " +
  'practical and short.';

// --- pick mode -------------------------------------------------------------
const args = process.argv.slice(2);
const mode = args[0] ?? '--branch';
const env = { ...process.env };
let scope;
let prompt;

if (mode === '--worktree') {
  scope = 'worktree';
  prompt = `Review my uncommitted changes. Run \`git diff\` and \`git diff --staged\` to see them. ${RUBRIC}`;
} else if (mode === '--staged') {
  scope = 'staged';
  prompt = `Review my staged changes. Run \`git diff --staged\` to see them. ${RUBRIC}`;
} else if (mode === '--ci-prompt') {
  scope = 'ciprompt';
  env.PR_BASE_SHA = git('merge-base', BASE_REF, 'HEAD');
  env.PR_HEAD_SHA = git('rev-parse', 'HEAD');
  prompt = readFileSync('.github/codex/prompts/review.md', 'utf8');
} else if (mode === '--branch' || mode === 'branch') {
  scope = git('branch', '--show-current').replace(/\//g, '-') || 'branch';
  const baseSha = git('merge-base', BASE_REF, 'HEAD');
  prompt = `Review the changes on this branch. Run \`git diff --find-renames ${baseSha}...HEAD\` to see them, and review only those changes. ${RUBRIC}`;
} else if (mode.startsWith('-')) {
  die(`unknown option '${mode}'. See header for usage.`);
} else {
  // Treat all args as paths to review.
  scope = 'paths';
  prompt = `Review the following files/directories: ${args.join(' ')}. Read them with cat/rg as needed. ${RUBRIC}`;
}

const date = new Date().toISOString().slice(0, 10);
const outFile = `${OUT_DIR}/${date}-${scope}.md`;

// --- run -------------------------------------------------------------------
const codexArgs = ['exec', '--sandbox', 'read-only'];
if (process.env.CODEX_MODEL) codexArgs.push('-c', `model="${process.env.CODEX_MODEL}"`);
codexArgs.push(prompt);

console.error(`› codex review (scope: ${scope}) → ${outFile}`);

const child = spawn('codex', codexArgs, { env, stdio: ['inherit', 'pipe', 'inherit'] });
const sink = createWriteStream(outFile);
child.stdout.pipe(process.stdout);
child.stdout.pipe(sink);

child.on('error', (err) => die(`failed to launch codex: ${err.message}`));
child.on('close', (code) => {
  if (code === 0) {
    console.error(`\n✓ saved to ${outFile}`);
  } else {
    console.error(`\ncodex exited with code ${code}`);
  }
  process.exit(code ?? 1);
});
