import type { PollOptions } from './types.js';

export async function pollUntil<T>(
  action: () => Promise<T>,
  condition: (result: T) => boolean,
  options?: PollOptions & { description?: string },
): Promise<T> {
  const intervalMs = options?.intervalMs ?? 2000;
  const maxAttempts = options?.maxAttempts ?? 60;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const result = await action();
    if (condition(result)) return result;
    options?.onProgress?.(attempt, maxAttempts);
    if (attempt < maxAttempts) {
      await new Promise((r) => setTimeout(r, intervalMs));
    }
  }

  throw new Error(
    `Polling timeout: ${options?.description ?? 'condition'} after ${maxAttempts} attempts`,
  );
}
