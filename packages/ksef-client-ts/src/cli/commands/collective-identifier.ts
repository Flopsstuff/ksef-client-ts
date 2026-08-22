import { readFileSync } from 'node:fs';
import { defineCommand } from 'citty';
import { consola } from 'consola';
import { requireSession } from '../client-factory.js';
import { outputResult, outputTable, outputKeyValue, outputWarning } from '../output.js';
import { withErrorHandler } from '../error-handler.js';
import { normalizeCliDate } from '../date-utils.js';
import type { GlobalOptions } from '../types.js';
import type {
  CollectiveIdentifierInvoice,
  CollectiveIdentifiersQueryRequest,
} from '../../models/collective-identifiers/types.js';

function getGlobalOpts(args: Record<string, unknown>): GlobalOptions {
  return {
    env: args.env as string | undefined,
    json: args.json as boolean | undefined,
    verbose: args.verbose as boolean | undefined,
    timeout: args.timeout as string | undefined,
    nip: args.nip as string | undefined,
  };
}

/**
 * Accepts either a full `GenerateCollectiveIdentifierRequest` or a bare array of
 * invoices, so a file produced by `--json` output of another tool works unchanged.
 */
function readInvoicesFile(path: string): CollectiveIdentifierInvoice[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf-8'));
  } catch (err) {
    throw new Error(`Could not read invoice list from "${path}": ${(err as Error).message}`);
  }
  const invoices = Array.isArray(parsed)
    ? parsed
    : (parsed as { invoices?: unknown })?.invoices;
  if (!Array.isArray(invoices)) {
    throw new Error(
      `"${path}" must contain an array of invoices or an object with an "invoices" array.`,
    );
  }
  return invoices as CollectiveIdentifierInvoice[];
}

const generate = defineCommand({
  meta: { name: 'generate', description: 'Generate a collective identifier for a set of invoices' },
  args: {
    ksef: { type: 'string', description: 'Comma-separated KSeF invoice numbers' },
    file: { type: 'string', description: 'JSON file with the invoice list (supports payment and description per invoice)' },
    env: { type: 'string', description: 'Environment (test/demo/prod)' },
    json: { type: 'boolean', description: 'Output as JSON' },
    verbose: { type: 'boolean', description: 'Show HTTP request/response details' },
    timeout: { type: 'string', description: 'Request timeout (ms)' },
    nip: { type: 'string', description: 'NIP number' },
  },
  run({ args }) {
    return withErrorHandler(async () => {
      const globalOpts = getGlobalOpts(args);

      const invoices: CollectiveIdentifierInvoice[] = args.file
        ? readInvoicesFile(args.file)
        : String(args.ksef ?? '')
          .split(',')
          .map((n) => n.trim())
          .filter(Boolean)
          .map((ksefNumber) => ({ ksefNumber }));

      if (invoices.length === 0) {
        throw new Error('Provide invoices with --ksef <numbers> or --file <path>.');
      }

      const { client } = await requireSession(globalOpts);
      const result = await client.collectiveIdentifiers.generate({ invoices });

      if (args.json) {
        outputResult(result, { json: true });
      } else {
        outputKeyValue({
          'Collective Identifier': result.collectiveIdentifierNumber,
          'Invoices': invoices.length,
        }, { json: false });
      }
    }, { json: Boolean(args.json) });
  },
});

const list = defineCommand({
  meta: { name: 'list', description: 'List collective identifiers in the current context' },
  args: {
    from: { type: 'string', description: 'Created from (YYYY-MM-DD or ISO datetime), required', required: true },
    to: { type: 'string', description: 'Created to (YYYY-MM-DD or ISO datetime, default: now)' },
    number: { type: 'string', description: 'Filter by collective identifier number' },
    minInvoices: { type: 'string', description: 'Minimum invoice count' },
    maxInvoices: { type: 'string', description: 'Maximum invoice count' },
    currentContext: { type: 'boolean', description: 'Only identifiers generated in the current context' },
    pageSize: { type: 'string', description: 'Number of results per page (10-200)' },
    continue: { type: 'string', description: 'Continuation token from a previous page' },
    env: { type: 'string', description: 'Environment (test/demo/prod)' },
    json: { type: 'boolean', description: 'Output as JSON' },
    verbose: { type: 'boolean', description: 'Show HTTP request/response details' },
    timeout: { type: 'string', description: 'Request timeout (ms)' },
    nip: { type: 'string', description: 'NIP number' },
  },
  run({ args }) {
    return withErrorHandler(async () => {
      const globalOpts = getGlobalOpts(args);
      const { client } = await requireSession(globalOpts);

      const request: CollectiveIdentifiersQueryRequest = {
        dateCreatedFrom: normalizeCliDate(args.from, 'from'),
        dateCreatedTo: args.to ? normalizeCliDate(args.to, 'to') : new Date().toISOString(),
      };
      if (args.number) request.collectiveIdentifierNumber = args.number;
      if (args.minInvoices) request.invoiceCountFrom = parseInt(args.minInvoices, 10);
      if (args.maxInvoices) request.invoiceCountTo = parseInt(args.maxInvoices, 10);
      if (args.currentContext) request.createdInCurrentContext = true;

      const pageSize = args.pageSize ? parseInt(args.pageSize, 10) : undefined;
      const result = await client.collectiveIdentifiers.query(
        request,
        pageSize,
        args.continue as string | undefined,
      );

      if (args.json) {
        outputResult(result, { json: true });
        return;
      }

      if (result.collectiveIdentifiers.length === 0) {
        outputWarning('No collective identifiers found.');
        return;
      }

      outputTable(
        result.collectiveIdentifiers.map((c) => ({
          number: c.collectiveIdentifierNumber,
          created: c.dateCreated,
          invoices: c.invoiceCount,
          ownContext: c.createdInCurrentContext ? 'yes' : 'no',
        })),
        [
          { key: 'number', label: 'Collective Identifier' },
          { key: 'created', label: 'Created' },
          { key: 'invoices', label: 'Invoices' },
          { key: 'ownContext', label: 'Own Context' },
        ],
        { json: false },
      );

      if (result.continuationToken) {
        consola.info(`More results available. Continuation token: ${result.continuationToken}`);
      }
    }, { json: Boolean(args.json) });
  },
});

