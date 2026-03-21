import { describe, it, expect, vi, beforeEach } from 'vitest';
import { peppolCommand } from '../../../../src/cli/commands/peppol.js';
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
  outputTable: vi.fn(),
  outputWarning: vi.fn(),
  outputKeyValue: vi.fn(),
  outputSuccess: vi.fn(),
}));

const mockRequireSession = vi.mocked(clientFactory.requireSession);
let mockClient: ReturnType<typeof createMockClient>;

beforeEach(() => {
  vi.clearAllMocks();
  mockClient = createMockClient();
  mockRequireSession.mockReturnValue({ client: mockClient as any, session: { ...validSession } });
});

describe('peppol', () => {
  it('providers — calls queryProviders', async () => {
    mockClient.peppol.queryProviders.mockResolvedValue({
      peppolProviders: [{ id: 'id-1', name: 'Provider 1', dateCreated: '2025-01-01T00:00:00Z' }],
      hasMore: false,
    });
    await (peppolCommand.subCommands!.providers as any).run!({ args: {} });
    expect(mockClient.peppol.queryProviders).toHaveBeenCalled();
    expect(output.outputTable).toHaveBeenCalled();
  });

  it('providers — empty shows warning', async () => {
    mockClient.peppol.queryProviders.mockResolvedValue({ peppolProviders: [], hasMore: false });
    await (peppolCommand.subCommands!.providers as any).run!({ args: {} });
    expect(output.outputWarning).toHaveBeenCalledWith(expect.stringContaining('No providers'));
  });

  it('providers — json flag outputs result as JSON', async () => {
    const result = {
      peppolProviders: [{ id: 'id-1', name: 'Provider 1', dateCreated: '2025-01-01T00:00:00Z' }],
      hasMore: false,
    };
    mockClient.peppol.queryProviders.mockResolvedValue(result);
    await (peppolCommand.subCommands!.providers as any).run!({ args: { json: true } });
    expect(output.outputResult).toHaveBeenCalledWith(result, { json: true });
  });

  it('providers — hasMore shows pagination hint', async () => {
    const { consola } = await import('consola');
    mockClient.peppol.queryProviders.mockResolvedValue({
      peppolProviders: [{ id: 'id-1', name: 'Provider 1', dateCreated: '2025-01-01T00:00:00Z' }],
      hasMore: true,
    });
    await (peppolCommand.subCommands!.providers as any).run!({ args: {} });
    expect(output.outputTable).toHaveBeenCalled();
    expect(consola.info).toHaveBeenCalledWith(expect.stringContaining('--page'));
  });
});
