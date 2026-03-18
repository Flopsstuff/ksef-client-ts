import { defineCommand } from 'citty';
import { createClient, requireSession } from '../client-factory.js';
import { loadConfig } from '../config-store.js';
import { outputResult, outputSuccess, outputKeyValue } from '../output.js';
import { withErrorHandler } from '../error-handler.js';
import type { GlobalOptions } from '../types.js';
import type {
  SubjectType,
  TestDataPermission,
  SubjectCreateRequest,
  SubjectRemoveRequest,
  PersonCreateRequest,
  PersonRemoveRequest,
  TestDataPermissionsGrantRequest,
  TestDataPermissionsRevokeRequest,
  AttachmentPermissionGrantRequest,
  AttachmentPermissionRevokeRequest,
  ChangeSessionLimitsInCurrentContextRequest,
  ChangeCertificatesLimitInCurrentSubjectRequest,
  EffectiveApiRateLimitsRequest,
  ContextBlockRequest,
  ContextUnblockRequest,
  TestDataStatusResponse,
} from '../../models/test-data/types.js';

function getGlobalOpts(args: Record<string, unknown>): GlobalOptions {
  return {
    env: args.env as string | undefined,
    json: args.json as boolean | undefined,
    verbose: args.verbose as boolean | undefined,
    timeout: args.timeout as string | undefined,
    nip: args.nip as string | undefined,
  };
}

function requireNonProd(globalOpts: GlobalOptions): void {
  const env = globalOpts.env ?? loadConfig().environment;
  if (env === 'prod') {
    throw new Error('Test data commands are only available in test/demo environments.');
  }
}

function outputStatus(result: TestDataStatusResponse, json?: boolean): void {
  if (json) {
    outputResult(result, { json: true });
  } else {
    outputSuccess('Done.');
    outputKeyValue({
      'Code': result.code,
      'Description': result.description,
    }, { json: false });
  }
}

const createSubject = defineCommand({
  meta: { name: 'create-subject', description: 'Create a test subject' },
  args: {
    nip: { type: 'string', description: 'Subject NIP', required: true },
    type: { type: 'string', description: 'Subject type (EnforcementAuthority/VatGroup/JST)', required: true },
    description: { type: 'string', description: 'Subject description', required: true },
    'created-date': { type: 'string', description: 'Created date (ISO format)' },
    env: { type: 'string', description: 'Environment (test/demo/prod)' },
    json: { type: 'boolean', description: 'Output as JSON' },
    verbose: { type: 'boolean', description: 'Show HTTP request/response details' },
    timeout: { type: 'string', description: 'Request timeout (ms)' },
  },
  run({ args }) {
    return withErrorHandler(async () => {
      const globalOpts = getGlobalOpts(args);
      requireNonProd(globalOpts);

      const request: SubjectCreateRequest = {
        subjectNip: args.nip as string,
        subjectType: args.type as SubjectType,
        description: args.description as string,
        createdDate: args['created-date'] as string | undefined,
      };

      const result = await createClient(globalOpts).testData.createSubject(request);
      outputStatus(result, args.json);
    });
  },
});

const removeSubject = defineCommand({
  meta: { name: 'remove-subject', description: 'Remove a test subject' },
  args: {
    nip: { type: 'string', description: 'Subject NIP', required: true },
    env: { type: 'string', description: 'Environment (test/demo/prod)' },
    json: { type: 'boolean', description: 'Output as JSON' },
    verbose: { type: 'boolean', description: 'Show HTTP request/response details' },
    timeout: { type: 'string', description: 'Request timeout (ms)' },
  },
  run({ args }) {
    return withErrorHandler(async () => {
      const globalOpts = getGlobalOpts(args);
      requireNonProd(globalOpts);

      const request: SubjectRemoveRequest = { subjectNip: args.nip as string };
      const result = await createClient(globalOpts).testData.removeSubject(request);
      outputStatus(result, args.json);
    });
  },
});

