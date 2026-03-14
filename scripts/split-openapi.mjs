#!/usr/bin/env node

/**
 * Splits docs/open-api.json into per-tag chunks under docs/openapi-chunks/.
 * Removes all "description" fields to reduce token count.
 *
 * Usage: node scripts/split-openapi.mjs
 */

import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const INPUT = join(ROOT, "docs", "open-api.json");
const OUT_DIR = join(ROOT, "docs", "openapi-chunks");

// --- helpers ---

function stripDescriptions(obj) {
  if (Array.isArray(obj)) return obj.map(stripDescriptions);
  if (obj && typeof obj === "object") {
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      if (k === "description") continue;
      out[k] = stripDescriptions(v);
    }
    return out;
  }
  return obj;
}

function slugify(tag) {
  return tag
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Collect all $ref targets used in an object (recursively). */
function collectRefs(obj, refs = new Set()) {
  if (Array.isArray(obj)) {
    obj.forEach((item) => collectRefs(item, refs));
  } else if (obj && typeof obj === "object") {
    for (const [k, v] of Object.entries(obj)) {
      if (k === "$ref" && typeof v === "string" && v.startsWith("#/components/schemas/")) {
        refs.add(v.replace("#/components/schemas/", ""));
      }
      collectRefs(v, refs);
    }
  }
  return refs;
}

/** Recursively resolve all schema refs (including nested ones). */
function resolveAllRefs(schemaNames, allSchemas) {
  const resolved = new Set();
  const queue = [...schemaNames];
  while (queue.length) {
    const name = queue.pop();
    if (resolved.has(name)) continue;
    if (!allSchemas[name]) continue;
    resolved.add(name);
    const nested = collectRefs(allSchemas[name]);
    for (const n of nested) {
      if (!resolved.has(n)) queue.push(n);
    }
  }
  return resolved;
}

const TAG_EN = {
  "Aktywne sesje": "Active Sessions",
  "Certyfikaty": "Certificates",
  "Certyfikaty klucza publicznego": "Public Key Certificates",
  "Dane testowe": "Test Data",
  "Limity i ograniczenia": "Limits & Restrictions",
  "Nadawanie uprawnień": "Granting Permissions",
  "Odbieranie uprawnień": "Revoking Permissions",
  "Operacje": "Operations",
  "Pobieranie faktur": "Invoice Download",
  "Status wysyłki i UPO": "Send Status & UPO",
  "Tokeny KSeF": "KSeF Tokens",
  "Usługi Peppol": "Peppol Services",
  "Uzyskiwanie dostępu": "Authentication",
  "Wysyłka interaktywna": "Interactive Send",
  "Wysyłka wsadowa": "Batch Send",
  "Wyszukiwanie nadanych uprawnień": "Permission Search",
};

// --- main ---

const spec = JSON.parse(readFileSync(INPUT, "utf8"));
const allSchemas = spec.components?.schemas || {};

// Group paths by first tag
const tagPaths = new Map();
for (const [path, methods] of Object.entries(spec.paths)) {
  for (const [, op] of Object.entries(methods)) {
    if (op.tags?.[0]) {
      const tag = op.tags[0];
      if (!tagPaths.has(tag)) tagPaths.set(tag, {});
      tagPaths.get(tag)[path] = spec.paths[path];
      break;
    }
  }
}

// Clean output dir
rmSync(OUT_DIR, { recursive: true, force: true });
mkdirSync(OUT_DIR, { recursive: true });

const manifest = [];

for (const [tag, paths] of tagPaths) {
  // Find all referenced schemas
  const directRefs = collectRefs(paths);
  const allRefs = resolveAllRefs(directRefs, allSchemas);

  const schemas = {};
  for (const name of [...allRefs].sort()) {
    schemas[name] = allSchemas[name];
  }

  const chunk = stripDescriptions({
    openapi: spec.openapi,
    info: { title: spec.info.title, version: spec.info.version },
    paths,
    components: { schemas },
  });

  const enTag = TAG_EN[tag] || tag;
  const slug = slugify(enTag);
  const filename = `${slug}.json`;
  const outPath = join(OUT_DIR, filename);
  const content = JSON.stringify(chunk, null, 2);

  writeFileSync(outPath, content);

  const routes = Object.entries(paths).flatMap(([path, methods]) =>
    Object.keys(methods).map((m) => `${m.toUpperCase()} ${path}`)
  );

  manifest.push({
    tag: enTag,
    file: filename,
    routes: routes.length,
    schemas: allRefs.size,
    bytes: Buffer.byteLength(content),
  });
}

// Write manifest
const manifestContent = manifest
  .map(
    (m) =>
      `${m.file} — ${m.tag} (${m.routes} routes, ${m.schemas} schemas, ${(m.bytes / 1024).toFixed(1)} KB)`
  )
  .join("\n");
writeFileSync(join(OUT_DIR, "_manifest.txt"), manifestContent + "\n");

console.log(`Split into ${manifest.length} chunks in docs/openapi-chunks/\n`);
console.log(manifestContent);

const totalBytes = manifest.reduce((s, m) => s + m.bytes, 0);
console.log(`\nTotal: ${(totalBytes / 1024).toFixed(1)} KB (original: ${(readFileSync(INPUT).length / 1024).toFixed(0)} KB)`);
