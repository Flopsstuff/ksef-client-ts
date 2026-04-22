/**
 * Cross-runtime RSA-OAEP comparison harness.
 *
 * Same source runs on Node (`node scripts/crypto-compare.mjs`) and on Deno
 * (`deno run -A --no-config scripts/crypto-compare.mjs`). Each run:
 *
 *   1. Loads (or on first run, generates + saves) a fixed RSA-2048 self-signed
 *      cert + private key into `scripts/.crypto-fixtures/`. Both runtimes use
 *      the exact same key material so output comparisons are meaningful.
 *   2. Extracts the SPKI PEM from the cert via node:crypto APIs and hashes it
 *      — if the two runtimes produce different SPKIs, we have a bug before we
 *      even start encrypting.
 *   3. RSA-OAEP-encrypts a fixed plaintext and writes the ciphertext to
 *      `ciphertext-<runtime>.bin`.
 *   4. Decrypts its own ciphertext locally (runtime self-consistency check).
 *   5. If the OTHER runtime has already left its ciphertext behind, decrypts
 *      that too — this is the cross-runtime check that actually mirrors what
 *      MF does when it tries to decrypt our Deno ciphertext on its server.
 *
 * Run order (run twice to populate cross-decrypt):
 *   node scripts/crypto-compare.mjs                     # Node first
 *   deno run -A --no-config scripts/crypto-compare.mjs  # Deno second
 *   node scripts/crypto-compare.mjs                     # Node again — now cross-decrypts Deno's ciphertext
 */

import * as crypto from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Buffer } from 'node:buffer';

const runtime = typeof globalThis.Deno !== 'undefined' ? 'deno' : 'node';
const version =
  runtime === 'deno'
    ? globalThis.Deno.version.deno
    : (typeof process !== 'undefined' ? process.version : 'unknown');

const scriptDir = dirname(fileURLToPath(import.meta.url));
const fixtureDir = join(scriptDir, '.crypto-fixtures');
const certPath = join(fixtureDir, 'cert.pem');
const keyPath = join(fixtureDir, 'key.pem');
const myCtPath = join(fixtureDir, `ciphertext-${runtime}.bin`);

function log(section, obj) {
  console.log(`\n━━━ ${section} ━━━`);
  if (obj !== undefined) {
    console.log(typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2));
  }
}

function sha256Hex(s) {
  return crypto.createHash('sha256').update(s).digest('hex');
}

// ────────────────────────────────────────────────────────────────────────────
// 1. Fixtures
// ────────────────────────────────────────────────────────────────────────────

if (!existsSync(fixtureDir)) mkdirSync(fixtureDir, { recursive: true });

let certPem;
let keyPem;

if (existsSync(certPath) && existsSync(keyPath)) {
  certPem = readFileSync(certPath, 'utf-8');
  keyPem = readFileSync(keyPath, 'utf-8');
  console.log(`Runtime: ${runtime} ${version} · fixtures loaded from ${fixtureDir}`);
} else {
  console.log(`Runtime: ${runtime} ${version} · generating one-off RSA-2048 fixture`);
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
  });
  keyPem = privateKey.export({ type: 'pkcs8', format: 'pem' });
  // Minimal self-signed cert using a handrolled DER builder via X509Certificate's public signing is not stable across runtimes;
  // instead, just store the public key as PEM and skip the CERTIFICATE wrapper for this harness.
  // (We only want to exercise RSA-OAEP from SPKI PEM, which is what our production code does after extractSpkiPem.)
  certPem = publicKey.export({ type: 'spki', format: 'pem' });
  writeFileSync(certPath, certPem);
  writeFileSync(keyPath, keyPem);
  console.log('  wrote:', certPath, '+', keyPath);
}

// ────────────────────────────────────────────────────────────────────────────
// 2. SPKI extraction + hashing
// ────────────────────────────────────────────────────────────────────────────

log('Inputs');
console.log('  cert PEM (first 40):', certPem.slice(0, 40).replaceAll('\n', '\\n'));
console.log('  cert PEM sha256:', sha256Hex(certPem));

