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
    let code = 1;
    try {
      code = opts?.exitCode?.(error) ?? 1;
    } catch {
      code = 1;
    }
    process.exit(code);
  }
}
