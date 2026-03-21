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
      providers: [{ identifier: 'id-1', name: 'Provider 1' }],
      hasMore: false,
    });
    await (peppolCommand.subCommands!.providers as any).run!({ args: {} });
    expect(mockClient.peppol.queryProviders).toHaveBeenCalled();
    expect(output.outputTable).toHaveBeenCalled();
  });

  it('providers — empty shows warning', async () => {
    mockClient.peppol.queryProviders.mockResolvedValue({ providers: [], hasMore: false });
    await (peppolCommand.subCommands!.providers as any).run!({ args: {} });
    expect(output.outputWarning).toHaveBeenCalledWith(expect.stringContaining('No providers'));
  });
});
