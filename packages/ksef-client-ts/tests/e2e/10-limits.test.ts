import { describe, it, expect, beforeAll } from 'vitest';
import { authenticateWithCert } from './helpers/auth.js';
import type { KSeFClient } from '../../src/client.js';

describe('10 - Limits', { timeout: 60_000 }, () => {
  let client: KSeFClient;

  beforeAll(async () => {
    ({ client } = await authenticateWithCert());
  });

  it('should get context limits', async () => {
    const limits = await client.limits.getContextLimits();
    expect(limits).toBeDefined();
    expect(limits.onlineSession).toBeDefined();
    expect(limits.batchSession).toBeDefined();
  });

  it('should get subject limits', async () => {
    const limits = await client.limits.getSubjectLimits();
    expect(limits).toBeDefined();
  });

  it('should get rate limits', async () => {
    const limits = await client.limits.getRateLimits();
    expect(limits).toBeDefined();
    expect(limits.onlineSession).toBeDefined();
  });
});
