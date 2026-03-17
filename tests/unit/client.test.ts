import { KSeFClient } from '../../src/client.js';

describe('KSeFClient', () => {
  it('constructs with default options', () => {
    const client = new KSeFClient();
    expect(client.options.apiVersion).toBe('v2');
    expect(client.auth).toBeDefined();
    expect(client.crypto).toBeDefined();
    expect(client.qr).toBeDefined();
  });

  it('accepts transport config options', () => {
    const transport = vi.fn();
    const client = new KSeFClient({
      transport,
      retry: { maxRetries: 5 },
      rateLimit: { globalRps: 20 },
      presignedUrlHosts: ['*.s3.amazonaws.com'],
    });

    expect(client.options).toBeDefined();
    expect(client.auth).toBeDefined();
  });

  it('accepts null rateLimit to disable rate limiting', () => {
    const client = new KSeFClient({ rateLimit: null });
    expect(client.options).toBeDefined();
  });

  it('creates all service properties', () => {
    const client = new KSeFClient();
    expect(client.auth).toBeDefined();
    expect(client.activeSessions).toBeDefined();
    expect(client.onlineSession).toBeDefined();
    expect(client.batchSession).toBeDefined();
    expect(client.sessionStatus).toBeDefined();
    expect(client.invoices).toBeDefined();
    expect(client.permissions).toBeDefined();
    expect(client.tokens).toBeDefined();
    expect(client.certificates).toBeDefined();
    expect(client.lighthouse).toBeDefined();
    expect(client.limits).toBeDefined();
    expect(client.peppol).toBeDefined();
    expect(client.testData).toBeDefined();
    expect(client.crypto).toBeDefined();
    expect(client.qr).toBeDefined();
  });
});
