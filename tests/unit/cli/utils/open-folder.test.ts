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

    mockedChildProcess.execFile.mockImplementation(((cmd: string, args: string[], _opts: unknown, callback: Function) => {
      expect(cmd).toBe('open');
      expect(args).toEqual(['/test/folder']);
      callback(null, '', '');
      return {} as any;
    }) as any);

    const result = await openFolder('/test/folder');

    expect(result).toBe(true);
    expect(mockedChildProcess.execFile).toHaveBeenCalledTimes(1);

    Object.defineProperty(process, 'platform', { value: originalPlatform, writable: true });
  });

  it('uses xdg-open command on Linux', async () => {
    const originalPlatform = process.platform;
    Object.defineProperty(process, 'platform', { value: 'linux', writable: true });

    mockedChildProcess.execFile.mockImplementation(((cmd: string, args: string[], _opts: unknown, callback: Function) => {
      expect(cmd).toBe('xdg-open');
      expect(args).toEqual(['/test/folder']);
      callback(null, '', '');
      return {} as any;
    }) as any);

    const result = await openFolder('/test/folder');

    expect(result).toBe(true);
    expect(mockedChildProcess.execFile).toHaveBeenCalledTimes(1);

    Object.defineProperty(process, 'platform', { value: originalPlatform, writable: true });
  });

  it('uses explorer command on Windows', async () => {
    const originalPlatform = process.platform;
    Object.defineProperty(process, 'platform', { value: 'win32', writable: true });

    mockedChildProcess.execFile.mockImplementation(((cmd: string, args: string[], _opts: unknown, callback: Function) => {
      expect(cmd).toBe('explorer');
      expect(args).toEqual(['/test/folder']);
      callback(null, '', '');
      return {} as any;
    }) as any);

    const result = await openFolder('/test/folder');

    expect(result).toBe(true);
    expect(mockedChildProcess.execFile).toHaveBeenCalledTimes(1);

    Object.defineProperty(process, 'platform', { value: originalPlatform, writable: true });
  });

  it('returns false on exec error', async () => {
    mockedChildProcess.execFile.mockImplementation(((_cmd: string, _args: string[], _opts: unknown, callback: Function) => {
      callback(new Error('Command failed'), '', '');
      return {} as any;
    }) as any);

    const result = await openFolder('/test/folder');

    expect(result).toBe(false);
    expect(mockedChildProcess.execFile).toHaveBeenCalledTimes(1);
  });

  it('passes timeout option', async () => {
    mockedChildProcess.execFile.mockImplementation(((_cmd: string, _args: string[], opts: any, callback: Function) => {
      expect(opts.timeout).toBe(5000);
      callback(null, '', '');
      return {} as any;
    }) as any);

    const result = await openFolder('/test/folder');

    expect(result).toBe(true);
  });
});