// Our production code does: new X509Certificate(certPem).publicKey.export({type:'spki',format:'pem'})
// Here the fixture is already a PUBLIC KEY PEM, so we just re-parse + re-export to exercise both APIs consistently.
const reParsedPublicKey = crypto.createPublicKey(certPem);
const spkiPem = reParsedPublicKey.export({ type: 'spki', format: 'pem' });
console.log('  SPKI PEM sha256:', sha256Hex(spkiPem));
console.log('  SPKI PEM (first 40):', spkiPem.slice(0, 40).replaceAll('\n', '\\n'));

const keyDetails = reParsedPublicKey.asymmetricKeyDetails;
console.log('  key type:', reParsedPublicKey.asymmetricKeyType, '· modulus:', keyDetails?.modulusLength);

// ────────────────────────────────────────────────────────────────────────────
// 3. Encrypt with production parameters
// ────────────────────────────────────────────────────────────────────────────

const plaintext = Buffer.from('test-token-xyz|1776880000000', 'utf-8');
log('Encrypt');
console.log('  plaintext (utf8):', plaintext.toString('utf-8'));
console.log('  plaintext sha256:', sha256Hex(plaintext));

const ciphertext = crypto.publicEncrypt(
  {
    key: spkiPem,
    oaepHash: 'sha256',
    padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
  },
  plaintext,
);
console.log('  ciphertext bytes:', ciphertext.length);
console.log('  ciphertext sha256:', sha256Hex(ciphertext));
writeFileSync(myCtPath, ciphertext);
console.log('  wrote:', myCtPath);

// ────────────────────────────────────────────────────────────────────────────
// 4. Self-decrypt
// ────────────────────────────────────────────────────────────────────────────

log('Self-decrypt (same runtime)');
try {
  const decrypted = crypto.privateDecrypt(
    {
      key: keyPem,
      oaepHash: 'sha256',
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
    },
    ciphertext,
  );
  const matches = decrypted.equals(plaintext);
  console.log('  ✓ decrypted, matches plaintext:', matches);
  if (!matches) {
    console.log('  got:', decrypted.toString('utf-8'));
    console.log('  expected:', plaintext.toString('utf-8'));
  }
} catch (err) {
  console.log('  ✗ decrypt threw:', err instanceof Error ? err.message : err);
}

// ────────────────────────────────────────────────────────────────────────────
// 5. Cross-decrypt (try to decrypt the OTHER runtime's ciphertext)
// ────────────────────────────────────────────────────────────────────────────

const otherRuntime = runtime === 'node' ? 'deno' : 'node';
const otherCtPath = join(fixtureDir, `ciphertext-${otherRuntime}.bin`);

log(`Cross-decrypt (${otherRuntime}-produced ciphertext, decrypted in ${runtime})`);
if (!existsSync(otherCtPath)) {
  console.log(`  (skip) ${otherRuntime}'s ciphertext not present yet — run ${otherRuntime} first, then re-run this script.`);
} else {
  const otherCt = readFileSync(otherCtPath);
  console.log('  other ciphertext bytes:', otherCt.length);
  console.log('  other ciphertext sha256:', sha256Hex(otherCt));

  // Attempt 1: standard OAEP-SHA256 (same params as our production code)
  try {
    const decrypted = crypto.privateDecrypt(
      {
        key: keyPem,
        oaepHash: 'sha256',
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      },
      otherCt,
    );
    const matches = decrypted.equals(plaintext);
    console.log('  ✓ OAEP-SHA256 decrypt OK, matches plaintext:', matches);
    if (!matches) {
      console.log('  got plaintext:', decrypted.toString('utf-8'));
    }
  } catch (err) {
    console.log('  ✗ OAEP-SHA256 decrypt threw:', err instanceof Error ? err.message : err);

    // Diagnostic: try with SHA-1 OAEP (the OpenSSL default) — if this succeeds,
    // it means the producing runtime actually emitted OAEP-SHA1, not OAEP-SHA256.
    try {
      const decrypted = crypto.privateDecrypt(
        {
          key: keyPem,
          oaepHash: 'sha1',
          padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        },
        otherCt,
      );
      console.log('  ⚠ OAEP-SHA1 decrypt OK — producing runtime emitted SHA-1 OAEP despite being asked for SHA-256');
      console.log('    decrypted:', decrypted.toString('utf-8'));
    } catch (err2) {
      console.log('  ✗ OAEP-SHA1 also threw:', err2 instanceof Error ? err2.message : err2);
    }
  }
}

