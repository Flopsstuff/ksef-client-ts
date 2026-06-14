#!/usr/bin/env node

/**
 * Downloads all XSD invoice schemas from the official CIRFMF/ksef-docs GitHub repository
 * into docs/schemas/, preserving the directory structure.
 *
 * Source: https://github.com/CIRFMF/ksef-docs (Ministry of Finance, Poland)
 * Path:   faktury/schemy/  →  docs/schemas/
 *
 * Usage: node scripts/sync-xsd-schemas.mjs [--branch main]
 */

import { writeFileSync, mkdirSync, rmSync, renameSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(ROOT, "docs", "schemas");
const TEMP_DIR = `${OUT_DIR}.tmp`;
const REPO = "CIRFMF/ksef-docs";
const SCHEMA_PREFIX = "faktury/schemy/";

const branch = process.argv.includes("--branch")
  ? process.argv[process.argv.indexOf("--branch") + 1]
  : "main";

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`GitHub API ${res.status}: ${res.statusText}\n  ${url}`);
  }
  return res.json();
}

async function fetchFile(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Download failed ${res.status}: ${url}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

async function discoverXsdFiles() {
  const url = `https://api.github.com/repos/${REPO}/git/trees/${branch}?recursive=1`;
  const tree = await fetchJson(url);

  if (!tree.tree) {
    throw new Error(`Unexpected response from GitHub Trees API:\n${JSON.stringify(tree, null, 2)}`);
  }

  return tree.tree
    .filter((entry) => entry.type === "blob" && entry.path.startsWith(SCHEMA_PREFIX) && entry.path.endsWith(".xsd"))
    .map((entry) => ({
      repoPath: entry.path,
      localPath: entry.path.slice(SCHEMA_PREFIX.length),
      sha: entry.sha,
    }));
}

async function downloadFile(file) {
  const url = `https://raw.githubusercontent.com/${REPO}/${branch}/${file.repoPath}`;
  const content = await fetchFile(url);
  const dest = join(TEMP_DIR, file.localPath);
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, content);
  return dest;
}

async function main() {
  console.log(`Source: github.com/${REPO} (branch: ${branch})`);
  console.log(`Target: docs/schemas/\n`);

  // Discover all .xsd files
  console.log("Discovering schemas...");
  const files = await discoverXsdFiles();

  if (files.length === 0) {
    console.error("No .xsd files found — check repo structure or branch name.");
    process.exit(1);
  }

  console.log(`Found ${files.length} XSD files\n`);

  // Clean temp directory if leftover from a previous failed run
  if (existsSync(TEMP_DIR)) {
    rmSync(TEMP_DIR, { recursive: true });
  }

  // Download all files into temp directory (parallel, batched to avoid rate limits)
  const BATCH_SIZE = 5;
  let downloaded = 0;

  try {
    for (let i = 0; i < files.length; i += BATCH_SIZE) {
      const batch = files.slice(i, i + BATCH_SIZE);
      await Promise.all(
        batch.map(async (file) => {
          await downloadFile(file);
          downloaded++;
          console.log(`  [${downloaded}/${files.length}] ${file.localPath}`);
        })
      );
    }

    // All downloads succeeded — atomically replace old directory with new one
    if (existsSync(OUT_DIR)) {
      rmSync(OUT_DIR, { recursive: true });
    }
    renameSync(TEMP_DIR, OUT_DIR);
  } catch (err) {
    // Clean up temp directory on failure; existing schemas remain intact
    if (existsSync(TEMP_DIR)) {
      rmSync(TEMP_DIR, { recursive: true });
    }
    throw err;
  }

  // Summary
  const dirs = [...new Set(files.map((f) => f.localPath.split("/")[0]))];
  console.log(`\nDone. ${downloaded} schemas in ${dirs.length} groups: ${dirs.join(", ")}`);
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
