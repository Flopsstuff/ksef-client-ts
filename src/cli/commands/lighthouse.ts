import { defineCommand } from 'citty';
import { createClient } from '../client-factory.js';
import { outputResult, outputKeyValue, outputTable, outputWarning } from '../output.js';
import { withErrorHandler } from '../error-handler.js';
import type { GlobalOptions } from '../types.js';

function getGlobalOpts(args: Record<string, unknown>): GlobalOptions {
  return {
    env: (args.env as string | undefined) ?? 'prod',
    json: args.json as boolean | undefined,
    verbose: args.verbose as boolean | undefined,
    timeout: args.timeout as string | undefined,
    nip: args.nip as string | undefined,
  };
}

const status = defineCommand({
  meta: { name: 'status', description: 'Check KSeF system status' },
  args: {
    env: { type: 'string', description: 'Environment (test/prod, default: prod)' },
    json: { type: 'boolean', description: 'Output as JSON' },
    verbose: { type: 'boolean', description: 'Show HTTP request/response details' },
    timeout: { type: 'string', description: 'Request timeout (ms)' },
    nip: { type: 'string', description: 'NIP number' },
  },
  run({ args }) {
    return withErrorHandler(async () => {
      const globalOpts = getGlobalOpts(args);
      const client = createClient(globalOpts);

      const result = await client.lighthouse.getStatus();

      if (args.json) {
        outputResult(result, { json: true });
      } else {
        if (result.status !== 'AVAILABLE') {
          outputWarning(`System status: ${result.status}`);
        }
        outputKeyValue({
          'Status': result.status,
          'Timestamp': result.timestamp,
        }, { json: false });
      }
    });
  },
});

const messages = defineCommand({
  meta: { name: 'messages', description: 'View KSeF system messages' },
  args: {
    env: { type: 'string', description: 'Environment (test/prod, default: prod)' },
    json: { type: 'boolean', description: 'Output as JSON' },
    verbose: { type: 'boolean', description: 'Show HTTP request/response details' },
    timeout: { type: 'string', description: 'Request timeout (ms)' },
    nip: { type: 'string', description: 'NIP number' },
  },
  run({ args }) {
    return withErrorHandler(async () => {
      const globalOpts = getGlobalOpts(args);
      const client = createClient(globalOpts);

      const msgs = await client.lighthouse.getMessages();

      if (args.json) {
        outputResult(msgs, { json: true });
        return;
      }

      if (msgs.length === 0) {
        outputWarning('No system messages.');
        return;
      }

      outputTable(
        msgs.map((m) => ({
          title: m.title,
          category: m.category,
          type: m.type,
          start: m.start,
          end: m.end ?? '',
        })),
        [
          { key: 'title', label: 'Title' },
          { key: 'category', label: 'Category' },
          { key: 'type', label: 'Type' },
          { key: 'start', label: 'Start' },
          { key: 'end', label: 'End' },
        ],
        { json: false },
      );
    });
  },
});

export const lighthouseCommand = defineCommand({
  meta: { name: 'lighthouse', description: 'KSeF system status commands' },
  subCommands: { status, messages },
});
