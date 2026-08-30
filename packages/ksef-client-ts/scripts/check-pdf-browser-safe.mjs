/**
 * Guards the browser-safety of the `./pdf` subpath.
 *
 * `ksef-client-ts/pdf` promises an isomorphic render: XML in, PDF bytes out,
 * no Node builtin anywhere on the way. That promise is one careless import away
 * from being false, and the failure is invisible on Node — it shows up as a
 * bundler error in somebody else's project. So the built bundles are read back
 * and checked here.
 *
 * The patterns match STATIC imports only. One lazy `import()` survives, in the
 * pdfmake version probe, and it hides its specifier in a variable precisely so
 * a browser bundler never resolves it; an `import("node:…")` literal in the
 * output would mean a bundler folded that variable away, which is why the
 * literal form is a violation too.
 */
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

export const pdfBundlePaths = ["dist/pdf/index.js", "dist/pdf/index.cjs"];

export const nodeLeakPatterns = [
  { label: 'from "node:*"', pattern: /from\s*["']node:/ },
  { label: 'require("node:*")', pattern: /require\s*\(\s*["']node:/ },
  { label: 'import("node:*")', pattern: /import\s*\(\s*["']node:/ },
  {
    // `removeNodeProtocol: false` keeps the prefix today; catch the bare form
    // in case that ever changes.
    label: 'bare node builtin',
    pattern: /from\s*["'](?:fs|fs\/promises|crypto|module|path|os|stream|buffer)["']/,
  },
  {
    label: 'require("fs")-style bare builtin',
    pattern: /require\s*\(\s*["'](?:fs|fs\/promises|crypto|module|path|os|stream|buffer)["']\s*\)/,
  },
  { label: "Buffer.from/alloc/concat", pattern: /\bBuffer\s*\.\s*(?:from|alloc|allocUnsafe|concat|isBuffer)\b/ },
  { label: "new Buffer", pattern: /\bnew\s+Buffer\b/ },
];

export function findNodeMarkers(source) {
  return nodeLeakPatterns
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

export async function checkPdfBrowserSafe() {
  const failures = [];

  for (const relativePath of pdfBundlePaths) {
    const markers = findNodeMarkers(await readBundle(relativePath));

    if (markers.length > 0) {
      failures.push(`${relativePath}: ${markers.join(", ")}`);
    }
  }

  if (failures.length > 0) {
    throw new Error(
      `./pdf browser-safety guard failed — a Node builtin reached the subpath bundle:\n- ${failures.join("\n- ")}`,
    );
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  checkPdfBrowserSafe().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
