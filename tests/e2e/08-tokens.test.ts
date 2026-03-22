import { describe, it, expect } from 'vitest';
import { authenticateWithCert } from './helpers/auth.js';

describe('08 - Token Lifecycle', { timeout: 120_000 }, () => {
  it('should generate, query, get, and revoke a token', async () => {
    const { client } = await authenticateWithCert();
    const description = `E2E test token ${Date.now()}`;

    // Step 1: Generate token
    const genResp = await client.tokens.generateToken({
      description,
      permissions: ['InvoiceRead'],
    });
    expect(genResp.referenceNumber).toBeTruthy();
    expect(genResp.token).toBeTruthy();

    // Step 2: Query tokens — find the generated one
    const queryResp = await client.tokens.queryTokens({ description });
    expect(queryResp.tokens.length).toBeGreaterThan(0);
    const found = queryResp.tokens.find((t) => t.description === description);
    expect(found).toBeDefined();

    // Step 3: Get token by reference
    const tokenStatus = await client.tokens.getToken(genResp.referenceNumber);
    expect(tokenStatus.description).toBe(description);
    expect(tokenStatus.requestedPermissions).toContain('InvoiceRead');

    // Step 4: Revoke token
    await client.tokens.revokeToken(genResp.referenceNumber);

    // Step 5: Verify revoked status
    const afterRevoke = await client.tokens.getToken(genResp.referenceNumber);
    expect(['Revoked', 'Revoking']).toContain(afterRevoke.status);
  });
});
