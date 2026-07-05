/**
 * Verifies the `ksef-client-ts/pdf` subpath is a "cold" module against the built
 * dist:
 *   1. No top-level `require("pdfmake")` in the CJS build (must stay a lazy `import()`).
 *   2. Requiring/importing the subpath does NOT eagerly load pdfmake.
 *   3. Import/require never throws at module-load time (pdfmake absence surfaces
 *      only when a `render*` function is called).
 *
 * Run after `yarn build`. Exits non-zero on any violation.
 */
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const pkgDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cjsPath = path.join(pkgDir, 'dist/pdf/index.cjs');
const esmPath = path.join(pkgDir, 'dist/pdf/index.js');

let failures = 0;
const fail = (m) => {
  console.error('✗', m);
  failures++;
};
const ok = (m) => console.log('✓', m);

// 1) The CJS build must not statically require pdfmake — it must stay dynamic.
const cjs = readFileSync(cjsPath, 'utf8');
if (/(^|[^.\w])require\(\s*["']pdfmake/m.test(cjs)) {
  fail('dist/pdf/index.cjs has a top-level require("pdfmake") — it must be a lazy import()');
} else {
  ok('no top-level require("pdfmake") in dist/pdf/index.cjs');
}

const require = createRequire(import.meta.url);
const pdfmakeLoaded = () =>
  Object.keys(require.cache).some((k) => k.includes(`${path.sep}pdfmake${path.sep}`));

// 2 & 3) CJS require succeeds, exports render functions, and does not load pdfmake.
const before = pdfmakeLoaded();
const cjsMod = require(cjsPath);
if (typeof cjsMod.renderInvoicePdf !== 'function') {
  fail('CJS build did not export renderInvoicePdf');
} else {
  ok('CJS require of ./pdf succeeds and exports render functions');
}
if (!before && pdfmakeLoaded()) {
  fail('requiring ./pdf eagerly loaded pdfmake (not a cold module)');
} else {
  ok('requiring ./pdf did not load pdfmake (cold module)');
}

// ESM import must also succeed without throwing.
try {
  const esmMod = await import(pathToFileURL(esmPath).href);
  if (typeof esmMod.renderInvoicePdf !== 'function') {
    fail('ESM build did not export renderInvoicePdf');
  } else {
    ok('ESM import of ./pdf succeeds');
  }
} catch (err) {
  fail(`ESM import of ./pdf threw at load time: ${err.message}`);
}

if (failures > 0) {
  console.error(`\n${failures} cold-subpath check(s) failed.`);
  process.exit(1);
}
console.log('\nAll cold-subpath checks passed.');
