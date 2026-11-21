import { defineCommand } from 'citty';
import { consola } from 'consola';
import { requireSession } from '../client-factory.js';
import { outputResult, outputKeyValue, outputTable, outputSuccess, outputWarning } from '../output.js';
import { withErrorHandler } from '../error-handler.js';
import { normalizeCliDate } from '../date-utils.js';
import type { GlobalOptions } from '../types.js';
import type {
  GenerateTokenRequestRev2,
  KsefTokenRequest,
  KsefTokenPermissionType,
  QueryKsefTokensOptions,
  QueryTokensRev2Options,
} from '../../models/tokens/types.js';

/** `FutureValue` stands for a value this client does not know yet; the server's own code is in `rawCode`. */
function rev2Code(value: { code: string; rawCode: string }): string {
  return value.code === 'FutureValue' ? value.rawCode : value.code;
}

function getGlobalOpts(args: Record<string, unknown>): GlobalOptions {
  return {
    env: args.env as string | undefined,
    json: args.json as boolean | undefined,
    verbose: args.verbose as boolean | undefined,
    timeout: args.timeout as string | undefined,
    nip: args.nip as string | undefined,
  };
}

const generate = defineCommand({
  meta: { name: 'generate', description: 'Generate a new KSeF token' },
  args: {
    permissions: { type: 'string', description: 'Comma-separated permissions (e.g. InvoiceRead,InvoiceWrite)', required: true },
    description: { type: 'string', description: 'Token description', required: true },
    rev2: { type: 'boolean', description: 'Use the rev2 operation with a validity period (KSeF API 2.10.0)' },
    validFrom: { type: 'string', description: 'Start of validity, ISO 8601 (implies --rev2)' },
    validTo: { type: 'string', description: 'End of validity, ISO 8601 (implies --rev2)' },
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

      if (!args.permissions) {
        throw new Error('--permissions is required. Provide comma-separated values (e.g. InvoiceRead,InvoiceWrite).');
      }

      const permissions = args.permissions.split(',').map((p) => p.trim()) as KsefTokenPermissionType[];

      if (args.rev2 || args.validFrom || args.validTo) {
        const request: GenerateTokenRequestRev2 = {
          description: args.description as string,
          permissions,
          ...(args.validFrom ? { validFrom: normalizeCliDate(args.validFrom, 'from') } : {}),
          ...(args.validTo ? { validTo: normalizeCliDate(args.validTo, 'to') } : {}),
        };

        const result = await client.tokens.generateTokenRev2(request);

        if (args.json) {
          outputResult(result, { json: true });
        } else {
          outputSuccess('Token generated.');
          outputKeyValue({
            'Reference': result.referenceNumber,
            'Token': result.token,
          }, { json: false });
          consola.info(
            `A token generated in a session signed in with a KSeF token must be approved within 24 hours: run \`ksef token approve ${result.referenceNumber}\` in a session signed in with a certificate or XAdES.`,
          );
        }
        return;
      }

      const request: KsefTokenRequest = {
        description: args.description as string,
        permissions,
      };

      const result = await client.tokens.generateToken(request);

      if (args.json) {
        outputResult(result, { json: true });
      } else {
        outputSuccess('Token generated.');
        outputKeyValue({
          'Reference': result.referenceNumber,
          'Token': result.token,
        }, { json: false });
      }
    }, { json: Boolean(args.json) });
  },
});