const createPerson = defineCommand({
  meta: { name: 'create-person', description: 'Create a test person' },
  args: {
    nip: { type: 'string', description: 'Person NIP', required: true },
    pesel: { type: 'string', description: 'Person PESEL', required: true },
    description: { type: 'string', description: 'Person description', required: true },
    bailiff: { type: 'boolean', description: 'Is bailiff (default: false)' },
    deceased: { type: 'boolean', description: 'Is deceased' },
    'created-date': { type: 'string', description: 'Created date (ISO format)' },
    env: { type: 'string', description: 'Environment (test/demo/prod)' },
    json: { type: 'boolean', description: 'Output as JSON' },
    verbose: { type: 'boolean', description: 'Show HTTP request/response details' },
    timeout: { type: 'string', description: 'Request timeout (ms)' },
  },
  run({ args }) {
    return withErrorHandler(async () => {
      const globalOpts = getGlobalOpts(args);
      requireNonProd(globalOpts);

      const request: PersonCreateRequest = {
        nip: args.nip as string,
        pesel: args.pesel as string,
        description: args.description as string,
        isBailiff: args.bailiff ?? false,
        isDeceased: args.deceased,
        createdDate: args['created-date'] as string | undefined,
      };

      const result = await createClient(globalOpts).testData.createPerson(request);
      outputStatus(result, args.json);
    });
  },
});

const removePerson = defineCommand({
  meta: { name: 'remove-person', description: 'Remove a test person' },
  args: {
    nip: { type: 'string', description: 'Person NIP', required: true },
    env: { type: 'string', description: 'Environment (test/demo/prod)' },
    json: { type: 'boolean', description: 'Output as JSON' },
    verbose: { type: 'boolean', description: 'Show HTTP request/response details' },
    timeout: { type: 'string', description: 'Request timeout (ms)' },
  },
  run({ args }) {
    return withErrorHandler(async () => {
      const globalOpts = getGlobalOpts(args);
      requireNonProd(globalOpts);

      const request: PersonRemoveRequest = { nip: args.nip as string };
      const result = await createClient(globalOpts).testData.removePerson(request);
      outputStatus(result, args.json);
    });
  },
});

const grantPermissions = defineCommand({
  meta: { name: 'grant-permissions', description: 'Grant test data permissions' },
  args: {
    'context-nip': { type: 'string', description: 'Context NIP', required: true },
    identifier: { type: 'string', description: 'Authorized identifier value', required: true },
    'identifier-type': { type: 'string', description: 'Identifier type (Nip/Pesel/Fingerprint)', required: true },
    permissions: { type: 'string', description: 'Comma-separated permissions', required: true },
    env: { type: 'string', description: 'Environment (test/demo/prod)' },
    json: { type: 'boolean', description: 'Output as JSON' },
    verbose: { type: 'boolean', description: 'Show HTTP request/response details' },
    timeout: { type: 'string', description: 'Request timeout (ms)' },
    nip: { type: 'string', description: 'NIP number' },
  },
  run({ args }) {
    return withErrorHandler(async () => {
      const globalOpts = getGlobalOpts(args);
      requireNonProd(globalOpts);

      const permissions = (args.permissions as string).split(',').map((p) => p.trim()) as TestDataPermission[];

      const request: TestDataPermissionsGrantRequest = {
        contextIdentifier: { type: 'Nip', value: args['context-nip'] as string },
        authorizedIdentifier: {
          type: args['identifier-type'] as 'Nip' | 'Pesel' | 'Fingerprint',
          value: args.identifier as string,
        },
        permissions,
      };

      const result = await createClient(globalOpts).testData.grantPermissions(request);
      outputStatus(result, args.json);
    });
  },
});

const revokePermissions = defineCommand({
  meta: { name: 'revoke-permissions', description: 'Revoke test data permissions' },
  args: {
    'context-nip': { type: 'string', description: 'Context NIP', required: true },
    identifier: { type: 'string', description: 'Authorized identifier value', required: true },
    'identifier-type': { type: 'string', description: 'Identifier type (Nip/Pesel/Fingerprint)', required: true },
    permissions: { type: 'string', description: 'Comma-separated permissions', required: true },
    env: { type: 'string', description: 'Environment (test/demo/prod)' },
    json: { type: 'boolean', description: 'Output as JSON' },
    verbose: { type: 'boolean', description: 'Show HTTP request/response details' },
    timeout: { type: 'string', description: 'Request timeout (ms)' },
    nip: { type: 'string', description: 'NIP number' },
  },
  run({ args }) {
    return withErrorHandler(async () => {
      const globalOpts = getGlobalOpts(args);
      requireNonProd(globalOpts);

      const permissions = (args.permissions as string).split(',').map((p) => p.trim()) as TestDataPermission[];

      const request: TestDataPermissionsRevokeRequest = {
        contextIdentifier: { type: 'Nip', value: args['context-nip'] as string },
        authorizedIdentifier: {
          type: args['identifier-type'] as 'Nip' | 'Pesel' | 'Fingerprint',
          value: args.identifier as string,
        },
        permissions,
      };

      const result = await createClient(globalOpts).testData.revokePermissions(request);
      outputStatus(result, args.json);
    });
  },
});

