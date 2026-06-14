// Deno runtime smoke test for ksef-client-ts.
//
// Two sections:
//
//   Section 1 (LOCAL ROUND-TRIP, no network)
//     Generates a self-signed RSA keypair, injects it as both KSeF certs via
//     a stub fetcher, runs `encryptKsefToken` through the real production
//     code path, then decrypts the ciphertext with the matching private key
//     via Web Crypto with explicit `{ name: 'RSA-OAEP', hash: 'SHA-256' }`.
//     If a future change makes `encryptKsefToken` emit OAEP-SHA1 again
//     (the issue #18 bug class), `subtle.decrypt` will fail here with a
//     clear error — the shape-only checks we had before could not catch it.
//
//   Section 2 (NETWORK)
//     Hits KSeF TEST public endpoints (challenge + certificates) and
//     exercises the same methods against the real MF cert chain. Ensures
//     nothing else regresses (HTTP, URL resolution, cert parsing, etc.).
//
// Run locally: yarn build && deno task smoke
// Assumes: yarn install + yarn build have run, and libxmljs2 is absent
// from node_modules (its native binding segfaults Deno; CI rms it).

import {
  CertificateService,
  CryptographyService,
  KSeFClient,
  type CertificateFetcher,
} from '../../dist/index.js';
import { Buffer } from 'node:buffer';

function ok(msg: string): void {
  console.log(`✓ ${msg}`);
}

function fail(msg: string): never {
  console.error(`✗ ${msg}`);
  Deno.exit(1);
}

console.log(`Deno version: ${Deno.version.deno}`);

// ───────────────────────────────────────────────────────────────────────────
// Section 1: local round-trip — proves OAEP-SHA256 correctness on Deno.
//
// This is the assertion the old smoke couldn't make. Previously Deno's
// publicEncrypt silently defaulted MGF1+OAEP to SHA-1, yet the resulting
// ciphertext was still 256 bytes so shape-only checks stayed green. By
// decrypting with a Web Crypto private key *imported with explicit SHA-256*,
// we force the runtime's declared hash to match the actual OAEP hash in
// the ciphertext: a mismatch surfaces as a decryption failure, not a
// silent pass.
// ───────────────────────────────────────────────────────────────────────────

console.log('\n━━━ Section 1: local OAEP-SHA256 round-trip (no network) ━━━');

const { certificatePem, privateKeyPem } = await CertificateService.generateCompanySeal(
  'Deno Smoke',
  'VATPL-0000000000',
  'Deno Smoke Test',
  'RSA',
);

// Stub fetcher that returns the self-signed cert for both roles. The real
// CertificateFetcher hits KSeF /security/publicKeyCertificates; we don't
// want that for the local round-trip.
const stubFetcher = {
  async init() { /* no-op */ },
  async refresh() { /* no-op */ },
  getSymmetricKeyEncryptionPem(): string { return certificatePem; },
  getKsefTokenEncryptionPem(): string { return certificatePem; },
} satisfies Pick<
  CertificateFetcher,
  'init' | 'refresh' | 'getSymmetricKeyEncryptionPem' | 'getKsefTokenEncryptionPem'
>;

const localCrypto = new CryptographyService(stubFetcher as unknown as CertificateFetcher);

const smokeToken = 'local-roundtrip-token';
const smokeTimestamp = new Date().toISOString();
const smokeTimestampMs = new Date(smokeTimestamp).getTime();

const ciphertext = await localCrypto.encryptKsefToken(smokeToken, smokeTimestamp);
if (!(ciphertext instanceof Uint8Array) || ciphertext.length === 0) {
  fail(`encryptKsefToken did not produce a non-empty Uint8Array (got length=${ciphertext?.length})`);
}
ok(`encryptKsefToken produced ${ciphertext.length} bytes`);

