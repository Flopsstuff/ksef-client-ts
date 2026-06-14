import { describe, it, expect, vi, beforeEach } from 'vitest';
import { consola } from 'consola';
import { recoverSession } from '../../../src/cli/session-recovery.js';
import * as sessionStore from '../../../src/cli/session-store.js';
import * as credentialsStore from '../../../src/cli/credentials-store.js';
import * as configStore from '../../../src/cli/config-store.js';
import * as clientFactory from '../../../src/cli/client-factory.js';
import * as authWorkflow from '../../../src/workflows/auth-workflow.js';
import type { SessionData } from '../../../src/cli/types.js';

vi.mock('consola', () => ({
  consola: { info: vi.fn(), level: 0 },
}));

vi.mock('../../../src/cli/session-store.js', () => ({
  loadSession: vi.fn(),
  saveSession: vi.fn(),
  isSessionExpired: vi.fn(),
}));

vi.mock('../../../src/cli/credentials-store.js', () => ({
  loadCredentials: vi.fn(),
}));

vi.mock('../../../src/cli/config-store.js', () => ({
  loadConfig: vi.fn(),
}));

const mockRefreshAccessToken = vi.fn();
const mockAuthManager = {
  setAccessToken: vi.fn(),
  setRefreshToken: vi.fn(),
  getAccessToken: vi.fn(),
  getRefreshToken: vi.fn(),
};

vi.mock('../../../src/cli/client-factory.js', () => ({
  createClient: vi.fn(() => ({
    auth: { refreshAccessToken: mockRefreshAccessToken },
    authManager: mockAuthManager,
    crypto: { init: vi.fn() },
  })),
}));

vi.mock('../../../src/workflows/auth-workflow.js', () => ({
  authenticateWithToken: vi.fn(),
}));

const mockLoadSession = vi.mocked(sessionStore.loadSession);
const mockSaveSession = vi.mocked(sessionStore.saveSession);
const mockIsSessionExpired = vi.mocked(sessionStore.isSessionExpired);
const mockLoadCredentials = vi.mocked(credentialsStore.loadCredentials);
const mockLoadConfig = vi.mocked(configStore.loadConfig);
const mockAuthenticateWithToken = vi.mocked(authWorkflow.authenticateWithToken);

const defaultConfig = {
  environment: 'test' as const,
  output: 'pretty' as const,
  timeout: 30_000,
  nip: '1234567890',
};

const expiredSession: SessionData = {
  accessToken: 'old-access',
  refreshToken: 'old-refresh',
  expiresAt: '2020-01-01T00:00:00Z',
  environment: 'test',
};

beforeEach(() => {
  vi.clearAllMocks();
  mockLoadConfig.mockReturnValue(defaultConfig);
  mockIsSessionExpired.mockReturnValue(true);
});

describe('recoverSession', () => {
  describe('refresh path', () => {
    it('refreshes token when session expired with refresh token', async () => {
      mockLoadSession.mockReturnValue(expiredSession);
      mockRefreshAccessToken.mockResolvedValue({
        accessToken: { token: 'new-access', validUntil: '2099-01-01T00:00:00Z' },
      });

      const result = await recoverSession({});

      expect(mockRefreshAccessToken).toHaveBeenCalledWith('old-refresh');
      expect(mockSaveSession).toHaveBeenCalledWith(expect.objectContaining({
        accessToken: 'new-access',
        refreshToken: 'old-refresh',
        expiresAt: '2099-01-01T00:00:00Z',
      }));
      expect(result.session.accessToken).toBe('new-access');
      expect(consola.info).toHaveBeenCalledWith('Session expired, refreshing token...');
    });

    it('falls through to full login when refresh fails', async () => {
      mockLoadSession.mockReturnValue(expiredSession);
      mockRefreshAccessToken.mockRejectedValue(new Error('refresh expired'));
      mockLoadCredentials.mockReturnValue({ token: 'stored-token' });
      mockAuthenticateWithToken.mockResolvedValue({
        accessToken: 'fresh-access',
        accessTokenValidUntil: '2099-01-01T00:00:00Z',
        refreshToken: 'fresh-refresh',
        refreshTokenValidUntil: '2099-01-01T00:00:00Z',
      });

      const result = await recoverSession({});

      expect(mockAuthenticateWithToken).toHaveBeenCalled();
      expect(result.session.accessToken).toBe('fresh-access');
    });
  });

  describe('full login path', () => {
    it('logs in with stored credentials when no session exists', async () => {
      mockLoadSession.mockReturnValue(null);
      mockLoadCredentials.mockReturnValue({ token: 'stored-token' });
      mockAuthenticateWithToken.mockResolvedValue({
        accessToken: 'new-access',
        accessTokenValidUntil: '2099-01-01T00:00:00Z',
        refreshToken: 'new-refresh',
        refreshTokenValidUntil: '2099-01-01T00:00:00Z',
      });

      const result = await recoverSession({});

      expect(mockAuthenticateWithToken).toHaveBeenCalled();
      expect(mockSaveSession).toHaveBeenCalledWith(expect.objectContaining({
        accessToken: 'new-access',
        refreshToken: 'new-refresh',
        expiresAt: '2099-01-01T00:00:00Z',
        environment: 'test',
      }));
      expect(result.session.accessToken).toBe('new-access');
      expect(consola.info).toHaveBeenCalledWith('Logging in with stored credentials...');
    });

    it('wraps login errors with helpful message', async () => {
      mockLoadSession.mockReturnValue(null);
      mockLoadCredentials.mockReturnValue({ token: 'bad-token' });
      mockAuthenticateWithToken.mockRejectedValue(new Error('invalid token'));

      await expect(recoverSession({})).rejects.toThrow(
        "Auto-login failed: invalid token. Run 'ksef auth login' to authenticate manually.",
      );
    });
  });

  describe('failure path', () => {
    it('throws when no credentials available', async () => {
      mockLoadSession.mockReturnValue(null);
      mockLoadCredentials.mockReturnValue(null);

      await expect(recoverSession({})).rejects.toThrow('ksef setup');
    });

    it('throws when credentials exist but no NIP configured', async () => {
      mockLoadSession.mockReturnValue(null);
      mockLoadCredentials.mockReturnValue({ token: 'stored-token' });
      mockLoadConfig.mockReturnValue({ ...defaultConfig, nip: undefined });

      await expect(recoverSession({})).rejects.toThrow('NIP');
    });
  });
});
