import { describe, it, expect, vi, beforeEach } from 'vitest';
import { authCommand } from '../../../../src/cli/commands/auth.js';
import * as clientFactory from '../../../../src/cli/client-factory.js';
import * as configStore from '../../../../src/cli/config-store.js';
import * as sessionStore from '../../../../src/cli/session-store.js';
import * as output from '../../../../src/cli/output.js';
import { createMockClient, defaultConfig, validSession } from './_helpers.js';

vi.mock('consola', () => ({ consola: { level: 0, info: vi.fn(), warn: vi.fn() } }));

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

vi.mock('../../../../src/cli/credentials-store.js', () => ({
  loadCredentials: vi.fn().mockReturnValue(null),
}));

vi.mock('../../../../src/cli/pending-challenge-store.js', () => ({
  savePendingChallenge: vi.fn(),
  clearPendingChallenge: vi.fn(),
}));

// Mock node:fs (dynamic import in login cert path)
vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  unlinkSync: vi.fn(),
  default: { readFileSync: vi.fn(), writeFileSync: vi.fn(), mkdirSync: vi.fn(), unlinkSync: vi.fn() },
}));

vi.mock('../../../../src/crypto/auth-xml-builder.js', () => ({
  buildUnsignedAuthTokenRequestXml: vi.fn().mockReturnValue('<UnsignedXml/>'),
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
      expect(mockClient.loginWithCertificate).toHaveBeenCalledWith('CERT-PEM', 'KEY-PEM', '1234567890', undefined);
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

    it('falls back to credentials store when --token not provided', async () => {
      const { loadCredentials } = await import('../../../../src/cli/credentials-store.js');
      vi.mocked(loadCredentials).mockReturnValue({ token: 'stored-tok' });
      await runLogin({ nip: '1234567890' });
      expect(mockClient.loginWithToken).toHaveBeenCalledWith('stored-tok', '1234567890');
    });

    it('explicit --token takes precedence over credentials store', async () => {
      const { loadCredentials } = await import('../../../../src/cli/credentials-store.js');
      vi.mocked(loadCredentials).mockReturnValue({ token: 'stored-tok' });
      await runLogin({ token: 'explicit-tok', nip: '1234567890' });
      expect(mockClient.loginWithToken).toHaveBeenCalledWith('explicit-tok', '1234567890');
    });

    it('throws when no token available anywhere', async () => {
      const { loadCredentials } = await import('../../../../src/cli/credentials-store.js');
      vi.mocked(loadCredentials).mockReturnValue(null);
      await expect(runLogin({ nip: '1234567890' })).rejects.toThrow('Provide --token, --p12, or both --cert and --key');
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
    function buildTestJwt(payload: Record<string, unknown>): string {
      const header = Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64url');
      const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
      return `${header}.${body}.signature`;
    }

    it('shows truncated token', async () => {
      await runWhoami();
      expect(mockOutputKeyValue).toHaveBeenCalledWith(
        expect.objectContaining({ accessToken: expect.stringContaining('...') }),
        expect.anything(),
      );
    });

    it('includes JWT context fields when token is a valid JWT', async () => {
      const jwtToken = buildTestJwt({
        typ: 'ContextToken',
        cit: 'Nip',
        civ: '8952265388',
        aum: 'TrustedProfile',
        per: '["InvoiceRead"]',
      });
      mockLoadSession.mockReturnValue({ ...validSession, accessToken: jwtToken });
      await runWhoami();
      expect(mockOutputKeyValue).toHaveBeenCalledWith(
        expect.objectContaining({
          nip: '8952265388',
          authMethod: 'TrustedProfile',
          permissions: 'InvoiceRead',
          tokenType: 'ContextToken',
        }),
        expect.anything(),
      );
    });

    it('omits context fields when token is not a JWT', async () => {
      mockLoadSession.mockReturnValue({ ...validSession, accessToken: 'not-a-jwt' });
      await runWhoami();
      const info = mockOutputKeyValue.mock.calls[0]![0] as Record<string, unknown>;
      expect(info).not.toHaveProperty('nip');
      expect(info).not.toHaveProperty('authMethod');
      expect(info).not.toHaveProperty('permissions');
      expect(info).toHaveProperty('environment');
      expect(info).toHaveProperty('status');
    });

    it('includes full context object in JSON mode', async () => {
      const jwtToken = buildTestJwt({ typ: 'ContextToken', civ: '1234567890' });
      mockLoadSession.mockReturnValue({ ...validSession, accessToken: jwtToken });
      await runWhoami({ json: true });
      expect(mockOutputKeyValue).toHaveBeenCalledWith(
        expect.objectContaining({
          context: expect.objectContaining({ type: 'ContextToken', contextIdentifierValue: '1234567890' }),
        }),
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

  describe('login-external', () => {
    async function runLoginExternal(args: Record<string, unknown>) {
      return (authCommand.subCommands!['login-external'] as any).run!({ args });
    }

    it('throws without --generate or --submit', async () => {
      await expect(runLoginExternal({ nip: '1234567890' })).rejects.toThrow('Specify --generate');
    });

    it('throws without NIP', async () => {
      mockLoadConfig.mockReturnValue({ ...defaultConfig, nip: undefined });
      await expect(runLoginExternal({ generate: true })).rejects.toThrow('NIP/identifier is required');
    });

    it('throws on invalid --context-type', async () => {
      await expect(runLoginExternal({ generate: true, nip: '123', 'context-type': 'Invalid' })).rejects.toThrow('Invalid --context-type');
    });

    it('--generate writes unsigned XML to stdout', async () => {
      const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
      const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
      mockClient.auth.getChallenge.mockResolvedValue({ challenge: 'ch-test', timestamp: '2026-01-01T00:00:00Z', timestampMs: 0, clientIp: '127.0.0.1' });

      await runLoginExternal({ generate: true, nip: '1234567890' });

      expect(mockClient.auth.getChallenge).toHaveBeenCalled();
      expect(stdoutSpy).toHaveBeenCalledWith('<UnsignedXml/>');
      expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('Challenge:'));
      stdoutSpy.mockRestore();
      stderrSpy.mockRestore();
    });

    it('--generate writes unsigned XML to --output file', async () => {
      const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
      mockClient.auth.getChallenge.mockResolvedValue({ challenge: 'ch-test', timestamp: '2026-01-01T00:00:00Z', timestampMs: 0, clientIp: '127.0.0.1' });

      const fs = await import('node:fs');
      await runLoginExternal({ generate: true, nip: '1234567890', output: '/tmp/unsigned.xml' });

      expect(vi.mocked(fs.writeFileSync)).toHaveBeenCalledWith('/tmp/unsigned.xml', '<UnsignedXml/>', 'utf-8');
      stderrSpy.mockRestore();
    });

    it('--submit reads signed XML from --input and authenticates', async () => {
      const fs = await import('node:fs');
      vi.mocked(fs.readFileSync).mockReturnValueOnce('<SignedXml/>' as any);
      mockClient.auth.submitXadesAuthRequest.mockResolvedValue({
        referenceNumber: 'ref-ext-1',
        authenticationToken: { token: 'auth-tok-ext', validUntil: '2026-01-02T00:00:00Z' },
      });
      mockClient.auth.getAuthStatus.mockResolvedValue({ status: { code: 200, description: 'OK' } });
      mockClient.auth.getAccessToken.mockResolvedValue({
        accessToken: { token: 'ext-access', validUntil: '2026-01-02T00:00:00Z' },
        refreshToken: { token: 'ext-refresh', validUntil: '2026-01-10T00:00:00Z' },
      });

      await runLoginExternal({ submit: true, nip: '1234567890', input: '/tmp/signed.xml' });

      expect(mockClient.auth.submitXadesAuthRequest).toHaveBeenCalledWith('<SignedXml/>');
      expect(mockSaveSession).toHaveBeenCalledWith(expect.objectContaining({ accessToken: 'ext-access' }));
      expect(mockOutputSuccess).toHaveBeenCalledWith(expect.stringContaining('external signature'));
    });

    it('--submit reads signed XML from stdin when no --input', async () => {
      // Create an async iterable mock for process.stdin
      const mockStdin = (async function* () {
        yield Buffer.from('<StdinSignedXml/>');
      })();
      const originalStdin = process.stdin;
      Object.defineProperty(process, 'stdin', { value: mockStdin, writable: true, configurable: true });

      mockClient.auth.submitXadesAuthRequest.mockResolvedValue({
        referenceNumber: 'ref-stdin-1',
        authenticationToken: { token: 'auth-tok-stdin', validUntil: '2026-01-02T00:00:00Z' },
      });
      mockClient.auth.getAuthStatus.mockResolvedValue({ status: { code: 200, description: 'OK' } });
      mockClient.auth.getAccessToken.mockResolvedValue({
        accessToken: { token: 'stdin-access', validUntil: '2026-01-02T00:00:00Z' },
        refreshToken: { token: 'stdin-refresh', validUntil: '2026-01-10T00:00:00Z' },
      });

      await runLoginExternal({ submit: true, nip: '1234567890' });

      expect(mockClient.auth.submitXadesAuthRequest).toHaveBeenCalledWith('<StdinSignedXml/>');
      expect(mockSaveSession).toHaveBeenCalledWith(expect.objectContaining({ accessToken: 'stdin-access' }));

      Object.defineProperty(process, 'stdin', { value: originalStdin, writable: true, configurable: true });
    });

    it('--generate saves pending challenge metadata', async () => {
      const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
      const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
      mockClient.auth.getChallenge.mockResolvedValue({ challenge: 'ch-save', timestamp: '2026-01-01T00:00:00Z', timestampMs: 0, clientIp: '127.0.0.1' });

      const { savePendingChallenge } = await import('../../../../src/cli/pending-challenge-store.js');
      await runLoginExternal({ generate: true, nip: '1234567890' });

      expect(vi.mocked(savePendingChallenge)).toHaveBeenCalledWith({
        challenge: 'ch-save',
        timestamp: '2026-01-01T00:00:00Z',
        contextIdentifier: { type: 'Nip', value: '1234567890' },
        createdAt: expect.any(String),
      });
      expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('Timestamp:'));
      stdoutSpy.mockRestore();
      stderrSpy.mockRestore();
    });

    it('--generate with --context-type NipVatUe passes correct type', async () => {
      const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
      const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
      const { buildUnsignedAuthTokenRequestXml } = await import('../../../../src/crypto/auth-xml-builder.js');
      mockClient.auth.getChallenge.mockResolvedValue({ challenge: 'ch', timestamp: '', timestampMs: 0, clientIp: '' });

      await runLoginExternal({ generate: true, nip: 'PL1234567890', 'context-type': 'NipVatUe' });

      expect(vi.mocked(buildUnsignedAuthTokenRequestXml)).toHaveBeenCalledWith(
        expect.objectContaining({ contextIdentifier: { type: 'NipVatUe', value: 'PL1234567890' } }),
      );
      stdoutSpy.mockRestore();
      stderrSpy.mockRestore();
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
