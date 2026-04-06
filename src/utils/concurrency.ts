/**
 * Execute async tasks with bounded concurrency using a worker-pool pattern.
 *
 * Creates `parallelism` workers that pull from a shared task queue.
 * Safe in single-threaded JS — index read+increment is atomic between await points.
 *
 * On first failure the shared AbortController is triggered so that:
 * 1. No new tasks are dequeued.
 * 2. In-flight tasks receive the abort signal (e.g. to cancel fetch requests).
 *
 * @param tasks - Array of async thunks that receive an AbortSignal
 * @param parallelism - Maximum number of concurrent workers (clamped to [1, tasks.length])
 */
export async function runWithConcurrency(
  tasks: Array<(signal: AbortSignal) => Promise<void>>,
  parallelism: number,
): Promise<void> {
  if (tasks.length === 0) return;
  const limit = Math.max(1, Math.min(parallelism, tasks.length));
  const controller = new AbortController();
  let index = 0;
  const workers = Array.from({ length: limit }, async () => {
    while (index < tasks.length && !controller.signal.aborted) {
      const current = index;
      index += 1;
      try {
        await tasks[current]!(controller.signal);
      } catch (err) {
        controller.abort();
        throw err;
      }
    }
  });
  await Promise.all(workers);
}