// ────────────────────────────────────────────────────────────────────────────
// 6. Parameter-shape experiments — encrypt with several variants, write each
//    to its own file. The Node decrypt pass (next run on Node) will tell us
//    which variant produced OAEP-SHA256 vs which fell back to SHA-1.
// ────────────────────────────────────────────────────────────────────────────

const variants = [
  { name: 'baseline-oaepHash', opts: { oaepHash: 'sha256' } },
  { name: 'oaepMgf1Hash-explicit', opts: { oaepHash: 'sha256', oaepMgf1Hash: 'sha256' } },
  { name: 'mgf1Hash-explicit', opts: { oaepHash: 'sha256', mgf1Hash: 'sha256' } },
  { name: 'hash-only', opts: { hash: 'sha256' } },
  { name: 'KeyObject-not-PEM', opts: { oaepHash: 'sha256' }, useKeyObject: true },
  {
    name: 'webcrypto-subtle',
    opts: null, // signal: use crypto.subtle.encrypt instead of crypto.publicEncrypt
  },
];

log('Param-shape experiments');
for (const variant of variants) {
  const variantPath = join(fixtureDir, `experiment-${runtime}-${variant.name}.bin`);
  try {
    let ct;
    if (variant.opts === null && variant.name === 'webcrypto-subtle') {
      // Use Web Crypto API (standardized, no Node-compat ambiguity)
      const subtleKey = await crypto.subtle.importKey(
        'spki',
        Buffer.from(spkiPem.replace(/-----[^-]+-----|\s/g, ''), 'base64'),
        { name: 'RSA-OAEP', hash: 'SHA-256' },
        false,
        ['encrypt'],
      );
      const buf = await crypto.subtle.encrypt(
        { name: 'RSA-OAEP' },
        subtleKey,
        plaintext,
      );
      ct = Buffer.from(buf);
    } else {
      const keyArg = variant.useKeyObject ? reParsedPublicKey : spkiPem;
      ct = crypto.publicEncrypt(
        { key: keyArg, ...variant.opts, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING },
        plaintext,
      );
    }
    writeFileSync(variantPath, ct);
    console.log(`  [${variant.name}] ✓ wrote ${ct.length}B → ${variantPath.split('/').pop()}`);
  } catch (err) {
    console.log(`  [${variant.name}] ✗ encrypt threw:`, err instanceof Error ? err.message : err);
  }
}

// On Node, also try to decrypt every experiment file (from any runtime) to
// figure out which variants produced OAEP-SHA256 vs OAEP-SHA1 ciphertext.
if (runtime === 'node') {
  log('Decryption survey (Node decrypts all experiment files with OAEP-SHA256)');
  const { readdirSync } = await import('node:fs');
  const files = readdirSync(fixtureDir)
    .filter((f) => f.startsWith('experiment-') && f.endsWith('.bin'))
    .sort();

  for (const file of files) {
    const ct = readFileSync(join(fixtureDir, file));
    let result;
    try {
      const pt = crypto.privateDecrypt(
        { key: keyPem, oaepHash: 'sha256', padding: crypto.constants.RSA_PKCS1_OAEP_PADDING },
        ct,
      );
      result = pt.equals(plaintext) ? '✓ SHA-256 OK' : `✗ SHA-256 wrong plaintext`;
    } catch {
      try {
        const pt = crypto.privateDecrypt(
          { key: keyPem, oaepHash: 'sha1', padding: crypto.constants.RSA_PKCS1_OAEP_PADDING },
          ct,
        );
        result = pt.equals(plaintext) ? '⚠ ONLY decrypts as OAEP-SHA1' : '✗ SHA-1 wrong plaintext';
      } catch {
        result = '✗ neither SHA-256 nor SHA-1 decrypts';
      }
    }
    console.log(`  ${file.padEnd(60)} → ${result}`);
  }
}

console.log('\n=== DONE ===');
