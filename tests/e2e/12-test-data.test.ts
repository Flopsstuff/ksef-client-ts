import { describe, it, expect, beforeAll } from 'vitest';
import { authenticateWithCert } from './helpers/auth.js';
import { generateRandomNip, generateRandomPesel } from './helpers/identifiers.js';
import type { KSeFClient } from '../../src/client.js';

describe('12 - TestData API', { timeout: 120_000 }, () => {
  let client: KSeFClient;

  beforeAll(async () => {
    ({ client } = await authenticateWithCert());
  });

  it('should create and remove a test subject', async () => {
    const nip = generateRandomNip();
    await client.testData.createSubject({
      subjectNip: nip,
      subjectType: 'EnforcementAuthority',
      description: `E2E test subject ${Date.now()}`,
    });
    await client.testData.removeSubject({ subjectNip: nip });
  });

  it('should create and remove a test person', async () => {
    const nip = generateRandomNip();
    const pesel = generateRandomPesel();
    await client.testData.createPerson({
      nip,
      pesel,
      isBailiff: false,
      description: `E2E test person ${Date.now()}`,
    });
    await client.testData.removePerson({ nip });
  });

  it('should grant and revoke test permissions', async () => {
    const contextNip = generateRandomNip();
    const targetNip = generateRandomNip();

    // Create subjects first so they exist in the test environment
    await client.testData.createSubject({
      subjectNip: contextNip,
      subjectType: 'EnforcementAuthority',
      description: `E2E context ${Date.now()}`,
    });

    await client.testData.grantPermissions({
      contextIdentifier: { type: 'Nip', value: contextNip },
      authorizedIdentifier: { type: 'Nip', value: targetNip },
      permissions: [{ permissionType: 'InvoiceRead', description: 'E2E test' }],
    });

    await client.testData.revokePermissions({
      contextIdentifier: { type: 'Nip', value: contextNip },
      authorizedIdentifier: { type: 'Nip', value: targetNip },
    });

    // Cleanup
    await client.testData.removeSubject({ subjectNip: contextNip });
  });
});
