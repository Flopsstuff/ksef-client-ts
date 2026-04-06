/**
 * Execute async tasks with bounded concurrency using a worker-pool pattern.
 *
 * Creates `parallelism` workers that pull from a shared task queue.
 * Safe in single-threaded JS — index read+increment is atomic between await points.
 *
 * @param tasks - Array of async thunks to execute
 * @param parallelism - Maximum number of concurrent workers (clamped to [1, tasks.length])
 */
export async function runWithConcurrency(
  tasks: Array<() => Promise<void>>,
  parallelism: number,
): Promise<void> {
  if (tasks.length === 0) return;
  const limit = Math.max(1, Math.min(parallelism, tasks.length));
  let index = 0;
  const workers = Array.from({ length: limit }, async () => {
    while (index < tasks.length) {
      const current = index;
      index += 1;
      await tasks[current]!();
    }
  });
  await Promise.all(workers);
}
