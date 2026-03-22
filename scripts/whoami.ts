#!/usr/bin/env tsx
/**
 * Quick "whoami" check: authenticates with KSEF_TOKEN + KSEF_NIP
 * against all 3 KSeF environments (TEST, DEMO, PROD) and queries personal grants.
 *
 * Usage:
 *   npx tsx scripts/whoami.ts
 *
 * Env vars:
 *   KSEF_TOKEN  — KSeF API token (required)
 *   KSEF_NIP    — Context NIP (required)
 */

import { KSeFClient } from '../src/client.js';
import type { EnvironmentName } from '../src/config/environments.js';

const TOKEN = process.env.KSEF_TOKEN;
const NIP = process.env.KSEF_NIP;

if (!TOKEN || !NIP) {
  console.error('Missing KSEF_TOKEN or KSEF_NIP env vars');
  process.exit(1);
}

const envs: EnvironmentName[] = ['TEST', 'DEMO', 'PROD'];

for (const env of envs) {
  console.log(`\n--- ${env} ---`);
  const client = new KSeFClient({ environment: env });

  try {
    await client.loginWithToken(TOKEN, NIP);
    console.log(`  Auth: OK`);

    const grants = await client.permissions.queryPersonalGrants({}, 0, 10);
    const items = grants.permissions ?? [];
    console.log(`  Permissions: ${items.length} grant(s)`);
    for (const p of items) {
      console.log(`    - ${p.permissionType ?? 'unknown'} (${p.permissionState ?? '?'})`);
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`  FAILED: ${msg}`);
  }
}
