import { describe, it, expect, vi } from 'vitest';
import { DefaultAuthManager } from '../../../src/http/auth-manager.js';

describe('DefaultAuthManager', () => {
  it('returns initial token from getAccessToken()', () => {
    const manager = new DefaultAuthManager(vi.fn(), 'initial');
    expect(manager.getAccessToken()).toBe('initial');
  });

  it('returns undefined from getAccessToken() when no initial token provided', () => {
    const manager = new DefaultAuthManager(vi.fn());
    expect(manager.getAccessToken()).toBeUndefined();
  });

  it('onUnauthorized() calls refreshFn and returns its result', async () => {
    const refreshFn = vi.fn().mockResolvedValue('refreshed');
    const manager = new DefaultAuthManager(refreshFn);

    const result = await manager.onUnauthorized();

    expect(refreshFn).toHaveBeenCalled();
    expect(result).toBe('refreshed');
  });

  it('getAccessToken() returns new token after successful refresh', async () => {
    const refreshFn = vi.fn().mockResolvedValue('newToken');
    const manager = new DefaultAuthManager(refreshFn, 'initial');

    await manager.onUnauthorized();

    expect(manager.getAccessToken()).toBe('newToken');
  });

  it('getAccessToken() returns undefined after failed refresh (null)', async () => {
    const refreshFn = vi.fn().mockResolvedValue(null);
    const manager = new DefaultAuthManager(refreshFn, 'initial');

    await manager.onUnauthorized();

    expect(manager.getAccessToken()).toBeUndefined();
  });

  it('refreshFn is called exactly once per onUnauthorized() call', async () => {
    const refreshFn = vi.fn().mockResolvedValue('token');
    const manager = new DefaultAuthManager(refreshFn);

    await manager.onUnauthorized();

    expect(refreshFn).toHaveBeenCalledTimes(1);
  });

  it('multiple successive onUnauthorized() calls each invoke refreshFn', async () => {
    const refreshFn = vi.fn()
      .mockResolvedValueOnce('token1')
      .mockResolvedValueOnce('token2')
      .mockResolvedValueOnce('token3');
    const manager = new DefaultAuthManager(refreshFn);

    const result1 = await manager.onUnauthorized();
    const result2 = await manager.onUnauthorized();
    const result3 = await manager.onUnauthorized();

    expect(refreshFn).toHaveBeenCalledTimes(3);
    expect(result1).toBe('token1');
    expect(result2).toBe('token2');
    expect(result3).toBe('token3');
    expect(manager.getAccessToken()).toBe('token3');
  });
});
