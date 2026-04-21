import { renderCliError } from './error-renderer.js';

export type ExitCodeMapper = (error: unknown) => number | undefined;

export async function withErrorHandler(
  fn: () => Promise<void>,
  opts?: { json?: boolean; exitCode?: ExitCodeMapper },
): Promise<void> {
  try {
    await fn();
  } catch (error) {
    renderCliError(error, opts);
    process.exit(opts?.exitCode?.(error) ?? 1);
  }
}
