import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'node:fs';
import { loadConfig, saveConfig, resetConfig } from '../../../src/cli/config-store.js';
import { DEFAULT_CONFIG } from '../../../src/cli/types.js';

vi.mock('node:fs');

const mockedFs = vi.mocked(fs);

beforeEach(() => {
  vi.resetAllMocks();
});

describe('loadConfig', () => {
  it('parses config file and merges with defaults', () => {
    mockedFs.readFileSync.mockReturnValue(JSON.stringify({ environment: 'prod', nip: '1234567890' }));

    const config = loadConfig();

    expect(config).toEqual({
      ...DEFAULT_CONFIG,
      environment: 'prod',
      nip: '1234567890',
    });
  });

  it('returns DEFAULT_CONFIG when file does not exist', () => {
    mockedFs.readFileSync.mockImplementation(() => { throw new Error('ENOENT'); });

    expect(loadConfig()).toEqual(DEFAULT_CONFIG);
  });

  it('returns DEFAULT_CONFIG when file contains invalid JSON', () => {
    mockedFs.readFileSync.mockReturnValue('not json{{{');

    expect(loadConfig()).toEqual(DEFAULT_CONFIG);
  });

  it('merges partial config with defaults', () => {
    mockedFs.readFileSync.mockReturnValue(JSON.stringify({ nip: '1234567890' }));

    const config = loadConfig();

    expect(config.environment).toBe('test');
    expect(config.output).toBe('pretty');
    expect(config.timeout).toBe(30_000);
    expect(config.nip).toBe('1234567890');
  });
});

describe('saveConfig', () => {
  it('creates directory and writes config JSON', () => {
    const config = { ...DEFAULT_CONFIG, environment: 'prod' as const };

    saveConfig(config);

    expect(mockedFs.mkdirSync).toHaveBeenCalledWith(expect.any(String), { recursive: true });
    expect(mockedFs.writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining('config.json'),
      JSON.stringify(config, null, 2) + '\n',
      'utf-8',
    );
  });
});

describe('resetConfig', () => {
  it('writes DEFAULT_CONFIG', () => {
    resetConfig();

    expect(mockedFs.writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining('config.json'),
      JSON.stringify(DEFAULT_CONFIG, null, 2) + '\n',
      'utf-8',
    );
  });
});
