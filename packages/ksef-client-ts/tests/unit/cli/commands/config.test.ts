import { describe, it, expect, vi, beforeEach } from 'vitest';
import { configCommand } from '../../../../src/cli/commands/config.js';
import * as configStore from '../../../../src/cli/config-store.js';
import * as output from '../../../../src/cli/output.js';

vi.mock('consola', () => ({ consola: { level: 0 } }));

vi.mock('../../../../src/cli/error-handler.js', () => ({
  withErrorHandler: vi.fn((fn) => fn()),
}));

vi.mock('../../../../src/cli/config-store.js', () => ({
  loadConfig: vi.fn(),
  saveConfig: vi.fn(),
  resetConfig: vi.fn(),
}));

vi.mock('../../../../src/cli/output.js', () => ({
  outputKeyValue: vi.fn(),
  outputSuccess: vi.fn(),
  outputResult: vi.fn(),
  outputTable: vi.fn(),
  outputWarning: vi.fn(),
}));

const mockLoadConfig = vi.mocked(configStore.loadConfig);
const mockSaveConfig = vi.mocked(configStore.saveConfig);
const mockResetConfig = vi.mocked(configStore.resetConfig);
const mockOutputKeyValue = vi.mocked(output.outputKeyValue);
const mockOutputSuccess = vi.mocked(output.outputSuccess);

const defaultConfig = { environment: 'test' as const, output: 'pretty' as const, timeout: 30_000 };

beforeEach(() => {
  vi.clearAllMocks();
  mockLoadConfig.mockReturnValue({ ...defaultConfig });
});

async function runSet(args: Record<string, unknown>) {
  return (configCommand.subCommands!.set as any).run!({ args });
}

async function runShow(args: Record<string, unknown> = {}) {
  return (configCommand.subCommands!.show as any).run!({ args });
}

async function runReset() {
  return (configCommand.subCommands!.reset as any).run!({ args: {} });
}

describe('config', () => {
  describe('set', () => {
    it('throws on invalid environment', async () => {
      await expect(runSet({ env: 'staging' })).rejects.toThrow('Invalid environment');
    });

    it('throws on invalid output format', async () => {
      await expect(runSet({ output: 'yaml' })).rejects.toThrow('Invalid output format');
    });

    it('throws when timeout is NaN', async () => {
      await expect(runSet({ timeout: 'abc' })).rejects.toThrow('Invalid timeout');
    });

    it('throws when timeout <= 0', async () => {
      await expect(runSet({ timeout: '0' })).rejects.toThrow('Invalid timeout');
    });

    it('calls saveConfig with valid partial update', async () => {
      await runSet({ env: 'prod' });
      expect(mockSaveConfig).toHaveBeenCalledWith(
        expect.objectContaining({ environment: 'prod' }),
      );
    });

    it('updates only changed fields', async () => {
      await runSet({ env: 'demo' });
      expect(mockSaveConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          environment: 'demo',
          output: 'pretty',
          timeout: 30_000,
        }),
      );
    });

    it('sets nip when provided', async () => {
      await runSet({ nip: '1234567890' });
      expect(mockSaveConfig).toHaveBeenCalledWith(
        expect.objectContaining({ nip: '1234567890' }),
      );
    });

    it('sets valid output format', async () => {
      await runSet({ output: 'json' });
      expect(mockSaveConfig).toHaveBeenCalledWith(
        expect.objectContaining({ output: 'json' }),
      );
    });

    it('sets valid timeout', async () => {
      await runSet({ timeout: '5000' });
      expect(mockSaveConfig).toHaveBeenCalledWith(
        expect.objectContaining({ timeout: 5000 }),
      );
    });
  });

  describe('show', () => {
    it('calls loadConfig and outputKeyValue', async () => {
      await runShow({});
      expect(mockLoadConfig).toHaveBeenCalled();
      expect(mockOutputKeyValue).toHaveBeenCalled();
    });
  });

  describe('reset', () => {
    it('calls resetConfig', async () => {
      await runReset();
      expect(mockResetConfig).toHaveBeenCalled();
    });

    it('calls outputSuccess', async () => {
      await runReset();
      expect(mockOutputSuccess).toHaveBeenCalledWith(expect.stringContaining('reset'));
    });
  });
});
