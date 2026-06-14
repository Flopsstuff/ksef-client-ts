import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

export const coreBundlePaths = ["dist/index.js", "dist/index.cjs"];
export const nodeBundlePaths = ["dist/node.js", "dist/node.cjs"];

export const fsLeakPatterns = [
  { label: "node:fs/promises", pattern: /node:fs\/promises/ },
  { label: "node:fs", pattern: /node:fs/ },
  { label: "fs/promises", pattern: /(?<!node:)fs\/promises/ },
  {
    label: "require(\"fs\")",
    pattern: /require\s*\(\s*["'](?:node:)?fs["']\s*\)/,
  },
  {
    label: "require(\"fs/promises\")",
    pattern: /require\s*\(\s*["'](?:node:)?fs\/promises["']\s*\)/,
  },
  {
    label: "from \"fs\"",
    pattern: /from\s*["'](?:node:)?fs["']/,
  },
  {
    label: "from \"fs/promises\"",
    pattern: /from\s*["'](?:node:)?fs\/promises["']/,
  },
  { label: "readFileSync", pattern: /\breadFileSync\b/ },
  { label: "writeFileSync", pattern: /\bwriteFileSync\b/ },
  { label: "readFile", pattern: /\breadFile\b/ },
  { label: "writeFile", pattern: /\bwriteFile\b/ },
  { label: "homedir", pattern: /\bhomedir\b/ },
];

export function findFsMarkers(source) {
  return fsLeakPatterns
    .filter(({ pattern }) => pattern.test(source))
    .map(({ label }) => label);
}

async function readBundle(relativePath) {
  const absolutePath = path.join(packageRoot, relativePath);

  try {
    return await readFile(absolutePath, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw new Error(`Missing built bundle: ${relativePath}. Run yarn build first.`);
    }

    throw error;
  }
}

export async function checkFsFreeCore() {
  const failures = [];

  for (const relativePath of coreBundlePaths) {
    const source = await readBundle(relativePath);
    const markers = findFsMarkers(source);

    if (markers.length > 0) {
      failures.push(`${relativePath}: ${markers.join(", ")}`);
    }
  }

  for (const relativePath of nodeBundlePaths) {
    const nodeBundleMarkers = findFsMarkers(await readBundle(relativePath));

    if (nodeBundleMarkers.length === 0) {
      failures.push(`${relativePath}: expected fs marker for node-only entry`);
    }
  }

  if (failures.length > 0) {
    throw new Error(`fs cleanliness guard failed:\n- ${failures.join("\n- ")}`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  checkFsFreeCore().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
