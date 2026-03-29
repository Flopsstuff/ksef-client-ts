import { defineCommand } from 'citty';
import { loadConfig, saveConfig, resetConfig } from '../config-store.js';
import { outputKeyValue, outputSuccess, outputWarning } from '../output.js';
import { loadSession, clearSession } from '../session-store.js';
import { withErrorHandler } from '../error-handler.js';
import { CLI_ENV_CHOICES, type CliConfig, type OutputFormat } from '../types.js';

const set = defineCommand({
  meta: { name: 'set', description: 'Update CLI configuration' },
  args: {
    env: { type: 'string', description: `Environment (${CLI_ENV_CHOICES.join('/')})` },
    nip: { type: 'string', description: 'Default NIP number' },
    output: { type: 'string', description: 'Output format (pretty/json)' },
    timeout: { type: 'string', description: 'Request timeout in milliseconds' },
  },
  run({ args }) {
    return withErrorHandler(async () => {
      const config = loadConfig();

      if (args.env) {
        if (!CLI_ENV_CHOICES.includes(args.env as CliConfig['environment'])) {
          throw new Error(`Invalid environment: ${args.env}. Use: ${CLI_ENV_CHOICES.join(', ')}`);
        }
        if (args.env !== config.environment && loadSession()) {
          clearSession();
          outputWarning(`Session cleared (environment changed from ${config.environment} to ${args.env}).`);
        }
        config.environment = args.env as CliConfig['environment'];
      }

      if (args.nip) {
        config.nip = args.nip;
      }

      if (args.output) {
        if (!['pretty', 'json'].includes(args.output)) {
          throw new Error(`Invalid output format: ${args.output}. Use: pretty, json`);
        }
        config.output = args.output as OutputFormat;
      }

      if (args.timeout) {
        const t = parseInt(args.timeout, 10);
        if (Number.isNaN(t) || t <= 0) {
          throw new Error(`Invalid timeout: ${args.timeout}`);
        }
        config.timeout = t;
      }

      saveConfig(config);
      outputSuccess('Configuration updated.');
    });
  },
});

const show = defineCommand({
  meta: { name: 'show', description: 'Show current configuration' },
  args: {
    json: { type: 'boolean', description: 'Output as JSON' },
  },
  run({ args }) {
    return withErrorHandler(async () => {
      const config = loadConfig();
      outputKeyValue(config as unknown as Record<string, unknown>, { json: args.json });
    });
  },
});

const reset = defineCommand({
  meta: { name: 'reset', description: 'Reset configuration to defaults' },
  run() {
    return withErrorHandler(async () => {
      if (loadSession()) {
        clearSession();
        outputWarning('Session cleared (configuration reset to defaults).');
      }
      resetConfig();
      outputSuccess('Configuration reset to defaults.');
    });
  },
});

export const configCommand = defineCommand({
  meta: { name: 'config', description: 'Manage CLI configuration' },
  subCommands: { set, show, reset },
});
