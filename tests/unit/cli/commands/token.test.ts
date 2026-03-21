import { describe, it, expect, vi, beforeEach } from 'vitest';
import { tokenCommand } from '../../../../src/cli/commands/token.js';
import * as clientFactory from '../../../../src/cli/client-factory.js';
import * as output from '../../../../src/cli/output.js';
import { createMockClient, validSession } from './_helpers.js';

vi.mock('consola', () => ({ consola: { level: 0, info: vi.fn() } }));
vi.mock('../../../../src/cli/error-handler.js', () => ({
  withErrorHandler: vi.fn((fn) => fn()),
}));
vi.mock('../../../../src/cli/client-factory.js', () => ({
  requireSession: vi.fn(),
}));
vi.mock('../../../../src/cli/output.js', () => ({
  outputResult: vi.fn(),
  outputKeyValue: vi.fn(),
  outputTable: vi.fn(),
  outputSuccess: vi.fn(),
  outputWarning: vi.fn(),
}));

const mockRequireSession = vi.mocked(clientFactory.requireSession);
let mockClient: ReturnType<typeof createMockClient>;

beforeEach(() => {
  vi.clearAllMocks();
  mockClient = createMockClient();
  mockRequireSession.mockReturnValue({ client: mockClient as any, session: { ...validSession } });
});

describe('token', () => {
  it('generate — throws without permissions', async () => {
    await expect(
      (tokenCommand.subCommands!.generate as any).run!({ args: {} }),
    ).rejects.toThrow('--permissions is required');
  });

  it('generate — splits permissions and calls generateToken', async () => {
    mockClient.tokens.generateToken.mockResolvedValue({ referenceNumber: 'ref-1', token: 'tok-1' });
    await (tokenCommand.subCommands!.generate as any).run!({
      args: { permissions: 'InvoiceRead,InvoiceWrite', description: 'Test token' },
    });
    expect(mockClient.tokens.generateToken).toHaveBeenCalledWith(
      expect.objectContaining({ permissions: ['InvoiceRead', 'InvoiceWrite'] }),
    );
  });

  it('revoke — calls revokeToken', async () => {
    await (tokenCommand.subCommands!.revoke as any).run!({ args: { ref: 'tok-ref-1' } });
    expect(mockClient.tokens.revokeToken).toHaveBeenCalledWith('tok-ref-1');
  });
});
