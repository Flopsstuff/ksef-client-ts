import { describe, it, expect, vi, beforeEach } from 'vitest';
import { consola } from 'consola';
import { createClient, requireSession, requireOnlineSession } from '../../../src/cli/client-factory.js';
import * as configStore from '../../../src/cli/config-store.js';
import * as sessionStore from '../../../src/cli/session-store.js';
import * as sessionRecovery from '../../../src/cli/session-recovery.js';
import type { SessionData } from '../../../src/cli/types.js';

vi.mock('consola', () => ({
  consola: {
    level: 0,
  },
}));

vi.mock('../../../src/cli/config-store.js', () => ({
  loadConfig: vi.fn(),
}));

vi.mock('../../../src/cli/session-store.js', () => ({
  loadSession: vi.fn(),
  isSessionExpired: vi.fn(),
}));

vi.mock('../../../src/cli/session-recovery.js', () => ({
  recoverSession: vi.fn(),
}));

const mockLoadConfig = vi.mocked(configStore.loadConfig);
const mockLoadSession = vi.mocked(sessionStore.loadSession);
const mockIsSessionExpired = vi.mocked(sessionStore.isSessionExpired);
const mockRecoverSession = vi.mocked(sessionRecovery.recoverSession);

const defaultConfig = {
  environment: 'test' as const,
  output: 'pretty' as const,
  timeout: 30_000,
};

const validSession: SessionData = {
  accessToken: 'access-token-123',
  refreshToken: 'refresh-token-456',
  sessionRef: 'ref-789',
  expiresAt: '2099-01-01T00:00:00Z',
  environment: 'test',
};

beforeEach(() => {
  vi.clearAllMocks();
  mockLoadConfig.mockReturnValue(defaultConfig);
  mockLoadSession.mockReturnValue(validSession);
  mockIsSessionExpired.mockReturnValue(false);
});

describe('createClient', () => {
  it('creates client with default env from config', () => {
    const client = createClient({});

    expect(mockLoadConfig).toHaveBeenCalled();
    expect(client).toBeDefined();
  });

  it('uses explicit --env flag over config', () => {
    const client = createClient({ env: 'prod' });

    expect(client).toBeDefined();
  });

  it('forwards custom timeout', () => {
    const client = createClient({ timeout: '60000' });

    expect(client).toBeDefined();
  });

  it('sets consola.level to 4 when verbose', () => {
    createClient({ verbose: true });

    expect(consola.level).toBe(4);
  });
});

describe('requireSession', () => {
  it('returns client and session when session is valid', async () => {
    const result = await requireSession({});

    expect(result.client).toBeDefined();
    expect(result.session).toEqual(validSession);
  });

  it('hydrates access and refresh tokens on the client', async () => {
    const result = await requireSession({});

    expect(result.client.authManager.getAccessToken()).toBe('access-token-123');
  });

  it('delegates to recoverSession when no session exists', async () => {
    mockLoadSession.mockReturnValue(null);
    const recovered = { client: createClient({}), session: validSession };
    mockRecoverSession.mockResolvedValue(recovered);

    const result = await requireSession({});

    expect(mockRecoverSession).toHaveBeenCalledWith({});
    expect(result).toBe(recovered);
  });

  it('delegates to recoverSession when session is expired', async () => {
    mockIsSessionExpired.mockReturnValue(true);
    const recovered = { client: createClient({}), session: validSession };
    mockRecoverSession.mockResolvedValue(recovered);

    const result = await requireSession({});

    expect(mockRecoverSession).toHaveBeenCalledWith({});
    expect(result).toBe(recovered);
  });

  it('propagates recoverSession errors', async () => {
    mockLoadSession.mockReturnValue(null);
    mockRecoverSession.mockRejectedValue(new Error('No stored credentials'));

    await expect(requireSession({})).rejects.toThrow('No stored credentials');
  });

  it('uses session environment as fallback when no --env flag', async () => {
    const prodSession = { ...validSession, environment: 'prod' as const };
    mockLoadSession.mockReturnValue(prodSession);

    const result = await requireSession({});

    expect(result.session.environment).toBe('prod');
  });
});

describe('requireOnlineSession', () => {
  it('returns onlineSessionRef when present', async () => {
    const sessionWithOnline = { ...validSession, onlineSessionRef: 'online-ref-1' };
    mockLoadSession.mockReturnValue(sessionWithOnline);

    const result = await requireOnlineSession({});

    expect(result.onlineSessionRef).toBe('online-ref-1');
    expect(result.client).toBeDefined();
    expect(result.session).toEqual(sessionWithOnline);
  });

  it('throws when no online session ref', async () => {
    await expect(requireOnlineSession({})).rejects.toThrow('No active online session');
  });
});
