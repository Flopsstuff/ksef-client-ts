// Deno runtime smoke test for ksef-client-ts.
//
// Imports the built ESM bundle from dist/, then exercises both
// `crypto.publicEncrypt` call-sites end-to-end against KSeF TEST's public
// endpoints. Catches regressions in the two Deno-compat fixes (SPKI
// extraction + preserved `node:` prefix in bundled imports).
//
// Run locally: yarn build && deno task smoke
// Assumes: yarn install + yarn build have run, and libxmljs2 is either
// absent from node_modules or its native binding is Deno-compatible
// (see CI workflow for why we rm it before running).

import { KSeFClient } from '../../dist/index.js';

function ok(msg: string): void {
  console.log(`✓ ${msg}`);
}

function fail(msg: string): never {
  console.error(`✗ ${msg}`);
  Deno.exit(1);
}

console.log(`Deno version: ${Deno.version.deno}`);
console.log('Smoke-testing ksef-client-ts against KSeF TEST...\n');

const client = new KSeFClient({ environment: 'TEST' });

const challenge = await client.auth.getChallenge();
if (!challenge.challenge || !challenge.timestamp) {
  fail('auth.getChallenge did not return a valid challenge');
}
ok(`auth.getChallenge — timestampMs=${challenge.timestampMs}`);

await client.crypto.init();
ok('crypto.init — KSeF public certificates fetched');

const encryptedToken = client.crypto.encryptKsefToken('deno-smoke-token', challenge.timestamp);
if (!(encryptedToken instanceof Uint8Array)) {
  fail(`crypto.encryptKsefToken did not return a Uint8Array (got ${typeof encryptedToken})`);
}
if (encryptedToken.length === 0) {
  fail('crypto.encryptKsefToken returned an empty Uint8Array');
}
ok(`crypto.encryptKsefToken — ${encryptedToken.length} bytes`);

const encryptionData = client.crypto.getEncryptionData();
const wrappedKeyLength = atob(encryptionData.encryptionInfo.encryptedSymmetricKey).length;
if (wrappedKeyLength === 0) {
  fail('crypto.getEncryptionData produced an empty encryptedSymmetricKey');
}
ok(`crypto.getEncryptionData — encryptedSymmetricKey=${wrappedKeyLength}B, cipherKey=${encryptionData.cipherKey.length}B, cipherIv=${encryptionData.cipherIv.length}B`);

console.log('\nAll Deno smoke checks passed.');