// Import the matching private key into Web Crypto with explicit SHA-256.
// A ciphertext encrypted with a *different* OAEP hash cannot be decrypted
// here — this is exactly what catches the issue #18 regression class.
function pemToDer(pem: string, label: string): Uint8Array {
  const base64 = pem
    .replace(`-----BEGIN ${label}-----`, '')
    .replace(`-----END ${label}-----`, '')
    .replace(/\s/g, '');
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

const privateKey = await crypto.subtle.importKey(
  'pkcs8',
  pemToDer(privateKeyPem, 'PRIVATE KEY'),
  { name: 'RSA-OAEP', hash: 'SHA-256' },
  false,
  ['decrypt'],
);

let decrypted: ArrayBuffer;
try {
  decrypted = await crypto.subtle.decrypt({ name: 'RSA-OAEP' }, privateKey, ciphertext);
} catch (err) {
  fail(
    `OAEP-SHA256 decrypt failed — encryptKsefToken produced ciphertext the runtime ` +
      `could not decrypt as SHA-256. This is the issue #18 symptom: the runtime ` +
      `silently downgraded OAEP to SHA-1. Error: ${err instanceof Error ? err.message : err}`,
  );
}

const decoded = new TextDecoder().decode(decrypted);
const expected = `${smokeToken}|${smokeTimestampMs}`;
if (decoded !== expected) {
  fail(`decrypted plaintext mismatch: got ${JSON.stringify(decoded)}, expected ${JSON.stringify(expected)}`);
}
ok(`subtle.decrypt (RSA-OAEP SHA-256) round-trip matches plaintext`);

// Sanity counter-check: the same ciphertext must *fail* to decrypt when
// imported with SHA-1. If this one succeeds, either the ciphertext wasn't
// really SHA-256 or the runtime is conflating the two. Either way: bug.
const privateKeySha1 = await crypto.subtle.importKey(
  'pkcs8',
  pemToDer(privateKeyPem, 'PRIVATE KEY'),
  { name: 'RSA-OAEP', hash: 'SHA-1' },
  false,
  ['decrypt'],
);
let sha1Succeeded = false;
try {
  await crypto.subtle.decrypt({ name: 'RSA-OAEP' }, privateKeySha1, ciphertext);
  sha1Succeeded = true;
} catch {
  // expected — ciphertext is SHA-256, not SHA-1
}
if (sha1Succeeded) {
  fail(`OAEP-SHA1 decrypt of the ciphertext succeeded — means encryptKsefToken actually emitted SHA-1, not SHA-256`);
}
ok(`subtle.decrypt (RSA-OAEP SHA-1) correctly rejects the ciphertext`);

// ───────────────────────────────────────────────────────────────────────────
// Section 2: network smoke against real KSeF TEST cert chain.
// ───────────────────────────────────────────────────────────────────────────

console.log('\n━━━ Section 2: KSeF TEST public endpoints ━━━');

const client = new KSeFClient({ environment: 'TEST' });

const challenge = await client.auth.getChallenge();
if (!challenge.challenge || !challenge.timestamp) {
  fail('auth.getChallenge did not return a valid challenge');
}
ok(`auth.getChallenge — timestampMs=${challenge.timestampMs}`);

await client.crypto.init();
ok('crypto.init — KSeF public certificates fetched');

const encryptedToken = await client.crypto.encryptKsefToken('deno-smoke-token', challenge.timestamp);
if (!(encryptedToken instanceof Uint8Array)) {
  fail(`crypto.encryptKsefToken did not return a Uint8Array (got ${typeof encryptedToken})`);
}
if (encryptedToken.length === 0) {
  fail('crypto.encryptKsefToken returned an empty Uint8Array');
}
ok(`crypto.encryptKsefToken — ${encryptedToken.length} bytes`);

const encryptionData = await client.crypto.getEncryptionData();
const wrappedKeyLength = atob(encryptionData.encryptionInfo.encryptedSymmetricKey).length;
if (wrappedKeyLength === 0) {
  fail('crypto.getEncryptionData produced an empty encryptedSymmetricKey');
}
ok(`crypto.getEncryptionData — encryptedSymmetricKey=${wrappedKeyLength}B, cipherKey=${encryptionData.cipherKey.length}B, cipherIv=${encryptionData.cipherIv.length}B`);

// (Buffer import kept for future additions; silence Deno's unused-import complaint if any.)
void Buffer;

console.log('\nAll Deno smoke checks passed.');
