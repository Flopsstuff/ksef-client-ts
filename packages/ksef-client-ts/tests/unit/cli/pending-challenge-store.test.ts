import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'node:fs';
import {
  savePendingChallenge,
  clearPendingChallenge,
  type PendingChallenge,
} from '../../../src/cli/pending-challenge-store.js';

vi.mock('node:fs');

const mockedFs = vi.mocked(fs);

const validChallenge: PendingChallenge = {
  challenge: 'challenge-abc123',
  timestamp: '20250329-120000-123-ABCD',
  contextIdentifier: { type: 'onip', value: '1234567890' },
  createdAt: '2025-03-29T12:00:00Z',
};

beforeEach(() => {
  vi.resetAllMocks();
});

describe('savePendingChallenge', () => {
  it('creates directory and writes challenge with mode 0o600', () => {
    savePendingChallenge(validChallenge);

    expect(mockedFs.mkdirSync).toHaveBeenCalledWith(expect.any(String), { recursive: true });
    expect(mockedFs.writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining('pending-challenge.json'),
      JSON.stringify(validChallenge, null, 2) + '\n',
      { encoding: 'utf-8', mode: 0o600 },
    );
  });

  it('writes all challenge fields correctly', () => {
    savePendingChallenge(validChallenge);

    const written = mockedFs.writeFileSync.mock.calls[0][1] as string;
    const parsed = JSON.parse(written);

    expect(parsed.challenge).toBe(validChallenge.challenge);
    expect(parsed.timestamp).toBe(validChallenge.timestamp);
    expect(parsed.contextIdentifier).toEqual(validChallenge.contextIdentifier);
    expect(parsed.createdAt).toBe(validChallenge.createdAt);
  });
});

describe('clearPendingChallenge', () => {
  it('removes the pending challenge file', () => {
    clearPendingChallenge();

    expect(mockedFs.unlinkSync).toHaveBeenCalledWith(expect.stringContaining('pending-challenge.json'));
  });

  it('does not throw when file does not exist', () => {
    mockedFs.unlinkSync.mockImplementation(() => { throw new Error('ENOENT'); });

    expect(() => clearPendingChallenge()).not.toThrow();
  });

  it('does not throw on any error', () => {
    mockedFs.unlinkSync.mockImplementation(() => { throw new Error('Permission denied'); });

    expect(() => clearPendingChallenge()).not.toThrow();
  });
});
