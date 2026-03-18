import { defineCommand } from 'citty';
import { consola } from 'consola';
import { requireSession } from '../client-factory.js';
import { outputResult, outputTable, outputWarning } from '../output.js';
import { withErrorHandler } from '../error-handler.js';
import type { GlobalOptions } from '../types.js';

function getGlobalOpts(args: Record<string, unknown>): GlobalOptions {
  return {
    env: args.env as string | undefined,
    json: args.json as boolean | undefined,
    verbose: args.verbose as boolean | undefined,
    timeout: args.timeout as string | undefined,
    nip: args.nip as string | undefined,
  };
}

const providers = defineCommand({
  meta: { name: 'providers', description: 'Query Peppol providers' },
  args: {
    page: { type: 'string', description: 'Page offset' },
    pageSize: { type: 'string', description: 'Number of results per page' },
    env: { type: 'string', description: 'Environment (test/demo/prod)' },
    json: { type: 'boolean', description: 'Output as JSON' },
    verbose: { type: 'boolean', description: 'Show HTTP request/response details' },
    timeout: { type: 'string', description: 'Request timeout (ms)' },
  },
  run({ args }) {
    return withErrorHandler(async () => {
      const globalOpts = getGlobalOpts(args);
      const { client } = requireSession(globalOpts);
      const pageOffset = args.page ? parseInt(args.page, 10) : undefined;
      const pageSize = args.pageSize ? parseInt(args.pageSize, 10) : undefined;

      const result = await client.peppol.queryProviders(pageOffset, pageSize);

      if (args.json) {
        outputResult(result, { json: true });
        return;
      }

      if (result.providers.length === 0) {
        outputWarning('No providers found.');
        return;
      }

      outputTable(
        result.providers.map((p) => ({
          identifier: p.identifier,
          name: p.name,
          description: p.description ?? '',
          created: p.dateCreated ?? '',
        })),
        [
          { key: 'identifier', label: 'Identifier' },
          { key: 'name', label: 'Name' },
          { key: 'description', label: 'Description' },
          { key: 'created', label: 'Created' },
        ],
        { json: false },
      );

      if (result.hasMore) {
        consola.info('More results available. Use --page to paginate.');
      }
    });
  },
});

export const peppolCommand = defineCommand({
  meta: { name: 'peppol', description: 'Peppol integration commands' },
  subCommands: { providers },
});
