import { describe, it, expect } from 'vitest';
import { authenticateWithCert } from './helpers/auth.js';

describe('13 - Peppol', { timeout: 60_000 }, () => {
  it('should query Peppol providers', async () => {
    const { client } = await authenticateWithCert();
    const result = await client.peppol.queryProviders();
    expect(result).toHaveProperty('peppolProviders');
    expect(Array.isArray(result.peppolProviders)).toBe(true);
    expect(result).toHaveProperty('hasMore');
  });
});
