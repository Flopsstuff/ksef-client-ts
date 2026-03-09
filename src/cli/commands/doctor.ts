import { defineCommand } from 'citty';
import { consola } from 'consola';
import { loadConfig } from '../config-store.js';
import { loadSession, isSessionExpired } from '../session-store.js';
import { createClient } from '../client-factory.js';
import { outputResult } from '../output.js';
import { withErrorHandler } from '../error-handler.js';
import type { GlobalOptions } from '../types.js';

function getGlobalOpts(args: Record<string, unknown>): GlobalOptions {
  return {
    env: args.env as string | undefined,
    json: args.json as boolean | undefined,
    timeout: args.timeout as string | undefined,
    nip: args.nip as string | undefined,
    verbose: args.verbose as boolean | undefined,
  };
}

interface CheckResult {
  name: string;
  status: 'pass' | 'fail' | 'warn';
  message: string;
}

export const doctorCommand = defineCommand({
  meta: { name: 'doctor', description: 'Check CLI configuration and connectivity' },
  args: {
    env: { type: 'string', description: 'Environment (test/demo/prod)' },
    json: { type: 'boolean', description: 'Output as JSON' },
    timeout: { type: 'string', description: 'Request timeout (ms)' },
    nip: { type: 'string', description: 'NIP number' },
    verbose: { type: 'boolean', description: 'Show HTTP request/response details' },
  },
  run({ args }) {
    return withErrorHandler(async () => {
      const globalOpts = getGlobalOpts(args);
      const checks: CheckResult[] = [];

      // 1. Config check
      try {
        const config = loadConfig();
        checks.push({
          name: 'config',
          status: 'pass',
          message: `Config OK (env: ${config.environment}${config.nip ? `, nip: ${config.nip}` : ''})`,
        });
      } catch {
        checks.push({
          name: 'config',
          status: 'fail',
          message: 'Config not found. Run `ksef config set` to configure.',
        });
      }

      // 2. Connectivity check
      try {
        const client = createClient(globalOpts);
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        try {
          const status = await client.lighthouse.getStatus();
          checks.push({
            name: 'connectivity',
            status: 'pass',
            message: `API reachable (${status.status})`,
          });
        } finally {
          clearTimeout(timeout);
        }
      } catch {
        checks.push({
          name: 'connectivity',
          status: 'fail',
          message: 'Cannot reach API. Check network and environment.',
        });
      }

      // 3. Session check
      const session = loadSession();
      if (!session) {
        checks.push({
          name: 'session',
          status: 'warn',
          message: 'No session stored. Run `ksef auth login` to authenticate.',
        });
      } else if (isSessionExpired(session)) {
        checks.push({
          name: 'session',
          status: 'fail',
          message: 'Session expired. Run `ksef auth login` to re-authenticate.',
        });
      } else {
        checks.push({
          name: 'session',
          status: 'pass',
          message: `Session active${session.expiresAt ? ` (expires: ${session.expiresAt})` : ''}`,
        });
      }

      // Output
      const passed = checks.filter((c) => c.status === 'pass').length;
      const total = checks.length;

      if (args.json) {
        const result: Record<string, unknown> = {};
        for (const check of checks) {
          result[check.name] = { status: check.status, message: check.message };
        }
        result.summary = { passed, total };
        outputResult(result, { json: true });
        return;
      }

      for (const check of checks) {
        const icon = check.status === 'pass' ? '✓' : check.status === 'warn' ? '⚠' : '✗';
        const log = check.status === 'pass' ? consola.success : check.status === 'warn' ? consola.warn : consola.error;
        log(`${icon} ${check.message}`);
      }

      if (passed === total) {
        consola.success(`\n${passed}/${total} checks passed.`);
      } else {
        consola.warn(`\n${passed}/${total} checks passed.`);
      }
    });
  },
});
