import { describe, it, expect } from 'vitest';
import { createTestClient } from './helpers/auth.js';

describe('01 - Lighthouse', { timeout: 30_000 }, () => {
  const client = createTestClient();

  it('should get KSeF system status', async () => {
    const status = await client.lighthouse.getStatus();
    expect(status).toBeDefined();
    expect(status.status).toBeDefined();
    expect(['AVAILABLE', 'MAINTENANCE', 'FAILURE', 'TOTAL_FAILURE']).toContain(status.status);
  });

  it('should get system messages', async () => {
    const messages = await client.lighthouse.getMessages();
    expect(Array.isArray(messages)).toBe(true);
    if (messages.length > 0) {
      expect(messages[0]).toHaveProperty('id');
      expect(messages[0]).toHaveProperty('title');
    }
  });
});
