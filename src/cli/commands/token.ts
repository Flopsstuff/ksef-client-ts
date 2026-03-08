import { defineCommand } from 'citty';
import { consola } from 'consola';
import { requireSession } from '../client-factory.js';
import { outputResult, outputKeyValue, outputTable, outputSuccess, outputWarning } from '../output.js';
import { withErrorHandler } from '../error-handler.js';
import type { GlobalOptions } from '../types.js';
import type { KsefTokenRequest, KsefTokenPermissionType, QueryKsefTokensOptions } from '../../models/tokens/types.js';

function getGlobalOpts(args: Record<string, unknown>): GlobalOptions {
  return {
    env: args.env as string | undefined,
    json: args.json as boolean | undefined,
    timeout: args.timeout as string | undefined,
    nip: args.nip as string | undefined,
  };
}

const generate = defineCommand({
  meta: { name: 'generate', description: 'Generate a new KSeF token' },
  args: {
    permissions: { type: 'string', description: 'Comma-separated permissions (e.g. InvoiceRead,InvoiceWrite)', required: true },
    description: { type: 'string', description: 'Token description' },
    validTo: { type: 'string', description: 'Token expiry date (ISO format)' },
    env: { type: 'string', description: 'Environment (test/demo/prod)' },
    json: { type: 'boolean', description: 'Output as JSON' },
    timeout: { type: 'string', description: 'Request timeout (ms)' },
    nip: { type: 'string', description: 'NIP number' },
  },
  run({ args }) {
    return withErrorHandler(async () => {
      const globalOpts = getGlobalOpts(args);
      const { client, session } = requireSession(globalOpts);

      if (!args.permissions) {
        throw new Error('--permissions is required. Provide comma-separated values (e.g. InvoiceRead,InvoiceWrite).');
      }

      const permissions = args.permissions.split(',').map((p) => p.trim()) as KsefTokenPermissionType[];

      const request: KsefTokenRequest = {
        permissions,
        description: args.description,
        validTo: args.validTo,
      };

      const result = await client.tokens.generateToken(request, session.accessToken);

      if (args.json) {
        outputResult(result, { json: true });
      } else {
        outputSuccess('Token generated.');
        outputKeyValue({
          'Reference': result.referenceNumber,
          'Token': result.token,
        }, { json: false });
      }
    });
  },
});

const list = defineCommand({
  meta: { name: 'list', description: 'List KSeF tokens' },
  args: {
    status: { type: 'string', description: 'Comma-separated statuses (e.g. Active,Pending)' },
    description: { type: 'string', description: 'Filter by description' },
    author: { type: 'string', description: 'Filter by author identifier' },
    authorType: { type: 'string', description: 'Author identifier type (Nip/Pesel/Fingerprint)' },
    page: { type: 'string', description: 'Page offset' },
    pageSize: { type: 'string', description: 'Number of results per page' },
    env: { type: 'string', description: 'Environment (test/demo/prod)' },
    json: { type: 'boolean', description: 'Output as JSON' },
    timeout: { type: 'string', description: 'Request timeout (ms)' },
    nip: { type: 'string', description: 'NIP number' },
  },
  run({ args }) {
    return withErrorHandler(async () => {
      const globalOpts = getGlobalOpts(args);
      const { client, session } = requireSession(globalOpts);

      const options: QueryKsefTokensOptions = {
        pageOffset: args.page ? parseInt(args.page, 10) : undefined,
        pageSize: args.pageSize ? parseInt(args.pageSize, 10) : undefined,
        status: args.status ? args.status.split(',').map((s) => s.trim()) as QueryKsefTokensOptions['status'] : undefined,
        description: args.description,
        authorIdentifier: args.author,
        authorIdentifierType: args.authorType as QueryKsefTokensOptions['authorIdentifierType'],
      };

      const result = await client.tokens.queryTokens(session.accessToken, options);

      if (args.json) {
        outputResult(result, { json: true });
        return;
      }

      if (result.tokens.length === 0) {
        outputWarning('No tokens found.');
        return;
      }

      outputTable(
        result.tokens.map((t) => ({
          reference: t.referenceNumber,
          description: t.description,
          status: t.status,
          permissions: t.requestedPermissions.join(', '),
          created: t.dateCreated,
        })),
        [
          { key: 'reference', label: 'Reference' },
          { key: 'description', label: 'Description' },
          { key: 'status', label: 'Status' },
          { key: 'permissions', label: 'Permissions' },
          { key: 'created', label: 'Created' },
        ],
        { json: false },
      );

      if (result.continuationToken) {
        consola.info(`More results available. Continuation token: ${result.continuationToken}`);
      }
    });
  },
});

const get = defineCommand({
  meta: { name: 'get', description: 'Get token details' },
  args: {
    ref: { type: 'positional', description: 'Token reference number', required: true },
    env: { type: 'string', description: 'Environment (test/demo/prod)' },
    json: { type: 'boolean', description: 'Output as JSON' },
    timeout: { type: 'string', description: 'Request timeout (ms)' },
    nip: { type: 'string', description: 'NIP number' },
  },
  run({ args }) {
    return withErrorHandler(async () => {
      const globalOpts = getGlobalOpts(args);
      const { client, session } = requireSession(globalOpts);
      const ref = args.ref as string;

      const result = await client.tokens.getToken(ref, session.accessToken);

      if (args.json) {
        outputResult(result, { json: true });
      } else {
        outputKeyValue({
          'Reference': result.referenceNumber,
          'Description': result.description,
          'Status': result.status,
          'Permissions': result.requestedPermissions.join(', '),
          'Author': `${result.authorIdentifier.type}: ${result.authorIdentifier.value}`,
          'Context': `${result.contextIdentifier.type}: ${result.contextIdentifier.value}`,
          'Created': result.dateCreated,
          'Last Used': result.lastUseDate ?? 'Never',
        }, { json: false });
      }
    });
  },
});

const revoke = defineCommand({
  meta: { name: 'revoke', description: 'Revoke a KSeF token' },
  args: {
    ref: { type: 'positional', description: 'Token reference number', required: true },
    env: { type: 'string', description: 'Environment (test/demo/prod)' },
    json: { type: 'boolean', description: 'Output as JSON' },
    timeout: { type: 'string', description: 'Request timeout (ms)' },
    nip: { type: 'string', description: 'NIP number' },
  },
  run({ args }) {
    return withErrorHandler(async () => {
      const globalOpts = getGlobalOpts(args);
      const { client, session } = requireSession(globalOpts);
      const ref = args.ref as string;

      await client.tokens.revokeToken(ref, session.accessToken);

      if (args.json) {
        outputResult({ status: 'revoked', referenceNumber: ref }, { json: true });
      } else {
        outputSuccess(`Token ${ref} revoked.`);
      }
    });
  },
});

export const tokenCommand = defineCommand({
  meta: { name: 'token', description: 'Token management commands' },
  subCommands: { generate, list, get, revoke },
});
