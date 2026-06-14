import { describe, it, expect, vi } from 'vitest';
import { pollUntil } from '../../../src/workflows/polling.js';

describe('pollUntil', () => {
  it('resolves immediately when condition met on first attempt', async () => {
    const action = vi.fn().mockResolvedValue(42);
    const result = await pollUntil(action, (v) => v === 42, { intervalMs: 1 });
    expect(result).toBe(42);
    expect(action).toHaveBeenCalledTimes(1);
  });

  it('polls until condition is met', async () => {
    let call = 0;
    const action = vi.fn().mockImplementation(async () => ++call);
    const result = await pollUntil(action, (v) => v === 3, { intervalMs: 1, maxAttempts: 10 });
    expect(result).toBe(3);
    expect(action).toHaveBeenCalledTimes(3);
  });

  it('throws after maxAttempts', async () => {
    const action = vi.fn().mockResolvedValue('nope');
    await expect(
      pollUntil(action, () => false, { intervalMs: 1, maxAttempts: 3 }),
    ).rejects.toThrow('Polling timeout: condition after 3 attempts');
    expect(action).toHaveBeenCalledTimes(3);
  });

  it('includes description in timeout error', async () => {
    const action = vi.fn().mockResolvedValue(null);
    await expect(
      pollUntil(action, () => false, { intervalMs: 1, maxAttempts: 1, description: 'UPO ready' }),
    ).rejects.toThrow('Polling timeout: UPO ready after 1 attempts');
  });

  it('calls onProgress callback on each non-final attempt', async () => {
    let call = 0;
    const action = vi.fn().mockImplementation(async () => ++call);
    const onProgress = vi.fn();
    await pollUntil(action, (v) => v === 3, { intervalMs: 1, maxAttempts: 10, onProgress });
    expect(onProgress).toHaveBeenCalledTimes(2);
    expect(onProgress).toHaveBeenCalledWith(1, 10);
    expect(onProgress).toHaveBeenCalledWith(2, 10);
  });

  it('propagates action errors', async () => {
    const action = vi.fn().mockRejectedValue(new Error('network fail'));
    await expect(
      pollUntil(action, () => true, { intervalMs: 1, maxAttempts: 3 }),
    ).rejects.toThrow('network fail');
    expect(action).toHaveBeenCalledTimes(1);
  });

  it('uses default intervalMs and maxAttempts', async () => {
    const action = vi.fn().mockResolvedValue('ok');
    await pollUntil(action, () => true);
    expect(action).toHaveBeenCalledTimes(1);
  });
});
