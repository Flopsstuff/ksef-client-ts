import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'node:fs';
import {
  loadSession,
  saveSession,
  clearSession,
  isSessionExpired,
  saveOnlineSessionRef,
  clearOnlineSessionRef,
  loadEncryptionData,
} from '../../../src/cli/session-store.js';
import type { SessionData } from '../../../src/cli/types.js';

vi.mock('node:fs');

const mockedFs = vi.mocked(fs);

const validSession: SessionData = {
  accessToken: 'token-123',
  refreshToken: 'refresh-456',
  sessionRef: 'ref-789',
  expiresAt: '2099-01-01T00:00:00Z',
  environment: 'test',
};

beforeEach(() => {
  vi.resetAllMocks();
});

describe('loadSession', () => {
  it('parses and returns session data', () => {
    mockedFs.readFileSync.mockReturnValue(JSON.stringify(validSession));

    expect(loadSession()).toEqual(validSession);
  });

  it('returns null when file does not exist', () => {
    mockedFs.readFileSync.mockImplementation(() => { throw new Error('ENOENT'); });

    expect(loadSession()).toBeNull();
  });

  it('returns null when file contains invalid JSON', () => {
    mockedFs.readFileSync.mockReturnValue('{{broken');

    expect(loadSession()).toBeNull();
  });
});

describe('saveSession', () => {
  it('creates directory and writes session with mode 0o600', () => {
    saveSession(validSession);

    expect(mockedFs.mkdirSync).toHaveBeenCalledWith(expect.any(String), { recursive: true });
    expect(mockedFs.writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining('session.json'),
      JSON.stringify(validSession, null, 2) + '\n',
      { encoding: 'utf-8', mode: 0o600 },
    );
  });
});

describe('clearSession', () => {
  it('removes the session file', () => {
    clearSession();

    expect(mockedFs.unlinkSync).toHaveBeenCalledWith(expect.stringContaining('session.json'));
  });

  it('does not throw when file does not exist', () => {
    mockedFs.unlinkSync.mockImplementation(() => { throw new Error('ENOENT'); });

    expect(() => clearSession()).not.toThrow();
  });
});

describe('isSessionExpired', () => {
  it('returns false for future expiresAt', () => {
    expect(isSessionExpired({ ...validSession, expiresAt: '2099-01-01T00:00:00Z' })).toBe(false);
  });

  it('returns true for past expiresAt', () => {
    expect(isSessionExpired({ ...validSession, expiresAt: '2000-01-01T00:00:00Z' })).toBe(true);
  });

  it('returns false when expiresAt is undefined', () => {
    const { expiresAt: _, ...noExpiry } = validSession;
    expect(isSessionExpired(noExpiry as SessionData)).toBe(false);
  });
});

describe('saveOnlineSessionRef', () => {
  it('reads session, adds ref, and saves back', () => {
    mockedFs.readFileSync.mockReturnValue(JSON.stringify(validSession));

    saveOnlineSessionRef('online-ref-1');

    expect(mockedFs.writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining('session.json'),
      expect.stringContaining('"onlineSessionRef": "online-ref-1"'),
      { encoding: 'utf-8', mode: 0o600 },
    );
  });

  it('throws when no session exists', () => {
    mockedFs.readFileSync.mockImplementation(() => { throw new Error('ENOENT'); });

    expect(() => saveOnlineSessionRef('ref')).toThrow('No active session');
  });

  it('persists cipher key/iv when encryption data is supplied', () => {
    mockedFs.readFileSync.mockReturnValue(JSON.stringify(validSession));

    saveOnlineSessionRef('online-ref-2', { cipherKey: 'a2V5', cipherIv: 'aXY=' });

    const written = mockedFs.writeFileSync.mock.calls[0]![1] as string;
    const saved = JSON.parse(written);
    expect(saved.onlineSessionRef).toBe('online-ref-2');
    expect(saved.cipherKey).toBe('a2V5');
    expect(saved.cipherIv).toBe('aXY=');
  });
});

describe('loadEncryptionData', () => {
  it('returns null when no session exists', () => {
    mockedFs.readFileSync.mockImplementation(() => { throw new Error('ENOENT'); });

    expect(loadEncryptionData()).toBeNull();
  });

  it('returns null when the session has no cipher material', () => {
    mockedFs.readFileSync.mockReturnValue(JSON.stringify(validSession));

    expect(loadEncryptionData()).toBeNull();
  });

  it('decodes base64 cipher key/iv into byte arrays', () => {
    const cipherKey = Buffer.from('0123456789abcdef0123456789abcdef').toString('base64');
    const cipherIv = Buffer.from('0123456789abcdef').toString('base64');
    mockedFs.readFileSync.mockReturnValue(JSON.stringify({ ...validSession, cipherKey, cipherIv }));

    const result = loadEncryptionData();

    expect(result).not.toBeNull();
    expect(result!.cipherKey).toBeInstanceOf(Uint8Array);
    expect(result!.cipherKey).toHaveLength(32);
    expect(result!.cipherIv).toHaveLength(16);
    expect(Buffer.from(result!.cipherKey).toString()).toBe('0123456789abcdef0123456789abcdef');
  });
});

describe('clearOnlineSessionRef', () => {
  it('removes onlineSessionRef and preserves other fields', () => {
    const sessionWithRef = { ...validSession, onlineSessionRef: 'ref-to-remove' };
    mockedFs.readFileSync.mockReturnValue(JSON.stringify(sessionWithRef));

    clearOnlineSessionRef();

    const written = mockedFs.writeFileSync.mock.calls[0][1] as string;
    const saved = JSON.parse(written);
    expect(saved.onlineSessionRef).toBeUndefined();
    expect(saved.accessToken).toBe(validSession.accessToken);
  });
});
