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
    it('throws without token, p12, and cert/key', async () => {
      await expect(runLogin({ nip: '1234567890' })).rejects.toThrow('Provide --token, --p12, or both --cert and --key');
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

    it('p12 path — reads file as buffer and calls loginWithPkcs12', async () => {
      const fs = await import('node:fs');
      const p12Buf = Buffer.from('mock-p12-data');
      vi.mocked(fs.readFileSync).mockReturnValueOnce(p12Buf as any);
      await runLogin({ p12: '/cert.p12', 'p12-password': 'secret', nip: '1234567890' });
      expect(mockClient.loginWithPkcs12).toHaveBeenCalledWith(p12Buf, 'secret', '1234567890');
    });

    it('p12 path — defaults password to empty string', async () => {
      const fs = await import('node:fs');
      vi.mocked(fs.readFileSync).mockReturnValueOnce(Buffer.from('mock') as any);
      await runLogin({ p12: '/cert.p12', nip: '1234567890' });
      expect(mockClient.loginWithPkcs12).toHaveBeenCalledWith(expect.any(Buffer), '', '1234567890');
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

    it('no session — outputs warning and exits', async () => {
      mockLoadSession.mockReturnValue(null);
      mockExit.mockImplementationOnce(() => { throw new Error('process.exit'); });
      await expect(runWhoami()).rejects.toThrow('process.exit');
      expect(mockOutputWarning).toHaveBeenCalledWith('No active session.');
      expect(mockExit).toHaveBeenCalledWith(1);
    });
  });

  describe('status', () => {
    async function runStatus(args: Record<string, unknown>) {
      return (authCommand.subCommands!.status as any).run!({ args });
    }

    it('calls getAuthStatus with ref and access token', async () => {
      const mockResult = { status: 'ok' };
      mockClient.auth.getAuthStatus.mockResolvedValue(mockResult);
      await runStatus({ ref: 'ref-abc-123' });
      expect(mockRequireSession).toHaveBeenCalled();
      expect(mockClient.auth.getAuthStatus).toHaveBeenCalledWith('ref-abc-123', validSession.accessToken);
      expect(vi.mocked(output.outputResult)).toHaveBeenCalledWith(mockResult, { json: undefined });
    });

    it('passes json flag to outputResult', async () => {
      mockClient.auth.getAuthStatus.mockResolvedValue({ status: 'ok' });
      await runStatus({ ref: 'ref-abc-123', json: true });
      expect(vi.mocked(output.outputResult)).toHaveBeenCalledWith({ status: 'ok' }, { json: true });
    });
  });

  describe('challenge', () => {
    async function runChallenge(args: Record<string, unknown> = {}) {
      return (authCommand.subCommands!.challenge as any).run!({ args });
    }

    it('calls client.auth.getChallenge and outputs result', async () => {
      const challengeResult = { challenge: 'abc', timestamp: '2024-01-01' };
      mockClient.auth.getChallenge.mockResolvedValue(challengeResult);
      await runChallenge();
      expect(mockClient.auth.getChallenge).toHaveBeenCalled();
      expect(vi.mocked(output.outputResult)).toHaveBeenCalledWith(challengeResult, { json: undefined });
    });

    it('passes json flag to outputResult', async () => {
      const challengeResult = { challenge: 'abc' };
      mockClient.auth.getChallenge.mockResolvedValue(challengeResult);
      await runChallenge({ json: true });
      expect(vi.mocked(output.outputResult)).toHaveBeenCalledWith(challengeResult, { json: true });
    });
  });

  describe('login — saveConfig on env change', () => {
    it('saves config when args.env differs from config.environment', async () => {
      mockLoadConfig.mockReturnValue({ ...defaultConfig, environment: 'test' as any });
      await runLogin({ token: 'tok-123', nip: '1234567890', env: 'prod' });
      expect(vi.mocked(configStore.saveConfig)).toHaveBeenCalledWith(
        expect.objectContaining({ environment: 'prod' }),
      );
    });

    it('does not save config when args.env matches config.environment', async () => {
      mockLoadConfig.mockReturnValue({ ...defaultConfig, environment: 'test' as any });
      await runLogin({ token: 'tok-123', nip: '1234567890', env: 'test' });
      expect(vi.mocked(configStore.saveConfig)).not.toHaveBeenCalled();
    });

    it('does not save config when args.env is not provided', async () => {
      mockLoadConfig.mockReturnValue({ ...defaultConfig, environment: 'test' as any });
      await runLogin({ token: 'tok-123', nip: '1234567890' });
      expect(vi.mocked(configStore.saveConfig)).not.toHaveBeenCalled();
    });
  });
});
