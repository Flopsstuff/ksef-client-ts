import { describe, it, expect, vi, beforeEach } from 'vitest';
import { doctorCommand } from '../../../../src/cli/commands/doctor.js';
import * as clientFactory from '../../../../src/cli/client-factory.js';
import * as configStore from '../../../../src/cli/config-store.js';
import * as sessionStore from '../../../../src/cli/session-store.js';
import * as output from '../../../../src/cli/output.js';
import { consola } from 'consola';
import { createMockClient, defaultConfig, validSession } from './_helpers.js';

vi.mock('consola', () => ({
  consola: { level: 0, success: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../../../../src/cli/error-handler.js', () => ({
  withErrorHandler: vi.fn((fn) => fn()),
}));

vi.mock('../../../../src/cli/client-factory.js', () => ({
  createClient: vi.fn(),
}));

vi.mock('../../../../src/cli/config-store.js', () => ({
  loadConfig: vi.fn(),
}));

vi.mock('../../../../src/cli/session-store.js', () => ({
  loadSession: vi.fn(),
  isSessionExpired: vi.fn(),
}));

vi.mock('../../../../src/cli/output.js', () => ({
  outputResult: vi.fn(),
  outputKeyValue: vi.fn(),
  outputTable: vi.fn(),
  outputSuccess: vi.fn(),
  outputWarning: vi.fn(),
}));

const mockCreateClient = vi.mocked(clientFactory.createClient);
const mockLoadConfig = vi.mocked(configStore.loadConfig);
const mockLoadSession = vi.mocked(sessionStore.loadSession);
const mockIsSessionExpired = vi.mocked(sessionStore.isSessionExpired);
const mockOutputResult = vi.mocked(output.outputResult);
let mockClient: ReturnType<typeof createMockClient>;

beforeEach(() => {
  vi.clearAllMocks();
  mockClient = createMockClient();
  mockCreateClient.mockReturnValue(mockClient as any);
  mockLoadConfig.mockReturnValue({ ...defaultConfig });
  mockLoadSession.mockReturnValue({ ...validSession });
  mockIsSessionExpired.mockReturnValue(false);
  mockClient.lighthouse.getStatus.mockResolvedValue({ status: 'AVAILABLE', timestamp: '2024-01-01' });
});

async function runDoctor(args: Record<string, unknown> = {}) {
  return (doctorCommand as any).run!({ args });
}

describe('doctor', () => {
  it('config pass — message contains environment', async () => {
    await runDoctor();
    expect(consola.success).toHaveBeenCalledWith(expect.stringContaining('test'));
  });

  it('config fail — catches error', async () => {
    mockLoadConfig.mockImplementation(() => { throw new Error('no config'); });
    await runDoctor();
    expect(consola.error).toHaveBeenCalledWith(expect.stringContaining('Config not found'));
  });

  it('connectivity pass — calls lighthouse.getStatus', async () => {
    await runDoctor();
    expect(mockClient.lighthouse.getStatus).toHaveBeenCalled();
    expect(consola.success).toHaveBeenCalledWith(expect.stringContaining('API reachable'));
  });

  it('connectivity fail — catches error', async () => {
    mockClient.lighthouse.getStatus.mockRejectedValue(new Error('network error'));
    await runDoctor();
    expect(consola.error).toHaveBeenCalledWith(expect.stringContaining('Cannot reach'));
  });

  it('session: no session — status warn', async () => {
    mockLoadSession.mockReturnValue(null);
    await runDoctor();
    expect(consola.warn).toHaveBeenCalledWith(expect.stringContaining('No session'));
  });

  it('session: expired — status fail', async () => {
    mockIsSessionExpired.mockReturnValue(true);
    await runDoctor();
    expect(consola.error).toHaveBeenCalledWith(expect.stringContaining('expired'));
  });

  it('session: valid — status pass', async () => {
    await runDoctor();
    expect(consola.success).toHaveBeenCalledWith(expect.stringContaining('Session active'));
  });

  it('JSON output — calls outputResult with json: true', async () => {
    await runDoctor({ json: true });
    expect(mockOutputResult).toHaveBeenCalledWith(
      expect.objectContaining({ summary: expect.objectContaining({ total: 3 }) }),
      { json: true },
    );
  });
});
