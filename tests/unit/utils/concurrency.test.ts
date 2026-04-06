import { runWithConcurrency } from '../../../src/utils/concurrency.js';

describe('runWithConcurrency', () => {
  it('resolves immediately for empty task array', async () => {
    await runWithConcurrency([], 5);
  });

  it('executes all tasks with parallelism=1 sequentially', async () => {
    const order: number[] = [];
    const tasks = [1, 2, 3].map((n) => async () => {
      order.push(n);
      await new Promise((r) => setTimeout(r, 5));
    });

    await runWithConcurrency(tasks, 1);
    expect(order).toEqual([1, 2, 3]);
  });

  it('executes all tasks concurrently when parallelism >= task count', async () => {
    let active = 0;
    let maxActive = 0;
    const tasks = Array.from({ length: 3 }, () => async () => {
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise((r) => setTimeout(r, 10));
      active--;
    });

    await runWithConcurrency(tasks, 10);
    expect(maxActive).toBe(3);
  });

  it('respects bounded concurrency with parallelism=2', async () => {
    let active = 0;
    let maxActive = 0;
    const tasks = Array.from({ length: 5 }, () => async () => {
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise((r) => setTimeout(r, 10));
      active--;
    });

    await runWithConcurrency(tasks, 2);
    expect(maxActive).toBe(2);
  });

  it('clamps parallelism=0 to 1 (sequential)', async () => {
    let active = 0;
    let maxActive = 0;
    const tasks = Array.from({ length: 3 }, () => async () => {
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise((r) => setTimeout(r, 5));
      active--;
    });

    await runWithConcurrency(tasks, 0);
    expect(maxActive).toBe(1);
  });

  it('propagates error from a failing task', async () => {
    const tasks = [
      async () => {},
      async () => { throw new Error('boom'); },
      async () => {},
    ];

    await expect(runWithConcurrency(tasks, 2)).rejects.toThrow('boom');
  });

  it('executes all tasks exactly once', async () => {
    const calls: number[] = [];
    const tasks = [1, 2, 3, 4, 5].map((n) => async () => {
      calls.push(n);
    });

    await runWithConcurrency(tasks, 3);
    expect(calls.sort()).toEqual([1, 2, 3, 4, 5]);
  });
});
