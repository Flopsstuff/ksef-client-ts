import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sessionCommand } from '../../../../src/cli/commands/session.js';
import * as clientFactory from '../../../../src/cli/client-factory.js';
import * as configStore from '../../../../src/cli/config-store.js';
import * as sessionStore from '../../../../src/cli/session-store.js';
import * as output from '../../../../src/cli/output.js';
import { createMockClient, defaultConfig, validSession } from './_helpers.js';

vi.mock('consola', () => ({
  consola: { level: 0, start: vi.fn(), info: vi.fn() },
}));

vi.mock('../../../../src/cli/error-handler.js', () => ({
  withErrorHandler: vi.fn((fn) => fn()),
}));

vi.mock('../../../../src/cli/client-factory.js', () => ({
  requireSession: vi.fn(),
}));

vi.mock('../../../../src/cli/config-store.js', () => ({
  loadConfig: vi.fn(),
}));

vi.mock('../../../../src/cli/session-store.js', () => ({
  saveOnlineSessionRef: vi.fn(),
  clearOnlineSessionRef: vi.fn(),
}));

vi.mock('../../../../src/cli/output.js', () => ({
  outputResult: vi.fn(),
  outputKeyValue: vi.fn(),
  outputTable: vi.fn(),
  outputSuccess: vi.fn(),
  outputWarning: vi.fn(),
}));

vi.mock('node:fs', () => ({
  writeFileSync: vi.fn(),
  default: { writeFileSync: vi.fn() },
}));

const mockRequireSession = vi.mocked(clientFactory.requireSession);
const mockLoadConfig = vi.mocked(configStore.loadConfig);
const mockSaveOnlineSessionRef = vi.mocked(sessionStore.saveOnlineSessionRef);
const mockClearOnlineSessionRef = vi.mocked(sessionStore.clearOnlineSessionRef);
const mockOutputSuccess = vi.mocked(output.outputSuccess);
let mockClient: ReturnType<typeof createMockClient>;

beforeEach(() => {
  vi.clearAllMocks();
  mockClient = createMockClient();
  mockRequireSession.mockReturnValue({
    client: mockClient as any,
    session: { ...validSession, onlineSessionRef: 'online-ref-1' },
  });
  mockLoadConfig.mockReturnValue({ ...defaultConfig, nip: '1234567890' });
});

async function runOpen(args: Record<string, unknown> = {}) {
  return (sessionCommand.subCommands!.open as any).run!({ args });
}
async function runClose(args: Record<string, unknown> = {}) {
  return (sessionCommand.subCommands!.close as any).run!({ args });
}
async function runUpo(args: Record<string, unknown>) {
  return (sessionCommand.subCommands!.upo as any).run!({ args });
}
async function runRevoke(args: Record<string, unknown> = {}) {
  return (sessionCommand.subCommands!.revoke as any).run!({ args });
}

describe('session', () => {
  describe('open', () => {
    it('throws without NIP', async () => {
      mockLoadConfig.mockReturnValue({ ...defaultConfig, nip: undefined });
      mockRequireSession.mockReturnValue({
        client: mockClient as any,
        session: { ...validSession },
      });
      await expect(runOpen({})).rejects.toThrow('NIP is required');
    });

    it('saves onlineSessionRef after opening', async () => {
      mockClient.onlineSession.openSession.mockResolvedValue({
        referenceNumber: 'new-ref', validUntil: '2099-01-01',
      });
      await runOpen({});
      expect(mockSaveOnlineSessionRef).toHaveBeenCalledWith('new-ref');
    });
  });

  describe('close', () => {
    it('calls closeSession and clearOnlineSessionRef', async () => {
      await runClose({});
      expect(mockClient.onlineSession.closeSession).toHaveBeenCalledWith('online-ref-1');
      expect(mockClearOnlineSessionRef).toHaveBeenCalled();
    });

    it('throws without ref', async () => {
      mockRequireSession.mockReturnValue({
        client: mockClient as any,
        session: { ...validSession },
      });
      await expect(runClose({})).rejects.toThrow('No session reference');
    });
  });

  describe('upo', () => {
    it('by --upo-ref', async () => {
      mockClient.sessionStatus.getSessionUpo.mockResolvedValue({ upo: '<upo/>' });
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      await runUpo({ sessionRef: 'sess-1', upoRef: 'upo-1' });
      expect(mockClient.sessionStatus.getSessionUpo).toHaveBeenCalledWith('sess-1', 'upo-1');
      logSpy.mockRestore();
    });

    it('by --ksef-number', async () => {
      mockClient.sessionStatus.getInvoiceUpoByKsefNumber.mockResolvedValue({ upo: '<upo/>' });
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      await runUpo({ sessionRef: 'sess-1', ksefNumber: 'KSeF-123' });
      expect(mockClient.sessionStatus.getInvoiceUpoByKsefNumber).toHaveBeenCalledWith('sess-1', 'KSeF-123');
      logSpy.mockRestore();
    });

    it('throws without parameters', async () => {
      await expect(runUpo({ sessionRef: 'sess-1' })).rejects.toThrow('Provide one of');
    });
  });

  describe('revoke', () => {
    it('--current calls revokeCurrentSession', async () => {
      await runRevoke({ current: true });
      expect(mockClient.activeSessions.revokeCurrentSession).toHaveBeenCalled();
    });

    it('by ref calls revokeSession', async () => {
      await runRevoke({ ref: 'sess-ref-1' });
      expect(mockClient.activeSessions.revokeSession).toHaveBeenCalledWith('sess-ref-1');
    });

    it('throws without ref and --current', async () => {
      await expect(runRevoke({})).rejects.toThrow('Provide a session reference or use --current');
    });
  });
});
