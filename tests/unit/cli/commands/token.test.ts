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
  mockRequireSession.mockResolvedValue({ client: mockClient as any, session: { ...validSession } });
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

  it('generate — outputs JSON when --json flag is set', async () => {
    const result = { referenceNumber: 'ref-1', token: 'tok-1' };
    mockClient.tokens.generateToken.mockResolvedValue(result);
    await (tokenCommand.subCommands!.generate as any).run!({
      args: { permissions: 'InvoiceRead', description: 'Test token', json: true },
    });
    expect(vi.mocked(output.outputResult)).toHaveBeenCalledWith(result, { json: true });
  });

  it('revoke — calls revokeToken', async () => {
    await (tokenCommand.subCommands!.revoke as any).run!({ args: { ref: 'tok-ref-1' } });
    expect(mockClient.tokens.revokeToken).toHaveBeenCalledWith('tok-ref-1');
  });

  it('revoke — outputs JSON when --json flag is set', async () => {
    await (tokenCommand.subCommands!.revoke as any).run!({ args: { ref: 'tok-ref-1', json: true } });
    expect(mockClient.tokens.revokeToken).toHaveBeenCalledWith('tok-ref-1');
    expect(vi.mocked(output.outputResult)).toHaveBeenCalledWith(
      { status: 'revoked', referenceNumber: 'tok-ref-1' },
      { json: true },
    );
  });

  describe('list', () => {
    it('outputs JSON when --json flag is set', async () => {
      const result = { tokens: [{ referenceNumber: 'ref-1' }], continuationToken: undefined };
      mockClient.tokens.queryTokens.mockResolvedValue(result);
      await (tokenCommand.subCommands!.list as any).run!({ args: { json: true } });
      expect(vi.mocked(output.outputResult)).toHaveBeenCalledWith(result, { json: true });
    });

    it('shows warning when no tokens found', async () => {
      mockClient.tokens.queryTokens.mockResolvedValue({ tokens: [], continuationToken: undefined });
      await (tokenCommand.subCommands!.list as any).run!({ args: {} });
      expect(vi.mocked(output.outputWarning)).toHaveBeenCalledWith('No tokens found.');
    });

    it('shows continuation token info when available', async () => {
      const { consola } = await import('consola');
      mockClient.tokens.queryTokens.mockResolvedValue({
        tokens: [
          {
            referenceNumber: 'ref-1',
            description: 'Test',
            status: 'Active',
            requestedPermissions: ['InvoiceRead'],
            dateCreated: '2024-01-01',
          },
        ],
        continuationToken: 'next-page-token',
      });
      await (tokenCommand.subCommands!.list as any).run!({ args: {} });
      expect(vi.mocked(output.outputTable)).toHaveBeenCalled();
      expect(consola.info).toHaveBeenCalledWith(expect.stringContaining('next-page-token'));
    });
  });

  describe('get', () => {
    const tokenDetail = {
      referenceNumber: 'tok-ref-1',
      description: 'My Token',
      status: 'Active',
      requestedPermissions: ['InvoiceRead', 'InvoiceWrite'],
      authorIdentifier: { type: 'Nip', value: '1234567890' },
      contextIdentifier: { type: 'Nip', value: '9876543210' },
      dateCreated: '2024-01-01',
      lastUseDate: '2024-06-01',
    };

    it('displays token details as key-value', async () => {
      mockClient.tokens.getToken.mockResolvedValue(tokenDetail);
      await (tokenCommand.subCommands!.get as any).run!({ args: { ref: 'tok-ref-1' } });
      expect(mockClient.tokens.getToken).toHaveBeenCalledWith('tok-ref-1');
      expect(vi.mocked(output.outputKeyValue)).toHaveBeenCalledWith(
        expect.objectContaining({
          'Reference': 'tok-ref-1',
          'Description': 'My Token',
          'Status': 'Active',
          'Last Used': '2024-06-01',
        }),
        { json: false },
      );
    });

    it('displays "Never" for lastUseDate when null', async () => {
      mockClient.tokens.getToken.mockResolvedValue({ ...tokenDetail, lastUseDate: null });
      await (tokenCommand.subCommands!.get as any).run!({ args: { ref: 'tok-ref-1' } });
      expect(vi.mocked(output.outputKeyValue)).toHaveBeenCalledWith(
        expect.objectContaining({ 'Last Used': 'Never' }),
        { json: false },
      );
    });

    it('outputs JSON when --json flag is set', async () => {
      mockClient.tokens.getToken.mockResolvedValue(tokenDetail);
      await (tokenCommand.subCommands!.get as any).run!({ args: { ref: 'tok-ref-1', json: true } });
      expect(vi.mocked(output.outputResult)).toHaveBeenCalledWith(tokenDetail, { json: true });
    });
  });
});
