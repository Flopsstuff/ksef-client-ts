import { describe, it, expect, vi, beforeEach } from 'vitest';
import { lighthouseCommand } from '../../../../src/cli/commands/lighthouse.js';
import * as clientFactory from '../../../../src/cli/client-factory.js';
import * as output from '../../../../src/cli/output.js';
import { createMockClient, defaultConfig } from './_helpers.js';

vi.mock('consola', () => ({ consola: { level: 0 } }));
vi.mock('../../../../src/cli/error-handler.js', () => ({
  withErrorHandler: vi.fn((fn) => fn()),
}));
vi.mock('../../../../src/cli/client-factory.js', () => ({
  createClient: vi.fn(),
}));
vi.mock('../../../../src/cli/config-store.js', () => ({
  loadConfig: vi.fn().mockReturnValue({ environment: 'test', output: 'pretty', timeout: 30000 }),
}));
vi.mock('../../../../src/cli/output.js', () => ({
  outputResult: vi.fn(),
  outputKeyValue: vi.fn(),
  outputTable: vi.fn(),
  outputWarning: vi.fn(),
  outputSuccess: vi.fn(),
}));

const mockCreateClient = vi.mocked(clientFactory.createClient);
const mockOutputKeyValue = vi.mocked(output.outputKeyValue);
const mockOutputWarning = vi.mocked(output.outputWarning);
let mockClient: ReturnType<typeof createMockClient>;

beforeEach(() => {
  vi.clearAllMocks();
  mockClient = createMockClient();
  mockCreateClient.mockReturnValue(mockClient as any);
});

describe('lighthouse', () => {
  it('status — calls getStatus and outputs result', async () => {
    mockClient.lighthouse.getStatus.mockResolvedValue({ status: 'AVAILABLE', timestamp: '2024-01-01' });
    await (lighthouseCommand.subCommands!.status as any).run!({ args: {} });
    expect(mockClient.lighthouse.getStatus).toHaveBeenCalled();
    expect(mockOutputKeyValue).toHaveBeenCalled();
  });

  it('messages — empty shows warning', async () => {
    mockClient.lighthouse.getMessages.mockResolvedValue([]);
    await (lighthouseCommand.subCommands!.messages as any).run!({ args: {} });
    expect(mockOutputWarning).toHaveBeenCalledWith(expect.stringContaining('No system messages'));
  });

  it('messages — with data shows table', async () => {
    mockClient.lighthouse.getMessages.mockResolvedValue([
      { title: 'Maintenance', category: 'System', type: 'Info', start: '2024-01-01' },
    ]);
    await (lighthouseCommand.subCommands!.messages as any).run!({ args: {} });
    expect(output.outputTable).toHaveBeenCalled();
  });
});