const list = defineCommand({
  meta: { name: 'list', description: 'List KSeF tokens' },
  args: {
    status: { type: 'string', description: 'Comma-separated statuses (e.g. Active,Pending)' },
    description: { type: 'string', description: 'Filter by description' },
    author: { type: 'string', description: 'Filter by author identifier' },
    authorType: { type: 'string', description: 'Author identifier type (Nip/Pesel/Fingerprint)' },
    continue: { type: 'string', description: 'Continuation token for next page' },
    pageSize: { type: 'string', description: 'Number of results per page' },
    rev2: { type: 'boolean', description: 'Use the rev2 operation: validity dates, extended statuses, failure reason (KSeF API 2.10.0)' },
    validFrom: { type: 'string', description: 'Only tokens valid from this date, ISO 8601 (with --rev2)' },
    validTo: { type: 'string', description: 'Only tokens valid until this date, ISO 8601 (with --rev2)' },
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

      if (args.rev2) {
        const options: QueryTokensRev2Options = {
          continuationToken: args.continue as string | undefined,
          pageSize: args.pageSize ? parseInt(args.pageSize, 10) : undefined,
          status: args.status ? args.status.split(',').map((s) => s.trim()) as QueryTokensRev2Options['status'] : undefined,
          description: args.description,
          authorIdentifier: args.author,
          authorIdentifierType: args.authorType as QueryTokensRev2Options['authorIdentifierType'],
          validFrom: args.validFrom ? normalizeCliDate(args.validFrom, 'from') : undefined,
          validTo: args.validTo ? normalizeCliDate(args.validTo, 'to') : undefined,
        };

        const result = await client.tokens.queryTokensRev2(options);

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
            status: rev2Code(t.status),
            permissions: t.requestedPermissions.map(rev2Code).join(', '),
            validFrom: t.validFrom,
            validTo: t.validTo,
            failure: t.failure?.description ?? '',
          })),
          [
            { key: 'reference', label: 'Reference' },
            { key: 'description', label: 'Description' },
            { key: 'status', label: 'Status' },
            { key: 'permissions', label: 'Permissions' },
            { key: 'validFrom', label: 'Valid From' },
            { key: 'validTo', label: 'Valid To' },
            { key: 'failure', label: 'Failure' },
          ],
          { json: false },
        );

        if (result.continuationToken) {
          consola.info(`More results available. Continuation token: ${result.continuationToken}`);
        }
        return;
      }

      if (args.validFrom || args.validTo) {
        throw new Error('--valid-from and --valid-to filter only the rev2 listing. Add --rev2.');
      }

      const options: QueryKsefTokensOptions = {
        continuationToken: args.continue as string | undefined,
        pageSize: args.pageSize ? parseInt(args.pageSize, 10) : undefined,
        status: args.status ? args.status.split(',').map((s) => s.trim()) as QueryKsefTokensOptions['status'] : undefined,
        description: args.description,
        authorIdentifier: args.author,
        authorIdentifierType: args.authorType as QueryKsefTokensOptions['authorIdentifierType'],
      };

      const result = await client.tokens.queryTokens(options);

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
    }, { json: Boolean(args.json) });
  },
});

const get = defineCommand({
  meta: { name: 'get', description: 'Get token details' },
  args: {
    ref: { type: 'positional', description: 'Token reference number', required: true },
    rev2: { type: 'boolean', description: 'Use the rev2 operation: validity dates, extended statuses, failure reason (KSeF API 2.10.0)' },
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
      const ref = args.ref as string;

      if (args.rev2) {
        const result = await client.tokens.getTokenRev2(ref);

        if (args.json) {
          outputResult(result, { json: true });
          return;
        }

        outputKeyValue({
          'Reference': result.referenceNumber,
          'Description': result.description,
          'Status': rev2Code(result.status),
          'Permissions': result.requestedPermissions.map(rev2Code).join(', '),
          'Author': `${rev2Code(result.authorIdentifier.type)}: ${result.authorIdentifier.value}`,
          'Context': `${rev2Code(result.contextIdentifier.type)}: ${result.contextIdentifier.value}`,
          'Created': result.dateCreated,
          'Valid From': result.validFrom,
          'Valid To': result.validTo,
          'Last Used': result.lastUseDate ?? 'Never',
          ...(result.failure ? {
            'Failure': `${result.failure.code}: ${result.failure.description}`,
            ...(result.failure.details?.length ? { 'Failure Details': result.failure.details.join('; ') } : {}),
          } : {}),
        }, { json: false });
        return;
      }

      const result = await client.tokens.getToken(ref);

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
    }, { json: Boolean(args.json) });
  },
});

const approve = defineCommand({
  meta: { name: 'approve', description: 'Approve a token awaiting approval (KSeF API 2.10.0)' },
  args: {
    ref: { type: 'positional', description: 'Token reference number', required: true },
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
      const ref = args.ref as string;

      await client.tokens.approveToken(ref);

      if (args.json) {
        outputResult({ status: 'approved', referenceNumber: ref }, { json: true });
      } else {
        outputSuccess(`Token ${ref} approved.`);
      }
    }, { json: Boolean(args.json) });
  },
});

const revoke = defineCommand({
  meta: { name: 'revoke', description: 'Revoke a KSeF token' },
  args: {
    ref: { type: 'positional', description: 'Token reference number', required: true },
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
      const ref = args.ref as string;

      await client.tokens.revokeToken(ref);

      if (args.json) {
        outputResult({ status: 'revoked', referenceNumber: ref }, { json: true });
      } else {
        outputSuccess(`Token ${ref} revoked.`);
      }
    }, { json: Boolean(args.json) });
  },
});

export const tokenCommand = defineCommand({
  meta: { name: 'token', description: 'Token management commands' },
  subCommands: { generate, list, get, approve, revoke },
});
