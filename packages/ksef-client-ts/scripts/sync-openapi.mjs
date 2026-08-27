#!/usr/bin/env node

/**
 * Downloads the KSeF OpenAPI specification into docs/open-api.json.
 *
 * TEST and DEMO lead while PROD trails, so TEST is the default source: it is the
 * first place a new API build appears. The response is written byte for byte,
 * without reformatting, so the file stays diffable against the served document.
 *
 * Source: https://api-test.ksef.mf.gov.pl/docs/v2/openapi.json
 * Target: docs/open-api.json
 *
 * Run `yarn split-openapi` afterwards to regenerate docs/openapi-chunks/.
 *
 * Usage: node scripts/sync-openapi.mjs [--env test|demo|prod] [--dry-run]
 */

import { readFileSync, writeFileSync, renameSync, rmSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_FILE = join(ROOT, "docs", "open-api.json");
const TEMP_FILE = `${OUT_FILE}.tmp`;

const HOSTS = {
  test: "https://api-test.ksef.mf.gov.pl",
  demo: "https://api-demo.ksef.mf.gov.pl",
  prod: "https://api.ksef.mf.gov.pl",
};

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const env = args.includes("--env") ? args[args.indexOf("--env") + 1] : "test";

if (!HOSTS[env]) {
  console.error(`Unknown environment "${env}". Expected one of: ${Object.keys(HOSTS).join(", ")}`);
  process.exit(1);
}

const url = `${HOSTS[env]}/docs/v2/openapi.json`;

/** Pulls the API version out of the free-text description the spec carries. */
function describe(spec) {
  const match = /\*\*Wersja API:\*\*\s*([^\s<]+)\s*\(build\s*([^)]+)\)/.exec(spec.info?.description ?? "");
  return match ? { version: match[1], build: match[2] } : { version: spec.info?.version ?? "?", build: "?" };
}

function summarise(spec) {
  return {
    ...describe(spec),
    paths: Object.keys(spec.paths ?? {}),
    schemas: Object.keys(spec.components?.schemas ?? {}),
  };
}

function report(label, added, removed) {
  if (added.length === 0 && removed.length === 0) return;
  console.log(`\n${label}:`);
  for (const name of added) console.log(`  + ${name}`);
  for (const name of removed) console.log(`  - ${name}`);
}

async function main() {
  console.log(`Source: ${url}`);
  console.log(`Target: docs/open-api.json\n`);

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Download failed ${res.status} ${res.statusText}: ${url}`);
  }
  const body = Buffer.from(await res.arrayBuffer());

  // Reject anything that is not a usable spec before touching the vendored file.
  let spec;
  try {
    spec = JSON.parse(body.toString("utf8"));
  } catch (err) {
    throw new Error(`Response is not valid JSON: ${err.message}`);
  }
  const next = summarise(spec);
  if (!spec.openapi || next.paths.length === 0 || next.schemas.length === 0) {
    throw new Error("Response does not look like an OpenAPI document (no openapi/paths/schemas)");
  }

  const previous = existsSync(OUT_FILE)
    ? summarise(JSON.parse(readFileSync(OUT_FILE, "utf8")))
    : null;

  if (previous) {
    console.log(`Current: ${previous.version} (build ${previous.build}) — ${previous.paths.length} paths, ${previous.schemas.length} schemas`);
  }
  console.log(`Fetched: ${next.version} (build ${next.build}) — ${next.paths.length} paths, ${next.schemas.length} schemas`);

  if (previous) {
    const diff = (before, after) => [
      after.filter((n) => !before.includes(n)).sort(),
      before.filter((n) => !after.includes(n)).sort(),
    ];
    report("Paths", ...diff(previous.paths, next.paths));
    report("Schemas", ...diff(previous.schemas, next.schemas));
  }

  const unchanged = existsSync(OUT_FILE) && readFileSync(OUT_FILE).equals(body);
  if (unchanged) {
    console.log("\nAlready up to date.");
    return;
  }

  if (dryRun) {
    console.log("\nDry run — docs/open-api.json left unchanged.");
    return;
  }

  // Write through a temp file so a failed write cannot truncate the vendored spec.
  try {
    writeFileSync(TEMP_FILE, body);
    renameSync(TEMP_FILE, OUT_FILE);
  } catch (err) {
    if (existsSync(TEMP_FILE)) rmSync(TEMP_FILE);
    throw err;
  }

  console.log("\nDone. Run `yarn split-openapi` to regenerate docs/openapi-chunks/.");
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
