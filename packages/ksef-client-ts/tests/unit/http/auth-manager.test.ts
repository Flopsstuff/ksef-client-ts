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

  it('setAccessToken() updates the stored token', () => {
    const manager = new DefaultAuthManager(vi.fn(), 'old');
    manager.setAccessToken('new');
    expect(manager.getAccessToken()).toBe('new');
  });

  it('setAccessToken(undefined) clears the stored token', () => {
    const manager = new DefaultAuthManager(vi.fn(), 'old');
    manager.setAccessToken(undefined);
    expect(manager.getAccessToken()).toBeUndefined();
  });

  it('stores and retrieves refresh token', () => {
    const manager = new DefaultAuthManager(vi.fn());
    expect(manager.getRefreshToken()).toBeUndefined();

    manager.setRefreshToken('rt-abc');
    expect(manager.getRefreshToken()).toBe('rt-abc');

    manager.setRefreshToken(undefined);
    expect(manager.getRefreshToken()).toBeUndefined();
  });

  it('concurrent onUnauthorized() calls trigger refreshFn only once', async () => {
    let resolveRefresh!: (value: string) => void;
    const refreshFn = vi.fn().mockImplementation(
      () => new Promise<string>(resolve => { resolveRefresh = resolve; }),
    );
    const manager = new DefaultAuthManager(refreshFn);

    const p1 = manager.onUnauthorized();
    const p2 = manager.onUnauthorized();
    const p3 = manager.onUnauthorized();

    resolveRefresh('deduped-token');

    const [r1, r2, r3] = await Promise.all([p1, p2, p3]);

    expect(refreshFn).toHaveBeenCalledTimes(1);
    expect(r1).toBe('deduped-token');
    expect(r2).toBe('deduped-token');
    expect(r3).toBe('deduped-token');
    expect(manager.getAccessToken()).toBe('deduped-token');
  });

  it('concurrent onUnauthorized() propagates refresh failure to all waiters', async () => {
    const refreshFn = vi.fn().mockRejectedValue(new Error('refresh failed'));
    const manager = new DefaultAuthManager(refreshFn);

    const p1 = manager.onUnauthorized();
    const p2 = manager.onUnauthorized();

    await expect(p1).rejects.toThrow('refresh failed');
    await expect(p2).rejects.toThrow('refresh failed');
    expect(refreshFn).toHaveBeenCalledTimes(1);
  });

  it('new onUnauthorized() after previous completes starts a fresh refresh', async () => {
    const refreshFn = vi.fn()
      .mockResolvedValueOnce('first')
      .mockResolvedValueOnce('second');
    const manager = new DefaultAuthManager(refreshFn);

    await manager.onUnauthorized();
    expect(manager.getAccessToken()).toBe('first');

    await manager.onUnauthorized();
    expect(manager.getAccessToken()).toBe('second');
    expect(refreshFn).toHaveBeenCalledTimes(2);
  });
});