const enableAttachment = defineCommand({
  meta: { name: 'enable-attachment', description: 'Enable attachment permission for a subject' },
  args: {
    nip: { type: 'string', description: 'Subject NIP', required: true },
    env: { type: 'string', description: 'Environment (test/demo/prod)' },
    json: { type: 'boolean', description: 'Output as JSON' },
    verbose: { type: 'boolean', description: 'Show HTTP request/response details' },
    timeout: { type: 'string', description: 'Request timeout (ms)' },
  },
  run({ args }) {
    return withErrorHandler(async () => {
      const globalOpts = getGlobalOpts(args);
      requireNonProd(globalOpts);

      const request: AttachmentPermissionGrantRequest = { nip: args.nip as string };
      const result = await createClient(globalOpts).testData.enableAttachment(request);
      outputStatus(result, args.json);
    });
  },
});

const disableAttachment = defineCommand({
  meta: { name: 'disable-attachment', description: 'Disable attachment permission for a subject' },
  args: {
    nip: { type: 'string', description: 'Subject NIP', required: true },
    'end-date': { type: 'string', description: 'Expected end date (ISO format)' },
    env: { type: 'string', description: 'Environment (test/demo/prod)' },
    json: { type: 'boolean', description: 'Output as JSON' },
    verbose: { type: 'boolean', description: 'Show HTTP request/response details' },
    timeout: { type: 'string', description: 'Request timeout (ms)' },
  },
  run({ args }) {
    return withErrorHandler(async () => {
      const globalOpts = getGlobalOpts(args);
      requireNonProd(globalOpts);

      const request: AttachmentPermissionRevokeRequest = {
        nip: args.nip as string,
        expectedEndDate: args['end-date'] as string | undefined,
      };

      const result = await createClient(globalOpts).testData.disableAttachment(request);
      outputStatus(result, args.json);
    });
  },
});

const changeSessionLimits = defineCommand({
  meta: { name: 'change-session-limits', description: 'Change session limits in current context' },
  args: {
    'max-invoices': { type: 'string', description: 'Max invoices per session', required: true },
    'max-duration': { type: 'string', description: 'Max session duration in minutes', required: true },
    env: { type: 'string', description: 'Environment (test/demo/prod)' },
    json: { type: 'boolean', description: 'Output as JSON' },
    verbose: { type: 'boolean', description: 'Show HTTP request/response details' },
    timeout: { type: 'string', description: 'Request timeout (ms)' },
    nip: { type: 'string', description: 'NIP number' },
  },
  run({ args }) {
    return withErrorHandler(async () => {
      const globalOpts = getGlobalOpts(args);
      requireNonProd(globalOpts);

      const { client } = requireSession(globalOpts);

      const request: ChangeSessionLimitsInCurrentContextRequest = {
        maxInvoicesPerSession: parseInt(args['max-invoices'] as string, 10),
        maxSessionDurationMinutes: parseInt(args['max-duration'] as string, 10),
      };

      const result = await client.testData.changeSessionLimits(request);
      outputStatus(result, args.json);
    });
  },
});

const restoreSessionLimits = defineCommand({
  meta: { name: 'restore-session-limits', description: 'Restore default session limits' },
  args: {
    env: { type: 'string', description: 'Environment (test/demo/prod)' },
    json: { type: 'boolean', description: 'Output as JSON' },
    verbose: { type: 'boolean', description: 'Show HTTP request/response details' },
    timeout: { type: 'string', description: 'Request timeout (ms)' },
    nip: { type: 'string', description: 'NIP number' },
  },
  run({ args }) {
    return withErrorHandler(async () => {
      const globalOpts = getGlobalOpts(args);
      requireNonProd(globalOpts);

      const { client } = requireSession(globalOpts);
      const result = await client.testData.restoreDefaultSessionLimits();
      outputStatus(result, args.json);
    });
  },
});

