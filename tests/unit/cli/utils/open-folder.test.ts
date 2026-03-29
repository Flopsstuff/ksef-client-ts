import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as childProcess from 'node:child_process';
import { openFolder } from '../../../../src/cli/utils/open-folder.js';

vi.mock('node:child_process');

const mockedChildProcess = vi.mocked(childProcess);

beforeEach(() => {
  vi.resetAllMocks();
});

describe('openFolder', () => {
  it('uses open command on macOS', async () => {
    const originalPlatform = process.platform;
    Object.defineProperty(process, 'platform', { value: 'darwin', writable: true });

    mockedChildProcess.exec.mockImplementation((command, callback) => {
      expect(command).toBe('open "/test/folder"');
      callback?.(null, '', '');
      return {} as any;
    });

    const result = await openFolder('/test/folder');

    expect(result).toBe(true);
    expect(mockedChildProcess.exec).toHaveBeenCalledTimes(1);

    Object.defineProperty(process, 'platform', { value: originalPlatform, writable: true });
  });

  it('uses xdg-open command on Linux', async () => {
    const originalPlatform = process.platform;
    Object.defineProperty(process, 'platform', { value: 'linux', writable: true });

    mockedChildProcess.exec.mockImplementation((command, callback) => {
      expect(command).toBe('xdg-open "/test/folder"');
      callback?.(null, '', '');
      return {} as any;
    });

    const result = await openFolder('/test/folder');

    expect(result).toBe(true);
    expect(mockedChildProcess.exec).toHaveBeenCalledTimes(1);

    Object.defineProperty(process, 'platform', { value: originalPlatform, writable: true });
  });

  it('uses start command on Windows', async () => {
    const originalPlatform = process.platform;
    Object.defineProperty(process, 'platform', { value: 'win32', writable: true });

    mockedChildProcess.exec.mockImplementation((command, callback) => {
      expect(command).toBe('start "" "/test/folder"');
      callback?.(null, '', '');
      return {} as any;
    });

    const result = await openFolder('/test/folder');

    expect(result).toBe(true);
    expect(mockedChildProcess.exec).toHaveBeenCalledTimes(1);

    Object.defineProperty(process, 'platform', { value: originalPlatform, writable: true });
  });

  it('returns false on exec error', async () => {
    mockedChildProcess.exec.mockImplementation((command, callback) => {
      callback?.(new Error('Command failed'), '', '');
      return {} as any;
    });

    const result = await openFolder('/test/folder');

    expect(result).toBe(false);
    expect(mockedChildProcess.exec).toHaveBeenCalledTimes(1);
  });

  it('returns true on successful exec', async () => {
    mockedChildProcess.exec.mockImplementation((command, callback) => {
      callback?.(null, '', '');
      return {} as any;
    });

    const result = await openFolder('/test/folder');

    expect(result).toBe(true);
    expect(mockedChildProcess.exec).toHaveBeenCalledTimes(1);
  });
});
