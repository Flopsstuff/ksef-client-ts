import { renderCliError } from './error-renderer.js';

export async function withErrorHandler(
  fn: () => Promise<void>,
  opts?: { json?: boolean },
): Promise<void> {
  try {
    await fn();
  } catch (error) {
    renderCliError(error, opts);
    process.exit(1);
  }
}
