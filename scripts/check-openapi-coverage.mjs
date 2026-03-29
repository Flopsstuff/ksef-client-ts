#!/usr/bin/env node

/**
 * Checks that all OpenAPI spec endpoints are covered by service implementations
 * and that no extra endpoints exist in the client that aren't in the spec.
 *
 * Steps:
 *   1. Fetch the latest openapi.json from KSeF API (default: test env)
 *   2. Compare with the local docs/open-api.json — exit with error if they differ
 *   3. Check that every spec endpoint is implemented in services/crypto
 *
 * Usage: node scripts/check-openapi-coverage.mjs [--skip-fetch] [--save] [--env test|demo|prod] [--openapi <path>] [--services <path>] [--routes <path>]
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, '..');

const UPSTREAM_URLS = {
  test: 'https://api-test.ksef.mf.gov.pl/docs/v2/openapi.json',
  demo: 'https://api-demo.ksef.mf.gov.pl/docs/v2/openapi.json',
  prod: 'https://api.ksef.mf.gov.pl/docs/v2/openapi.json',
};

const defaults = {
  openapi: path.resolve(root, 'docs', 'open-api.json'),
  routes: path.resolve(root, 'src', 'http', 'routes.ts'),
  services: path.resolve(root, 'src', 'services'),
  crypto: path.resolve(root, 'src', 'crypto'),
};

// --- Arg parsing ---

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') { args.help = true; continue; }
    if (arg === '--skip-fetch') { args.skipFetch = true; continue; }
    if (arg === '--save') { args.save = true; continue; }
    if (arg === '--env' || arg.startsWith('--env=')) {
      args.env = arg.includes('=') ? arg.split('=')[1] : argv[++i];
      continue;
    }
    for (const key of ['openapi', 'services', 'routes']) {
      if (arg === `--${key}` || arg.startsWith(`--${key}=`)) {
        args[key] = arg.includes('=') ? arg.split('=')[1] : argv[++i];
        break;
      }
    }
  }
  return args;
}

// --- Helpers ---

function normalizePath(p) {
  return p.replace(/^\//, '').replace(/\{[^}]+\}/g, '{}').replace(/\$\{[^}]+\}/g, '{}');
}

// --- 1. Extract operations from OpenAPI spec ---

function extractSpecOperations(specPath) {
  const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
  const ops = new Set();
  for (const [opPath, methods] of Object.entries(spec.paths ?? {})) {
    if (!methods || typeof methods !== 'object') continue;
    for (const m of ['get', 'post', 'put', 'patch', 'delete']) {
      if (Object.hasOwn(methods, m)) {
        ops.add(`${m.toUpperCase()} ${normalizePath(opPath)}`);
      }
    }
  }
  return ops;
}

// --- 2. Parse routes.ts into a flat map (dotted key -> path pattern) ---

function parseRoutes(routesPath) {
  const src = fs.readFileSync(routesPath, 'utf8');
  // Collapse multiline arrow functions: `=> \n   \`...\`` -> `=> \`...\``
  const collapsed = src.replace(/=>\s*\n\s+/g, '=> ');

  const map = new Map();
  const stack = [];

  for (const line of collapsed.split('\n')) {
    const trimmed = line.trim();

    // Object open: `Key: {`
    const open = trimmed.match(/^(\w+):\s*\{/);
    if (open) { stack.push(open[1]); continue; }

    // Object close: `},` or `} as const;`
    if (/^\},?/.test(trimmed)) { stack.pop(); continue; }

    // Static route: `key: 'path/here',`
    const stat = trimmed.match(/^(\w+):\s*'([^']+)'/);
    if (stat) {
      map.set([...stack, stat[1]].join('.'), stat[2]);
      continue;
    }

    // Arrow function route: `key: (...) => \`template\` as const,`
    const fn = trimmed.match(/^(\w+):\s*\([^)]*\)\s*=>\s*`([^`]+)`/);
    if (fn) {
      map.set([...stack, fn[1]].join('.'), fn[2].replace(/\$\{[^}]+\}/g, '{}'));
      continue;
    }
  }

  return map;
}

// --- 3. Scan source directories for RestRequest.<method>(Routes.X.Y.Z) calls ---

function scanDirectory(dir, routeMap, ops, warnings) {
  const files = fs.readdirSync(dir)
    .filter(f => f.endsWith('.ts') && f !== 'index.ts')
    .sort();

  const pattern = /RestRequest\.(get|post|put|delete|patch)\(Routes\.([A-Za-z.]+)/g;

  for (const file of files) {
    const src = fs.readFileSync(path.join(dir, file), 'utf8');
    for (const match of src.matchAll(pattern)) {
      const method = match[1].toUpperCase();
      const routeKey = match[2];
      const routePath = routeMap.get(routeKey);
      if (routePath) {
        ops.add(`${method} ${normalizePath(routePath)}`);
      } else {
        warnings.push(`Unresolved route: Routes.${routeKey} in ${file}`);
      }
    }
  }
}

function extractClientOperations(dirs, routeMap) {
  const ops = new Set();
  const warnings = [];
  for (const dir of dirs) {
    scanDirectory(dir, routeMap, ops, warnings);
  }
  return { ops, warnings };
}

// --- 4. Fetch upstream spec and compare with local ---

async function fetchUpstreamSpec(env) {
  const url = UPSTREAM_URLS[env];
  console.log(`Fetching upstream spec from ${env} (${url})...`);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch upstream spec: ${res.status} ${res.statusText}`);
  }
  return res.text();
}

function sha256(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

function compareSpecs(localPath, upstreamText, env) {
  const localText = fs.readFileSync(localPath, 'utf8');
  const local = JSON.parse(localText);
  const upstream = JSON.parse(upstreamText);

  // Compare paths (ignoring info/servers metadata that differs per environment)
  const localPaths = Object.keys(local.paths ?? {}).sort().join('\n');
  const upstreamPaths = Object.keys(upstream.paths ?? {}).sort().join('\n');
  const localPathCount = Object.keys(local.paths ?? {}).length;
  const upstreamPathCount = Object.keys(upstream.paths ?? {}).length;

  if (localPaths === upstreamPaths) {
    console.log(`Local spec paths match ${env} (${localPathCount} paths).`);
    return true;
  }

  const localSet = new Set(Object.keys(local.paths ?? {}));
  const upstreamSet = new Set(Object.keys(upstream.paths ?? {}));
  const missing = [...upstreamSet].filter(p => !localSet.has(p)).sort();
  const extra = [...localSet].filter(p => !upstreamSet.has(p)).sort();

  console.error(`Local spec paths differ from ${env}!`);
  console.error(`  Local: ${localPathCount} paths, Upstream: ${upstreamPathCount} paths`);
  if (missing.length) {
    console.error(`  Missing locally (${missing.length}):`);
    for (const p of missing) console.error(`    - ${p}`);
  }
  if (extra.length) {
    console.error(`  Extra locally (${extra.length}):`);
    for (const p of extra) console.error(`    - ${p}`);
  }
  console.error();
  console.error('To update, run:');
  console.error(`  curl -sL '${UPSTREAM_URLS[env]}' -o docs/open-api.json`);
  console.error('  node scripts/split-openapi.mjs');
  return false;
}

// --- Main ---

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    console.log('Usage: node scripts/check-openapi-coverage.mjs [--skip-fetch] [--save] [--env test|demo|prod] [--openapi <path>] [--services <path>] [--routes <path>]');
    console.log();
    console.log('Options:');
    console.log('  --env <env>    Environment to fetch from (default: test)');
    console.log('  --save         Save fetched spec to docs/open-api.json');
    console.log('  --skip-fetch   Skip fetching upstream spec');
    console.log();
    console.log('Environments:');
    for (const [name, url] of Object.entries(UPSTREAM_URLS)) {
      console.log(`  ${name.padEnd(6)} ${url}`);
    }
    return;
  }

  const cwd = process.cwd();
  const resolve = (val, def) => val ? (path.isAbsolute(val) ? val : path.resolve(cwd, val)) : def;

  const specPath = resolve(args.openapi, defaults.openapi);
  const routesPath = resolve(args.routes, defaults.routes);
  const servicesDir = resolve(args.services, defaults.services);
  const cryptoDir = resolve(args.crypto, defaults.crypto);

  // Step 1: Check upstream freshness
  const env = args.env ?? 'test';
  if (!UPSTREAM_URLS[env]) {
    console.error(`Unknown environment: ${env}. Use test, demo, or prod.`);
    process.exitCode = 1;
    return;
  }

  if (!args.skipFetch) {
    const upstreamText = await fetchUpstreamSpec(env);
    const specsMatch = compareSpecs(specPath, upstreamText, env);

    if (args.save) {
      fs.writeFileSync(specPath, upstreamText, 'utf8');
      console.log(`Saved upstream spec to ${path.relative(root, specPath)}`);
    }

    if (!specsMatch && !args.save) {
      process.exitCode = 1;
      return;
    }
    console.log();
  }

  // Step 2: Check endpoint coverage
  const specOps = extractSpecOperations(specPath);
  const routeMap = parseRoutes(routesPath);
  const { ops: clientOps, warnings } = extractClientOperations([servicesDir, cryptoDir], routeMap);

  for (const w of warnings) console.warn(`Warning: ${w}`);

  const missing = [...specOps].filter(op => !clientOps.has(op)).sort();
  const extra = [...clientOps].filter(op => !specOps.has(op)).sort();

  console.log(`OpenAPI operations: ${specOps.size}`);
  console.log(`Client operations:  ${clientOps.size}`);
  console.log();

  if (missing.length) {
    console.log(`Missing from client (${missing.length}):`);
    for (const op of missing) console.log(`  - ${op}`);
  }

  if (extra.length) {
    if (missing.length) console.log();
    console.log(`Extra in client, not in spec (${extra.length}):`);
    for (const op of extra) console.log(`  - ${op}`);
  }

  if (!missing.length && !extra.length) {
    console.log('OpenAPI coverage check passed.');
  } else {
    console.log();
    process.exitCode = 1;
  }
}

main();