const byKsef = defineCommand({
  meta: { name: 'by-ksef', description: 'List collective identifiers a KSeF invoice belongs to' },
  args: {
    ksefNumber: { type: 'positional', description: 'KSeF invoice number', required: true },
    pageSize: { type: 'string', description: 'Number of results per page (10-200)' },
    continue: { type: 'string', description: 'Continuation token from a previous page' },
    env: { type: 'string', description: 'Environment (test/demo/prod)' },
    json: { type: 'boolean', description: 'Output as JSON' },
    verbose: { type: 'boolean', description: 'Show HTTP request/response details' },
    timeout: { type: 'string', description: 'Request timeout (ms)' },
    nip: { type: 'string', description: 'NIP number' },
  },
  run({ args }) {
    return withErrorHandler(async () => {
      const globalOpts = getGlobalOpts(args);
      const { client } = await requireSession(globalOpts);
      const pageSize = args.pageSize ? parseInt(args.pageSize, 10) : undefined;

      const result = await client.collectiveIdentifiers.getByKsefNumber(
        args.ksefNumber,
        pageSize,
        args.continue as string | undefined,
      );

      if (args.json) {
        outputResult(result, { json: true });
        return;
      }

      if (result.collectiveIdentifiers.length === 0) {
        outputWarning('This invoice does not belong to any collective identifier.');
        return;
      }

      outputTable(
        result.collectiveIdentifiers.map((c) => ({
          number: c.collectiveIdentifierNumber,
          created: c.dateCreated,
          ownContext: c.createdInCurrentContext ? 'yes' : 'no',
        })),
        [
          { key: 'number', label: 'Collective Identifier' },
          { key: 'created', label: 'Created' },
          { key: 'ownContext', label: 'Own Context' },
        ],
        { json: false },
      );

      if (result.continuationToken) {
        consola.info(`More results available. Continuation token: ${result.continuationToken}`);
      }
    }, { json: Boolean(args.json) });
  },
});

const invoices = defineCommand({
  meta: { name: 'invoices', description: 'List invoices inside a collective identifier' },
  args: {
    number: { type: 'positional', description: 'Collective identifier number', required: true },
    pageSize: { type: 'string', description: 'Number of results per page (10-200)' },
    continue: { type: 'string', description: 'Continuation token from a previous page' },
    env: { type: 'string', description: 'Environment (test/demo/prod)' },
    json: { type: 'boolean', description: 'Output as JSON' },
    verbose: { type: 'boolean', description: 'Show HTTP request/response details' },
    timeout: { type: 'string', description: 'Request timeout (ms)' },
    nip: { type: 'string', description: 'NIP number' },
  },
  run({ args }) {
    return withErrorHandler(async () => {
      const globalOpts = getGlobalOpts(args);
      const { client } = await requireSession(globalOpts);
      const pageSize = args.pageSize ? parseInt(args.pageSize, 10) : undefined;

      const result = await client.collectiveIdentifiers.getInvoices(
        args.number,
        pageSize,
        args.continue as string | undefined,
      );

      if (args.json) {
        outputResult(result, { json: true });
        return;
      }

      if (result.invoices.length === 0) {
        outputWarning('No invoices found.');
        return;
      }

      outputTable(
        result.invoices.map((i) => ({
          ksefNumber: i.ksefNumber,
          amount: i.payment ? i.payment.amount : (i.detailsHidden ? 'hidden' : '—'),
          currency: i.payment ? i.payment.currency : (i.detailsHidden ? 'hidden' : '—'),
          description: i.description ?? '',
        })),
        [
          { key: 'ksefNumber', label: 'KSeF Number' },
          { key: 'amount', label: 'Amount' },
          { key: 'currency', label: 'Currency' },
          { key: 'description', label: 'Description' },
        ],
        { json: false },
      );

      if (result.invoices.some((i) => i.detailsHidden)) {
        consola.info('Payment details of some invoices are hidden — you neither created this identifier nor appear on those invoices.');
      }

      if (result.continuationToken) {
        consola.info(`More results available. Continuation token: ${result.continuationToken}`);
      }
    }, { json: Boolean(args.json) });
  },
});

export const collectiveIdentifierCommand = defineCommand({
  meta: { name: 'collective-identifier', description: 'Manage KSeF collective identifiers' },
  subCommands: { generate, list, 'by-ksef': byKsef, invoices },
});
