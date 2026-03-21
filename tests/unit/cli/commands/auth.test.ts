import { describe, it, expect, vi, beforeEach } from 'vitest';
import { authCommand } from '../../../../src/cli/commands/auth.js';
import * as clientFactory from '../../../../src/cli/client-factory.js';
import * as configStore from '../../../../src/cli/config-store.js';
import * as sessionStore from '../../../../src/cli/session-store.js';
import * as output from '../../../../src/cli/output.js';
import { createMockClient, defaultConfig, validSession } from './_helpers.js';

vi.mock('consola', () => ({ consola: { level: 0 } }));

vi.mock('../../../../src/cli/error-handler.js', () => ({
  withErrorHandler: vi.fn((fn) => fn()),
}));

vi.mock('../../../../src/cli/client-factory.js', () => ({
  createClient: vi.fn(),
  requireSession: vi.fn(),
}));

vi.mock('../../../../src/cli/config-store.js', () => ({
  loadConfig: vi.fn(),
  saveConfig: vi.fn(),
}));

vi.mock('../../../../src/cli/session-store.js', () => ({
  saveSession: vi.fn(),
  clearSession: vi.fn(),
  loadSession: vi.fn(),
  isSessionExpired: vi.fn(),
}));

vi.mock('../../../../src/cli/output.js', () => ({
  outputResult: vi.fn(),
  outputKeyValue: vi.fn(),
  outputSuccess: vi.fn(),
  outputWarning: vi.fn(),
  outputTable: vi.fn(),
}));

// Mock node:fs for the dynamic import in login cert path
vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  default: { readFileSync: vi.fn() },
}));

const mockCreateClient = vi.mocked(clientFactory.createClient);
const mockRequireSession = vi.mocked(clientFactory.requireSession);
const mockLoadConfig = vi.mocked(configStore.loadConfig);
const mockSaveSession = vi.mocked(sessionStore.saveSession);
const mockClearSession = vi.mocked(sessionStore.clearSession);
const mockLoadSession = vi.mocked(sessionStore.loadSession);
const mockIsSessionExpired = vi.mocked(sessionStore.isSessionExpired);
const mockOutputSuccess = vi.mocked(output.outputSuccess);
const mockOutputWarning = vi.mocked(output.outputWarning);
const mockOutputKeyValue = vi.mocked(output.outputKeyValue);
const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

let mockClient: ReturnType<typeof createMockClient>;

beforeEach(() => {
  vi.clearAllMocks();
  mockClient = createMockClient();
  mockCreateClient.mockReturnValue(mockClient as any);
  mockRequireSession.mockReturnValue({ client: mockClient as any, session: { ...validSession } });
  mockLoadConfig.mockReturnValue({ ...defaultConfig });
  mockLoadSession.mockReturnValue({ ...validSession });
  mockIsSessionExpired.mockReturnValue(false);
});

async function runLogin(args: Record<string, unknown>) {
  return (authCommand.subCommands!.login as any).run!({ args });
}

async function runLogout() {
  return (authCommand.subCommands!.logout as any).run!({ args: {} });
}

async function runRefresh(args: Record<string, unknown> = {}) {
  return (authCommand.subCommands!.refresh as any).run!({ args });
}

async function runWhoami(args: Record<string, unknown> = {}) {
  return (authCommand.subCommands!.whoami as any).run!({ args });
}

describe('auth', () => {
  describe('login', () => {
    it('throws without token and cert/key', async () => {
      await expect(runLogin({ nip: '1234567890' })).rejects.toThrow('Provide --token or both --cert and --key');
    });

    it('throws without NIP (neither args nor config)', async () => {
      mockLoadConfig.mockReturnValue({ ...defaultConfig, nip: undefined });
      await expect(runLogin({ token: 'tok-123' })).rejects.toThrow('NIP is required');
    });

    it('token path — calls loginWithToken', async () => {
      await runLogin({ token: 'tok-123', nip: '1234567890' });
      expect(mockClient.loginWithToken).toHaveBeenCalledWith('tok-123', '1234567890');
    });

    it('cert path — reads files and calls loginWithCertificate', async () => {
      const fs = await import('node:fs');
      vi.mocked(fs.readFileSync).mockReturnValueOnce('CERT-PEM' as any).mockReturnValueOnce('KEY-PEM' as any);
      await runLogin({ cert: '/cert.pem', key: '/key.pem', nip: '1234567890' });
      expect(mockClient.loginWithCertificate).toHaveBeenCalledWith('CERT-PEM', 'KEY-PEM', '1234567890');
    });

    it('saves session after login', async () => {
      await runLogin({ token: 'tok-123', nip: '1234567890' });
      expect(mockSaveSession).toHaveBeenCalledWith(
        expect.objectContaining({ accessToken: 'mock-access-token' }),
      );
    });

    it('uses NIP from config as fallback', async () => {
      mockLoadConfig.mockReturnValue({ ...defaultConfig, nip: '9999999999' });
      await runLogin({ token: 'tok-123' });
      expect(mockClient.loginWithToken).toHaveBeenCalledWith('tok-123', '9999999999');
    });
  });

  describe('logout', () => {
    it('calls clearSession', async () => {
      await runLogout();
      expect(mockClearSession).toHaveBeenCalled();
    });
  });

  describe('refresh', () => {
    it('throws when no session', async () => {
      mockLoadSession.mockReturnValue(null);
      await expect(runRefresh()).rejects.toThrow('No active session');
    });

    it('throws when no refreshToken', async () => {
      mockLoadSession.mockReturnValue({ ...validSession, refreshToken: undefined });
      await expect(runRefresh()).rejects.toThrow('No refresh token');
    });

    it('saves updated session', async () => {
      mockClient.auth.refreshAccessToken.mockResolvedValue({
        accessToken: { token: 'new-access', validUntil: '2099-12-31' },
      });
      await runRefresh();
      expect(mockSaveSession).toHaveBeenCalledWith(
        expect.objectContaining({ accessToken: 'new-access', expiresAt: '2099-12-31' }),
      );
    });
  });

  describe('whoami', () => {
    it('shows truncated token', async () => {
      await runWhoami();
      expect(mockOutputKeyValue).toHaveBeenCalledWith(
        expect.objectContaining({ accessToken: expect.stringContaining('...') }),
        expect.anything(),
      );
    });

    it('expired — calls process.exit(1)', async () => {
      mockIsSessionExpired.mockReturnValue(true);
      await runWhoami();
      expect(mockExit).toHaveBeenCalledWith(1);
    });
  });
});