const changeCertLimits = defineCommand({
  meta: { name: 'change-cert-limits', description: 'Change certificates limit in current subject' },
  args: {
    limit: { type: 'string', description: 'Certificate limit', required: true },
    env: { type: 'string', description: 'Environment (test/demo/prod)' },
    json: { type: 'boolean', description: 'Output as JSON' },
    verbose: { type: 'boolean', description: 'Show HTTP request/response details' },
    timeout: { type: 'string', description: 'Request timeout (ms)' },
    nip: { type: 'string', description: 'NIP number' },
  },
  run({ args }) {
    return withErrorHandler(async () => {
      const globalOpts = getGlobalOpts(args);
      requireNonProd(globalOpts);

      const { client } = requireSession(globalOpts);

      const request: ChangeCertificatesLimitInCurrentSubjectRequest = {
        limit: parseInt(args.limit as string, 10),
      };

      const result = await client.testData.changeCertificatesLimit(request);
      outputStatus(result, args.json);
    });
  },
});

const restoreCertLimits = defineCommand({
  meta: { name: 'restore-cert-limits', description: 'Restore default certificates limit' },
  args: {
    env: { type: 'string', description: 'Environment (test/demo/prod)' },
    json: { type: 'boolean', description: 'Output as JSON' },
    verbose: { type: 'boolean', description: 'Show HTTP request/response details' },
    timeout: { type: 'string', description: 'Request timeout (ms)' },
    nip: { type: 'string', description: 'NIP number' },
  },
  run({ args }) {
    return withErrorHandler(async () => {
      const globalOpts = getGlobalOpts(args);
      requireNonProd(globalOpts);

      const { client } = requireSession(globalOpts);
      const result = await client.testData.restoreDefaultCertificatesLimit();
      outputStatus(result, args.json);
    });
  },
});

const setRateLimits = defineCommand({
  meta: { name: 'set-rate-limits', description: 'Set effective API rate limits' },
  args: {
    'context-nip': { type: 'string', description: 'Context NIP', required: true },
    limits: { type: 'string', description: 'Rate limits as JSON string', required: true },
    env: { type: 'string', description: 'Environment (test/demo/prod)' },
    json: { type: 'boolean', description: 'Output as JSON' },
    verbose: { type: 'boolean', description: 'Show HTTP request/response details' },
    timeout: { type: 'string', description: 'Request timeout (ms)' },
    nip: { type: 'string', description: 'NIP number' },
  },
  run({ args }) {
    return withErrorHandler(async () => {
      const globalOpts = getGlobalOpts(args);
      requireNonProd(globalOpts);

      const { client } = requireSession(globalOpts);

      const rateLimits = JSON.parse(args.limits as string);
      const request: EffectiveApiRateLimitsRequest = {
        contextIdentifier: { type: 'Nip', value: args['context-nip'] as string },
        rateLimits,
      };

      const result = await client.testData.setRateLimits(request);
      outputStatus(result, args.json);
    });
  },
});

const restoreRateLimits = defineCommand({
  meta: { name: 'restore-rate-limits', description: 'Restore default API rate limits' },
  args: {
    env: { type: 'string', description: 'Environment (test/demo/prod)' },
    json: { type: 'boolean', description: 'Output as JSON' },
    verbose: { type: 'boolean', description: 'Show HTTP request/response details' },
    timeout: { type: 'string', description: 'Request timeout (ms)' },
    nip: { type: 'string', description: 'NIP number' },
  },
  run({ args }) {
    return withErrorHandler(async () => {
      const globalOpts = getGlobalOpts(args);
      requireNonProd(globalOpts);

      const { client } = requireSession(globalOpts);
      const result = await client.testData.restoreDefaultRateLimits();
      outputStatus(result, args.json);
    });
  },
});

