import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'node:fs';
import {
  loadCredentials,
  saveCredentials,
  clearCredentials,
  type CliCredentials,
} from '../../../src/cli/credentials-store.js';

vi.mock('node:fs');

const mockedFs = vi.mocked(fs);

const validCredentials: CliCredentials = {
  token: 'ABCD1234567890EFGH',
};

beforeEach(() => {
  vi.resetAllMocks();
});

describe('loadCredentials', () => {
  it('parses and returns credentials data', () => {
    mockedFs.readFileSync.mockReturnValue(JSON.stringify(validCredentials));

    expect(loadCredentials()).toEqual(validCredentials);
  });

  it('returns null when file does not exist', () => {
    mockedFs.readFileSync.mockImplementation(() => { throw new Error('ENOENT'); });

    expect(loadCredentials()).toBeNull();
  });

  it('returns null when file contains invalid JSON', () => {
    mockedFs.readFileSync.mockReturnValue('{{broken');

    expect(loadCredentials()).toBeNull();
  });

  it('returns credentials with optional fields missing', () => {
    mockedFs.readFileSync.mockReturnValue('{}');

    expect(loadCredentials()).toEqual({});
  });
});

describe('saveCredentials', () => {
  it('creates directory and writes credentials with mode 0o600', () => {
    saveCredentials(validCredentials);

    expect(mockedFs.mkdirSync).toHaveBeenCalledWith(expect.any(String), { recursive: true });
    expect(mockedFs.writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining('credentials.json'),
      JSON.stringify(validCredentials, null, 2) + '\n',
      { encoding: 'utf-8', mode: 0o600 },
    );
  });

  it('writes token field correctly', () => {
    saveCredentials(validCredentials);

    const written = mockedFs.writeFileSync.mock.calls[0][1] as string;
    const parsed = JSON.parse(written);

    expect(parsed.token).toBe(validCredentials.token);
  });

  it('handles empty credentials object', () => {
    const emptyCredentials: CliCredentials = {};
    saveCredentials(emptyCredentials);

    const written = mockedFs.writeFileSync.mock.calls[0][1] as string;
    const parsed = JSON.parse(written);

    expect(parsed).toEqual({});
  });
});

describe('clearCredentials', () => {
  it('removes the credentials file', () => {
    clearCredentials();

    expect(mockedFs.unlinkSync).toHaveBeenCalledWith(expect.stringContaining('credentials.json'));
  });

  it('does not throw when file does not exist', () => {
    mockedFs.unlinkSync.mockImplementation(() => { throw new Error('ENOENT'); });

    expect(() => clearCredentials()).not.toThrow();
  });

  it('does not throw on any error', () => {
    mockedFs.unlinkSync.mockImplementation(() => { throw new Error('Permission denied'); });

    expect(() => clearCredentials()).not.toThrow();
  });
});
