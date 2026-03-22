export interface PollOptions {
  intervalMs?: number;
  maxAttempts?: number;
  description?: string;
}

export async function pollUntil<T>(
  action: () => Promise<T>,
  condition: (result: T) => boolean,
  options?: PollOptions,
): Promise<T> {
  const intervalMs = options?.intervalMs ?? 2000;
  const maxAttempts = options?.maxAttempts ?? 60;
  const description = options?.description ?? 'condition';

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const result = await action();
      if (condition(result)) {
        return result;
      }
    } catch {
      // Treat errors as "not ready yet"
    }

    if (attempt < maxAttempts) {
      console.log(`  [poll] ${description}: attempt ${attempt}/${maxAttempts}, waiting ${intervalMs}ms...`);
      await new Promise((r) => setTimeout(r, intervalMs));
    }
  }

  throw new Error(`Polling timeout: ${description} after ${maxAttempts} attempts (${(maxAttempts * intervalMs) / 1000}s)`);
}