const setProductionRateLimits = defineCommand({
  meta: { name: 'set-production-rate-limits', description: 'Set production API rate limits' },
  args: {
    'context-nip': { type: 'string', description: 'Context NIP', required: true },
    limits: { type: 'string', description: 'Rate limits as JSON string', required: true },
    env: { type: 'string', description: 'Environment (test/demo/prod)' },
    json: { type: 'boolean', description: 'Output as JSON' },
    verbose: { type: 'boolean', description: 'Show HTTP request/response details' },
    timeout: { type: 'string', description: 'Request timeout (ms)' },
    nip: { type: 'string', description: 'NIP number' },
  },
  run({ args }) {
    return withErrorHandler(async () => {
      const globalOpts = getGlobalOpts(args);
      requireNonProd(globalOpts);

      const { client } = requireSession(globalOpts);

      const rateLimits = JSON.parse(args.limits as string);
      const request: EffectiveApiRateLimitsRequest = {
        contextIdentifier: { type: 'Nip', value: args['context-nip'] as string },
        rateLimits,
      };

      const result = await client.testData.setProductionRateLimits(request);
      outputStatus(result, args.json);
    });
  },
});

const restoreProductionRateLimits = defineCommand({
  meta: { name: 'restore-production-rate-limits', description: 'Restore default production API rate limits' },
  args: {
    env: { type: 'string', description: 'Environment (test/demo/prod)' },
    json: { type: 'boolean', description: 'Output as JSON' },
    verbose: { type: 'boolean', description: 'Show HTTP request/response details' },
    timeout: { type: 'string', description: 'Request timeout (ms)' },
    nip: { type: 'string', description: 'NIP number' },
  },
  run({ args }) {
    return withErrorHandler(async () => {
      const globalOpts = getGlobalOpts(args);
      requireNonProd(globalOpts);

      const { client } = requireSession(globalOpts);
      const result = await client.testData.restoreDefaultProductionRateLimits();
      outputStatus(result, args.json);
    });
  },
});

const blockContext = defineCommand({
  meta: { name: 'block-context', description: 'Block a context' },
  args: {
    'context-nip': { type: 'string', description: 'Context NIP', required: true },
    env: { type: 'string', description: 'Environment (test/demo/prod)' },
    json: { type: 'boolean', description: 'Output as JSON' },
    verbose: { type: 'boolean', description: 'Show HTTP request/response details' },
    timeout: { type: 'string', description: 'Request timeout (ms)' },
    nip: { type: 'string', description: 'NIP number' },
  },
  run({ args }) {
    return withErrorHandler(async () => {
      const globalOpts = getGlobalOpts(args);
      requireNonProd(globalOpts);

      const { client } = requireSession(globalOpts);

      const request: ContextBlockRequest = {
        contextIdentifier: { type: 'Nip', value: args['context-nip'] as string },
      };

      const result = await client.testData.blockContext(request);
      outputStatus(result, args.json);
    });
  },
});

const unblockContext = defineCommand({
  meta: { name: 'unblock-context', description: 'Unblock a context' },
  args: {
    'context-nip': { type: 'string', description: 'Context NIP', required: true },
    env: { type: 'string', description: 'Environment (test/demo/prod)' },
    json: { type: 'boolean', description: 'Output as JSON' },
    verbose: { type: 'boolean', description: 'Show HTTP request/response details' },
    timeout: { type: 'string', description: 'Request timeout (ms)' },
    nip: { type: 'string', description: 'NIP number' },
  },
  run({ args }) {
    return withErrorHandler(async () => {
      const globalOpts = getGlobalOpts(args);
      requireNonProd(globalOpts);

      const { client } = requireSession(globalOpts);

      const request: ContextUnblockRequest = {
        contextIdentifier: { type: 'Nip', value: args['context-nip'] as string },
      };

      const result = await client.testData.unblockContext(request);
      outputStatus(result, args.json);
    });
  },
});

export const testDataCommand = defineCommand({
  meta: { name: 'test-data', description: 'Test environment data management (test/demo only)' },
  subCommands: {
    'create-subject': createSubject,
    'remove-subject': removeSubject,
    'create-person': createPerson,
    'remove-person': removePerson,
    'grant-permissions': grantPermissions,
    'revoke-permissions': revokePermissions,
    'enable-attachment': enableAttachment,
    'disable-attachment': disableAttachment,
    'change-session-limits': changeSessionLimits,
    'restore-session-limits': restoreSessionLimits,
    'change-cert-limits': changeCertLimits,
    'restore-cert-limits': restoreCertLimits,
    'set-rate-limits': setRateLimits,
    'restore-rate-limits': restoreRateLimits,
    'set-production-rate-limits': setProductionRateLimits,
    'restore-production-rate-limits': restoreProductionRateLimits,
    'block-context': blockContext,
    'unblock-context': unblockContext,
  },
});
