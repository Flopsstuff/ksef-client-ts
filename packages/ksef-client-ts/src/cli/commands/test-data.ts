import { defineCommand } from 'citty';
import { createClient, requireSession } from '../client-factory.js';
import { loadConfig } from '../config-store.js';
import { outputResult, outputSuccess } from '../output.js';
import { withErrorHandler } from '../error-handler.js';
import type { GlobalOptions } from '../types.js';
import type {
  SubjectType,
  TestDataPermission,
  TestDataPermissionType,
  TestDataAuthenticationContextIdentifierType,
  SubjectCreateRequest,
  SubjectRemoveRequest,
  PersonCreateRequest,
  PersonRemoveRequest,
  TestDataPermissionsGrantRequest,
  TestDataPermissionsRevokeRequest,
  AttachmentPermissionGrantRequest,
  AttachmentPermissionRevokeRequest,
  BlockContextAuthenticationRequest,
  UnblockContextAuthenticationRequest,
  TestDataUpdateCertificateRequest,
} from '../../models/test-data/types.js';
import type {
  SetSessionLimitsRequest,
  SetSubjectLimitsRequest,
  SetRateLimitsRequest,
} from '../../models/limits/types.js';
import type { PermissionSubjectIdentifierType } from '../../models/common.js';

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

function outputDone(json?: boolean): void {
  if (json) {
    outputResult({ status: 'ok' }, { json: true });
  } else {
    outputSuccess('Done.');
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

      await createClient(globalOpts).testData.createSubject(request);
      outputDone(args.json);
    }, { json: Boolean(args.json) });
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
      await createClient(globalOpts).testData.removeSubject(request);
      outputDone(args.json);
    }, { json: Boolean(args.json) });
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

      await createClient(globalOpts).testData.createPerson(request);
      outputDone(args.json);
    }, { json: Boolean(args.json) });
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
      await createClient(globalOpts).testData.removePerson(request);
      outputDone(args.json);
    }, { json: Boolean(args.json) });
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

      const permissions: TestDataPermission[] = (args.permissions as string)
        .split(',')
        .map((p) => ({ permissionType: p.trim() as TestDataPermissionType, description: '' }));

      const request: TestDataPermissionsGrantRequest = {
        contextIdentifier: { type: 'Nip', value: args['context-nip'] as string },
        authorizedIdentifier: {
          type: args['identifier-type'] as 'Nip' | 'Pesel' | 'Fingerprint',
          value: args.identifier as string,
        },
        permissions,
      };

      await createClient(globalOpts).testData.grantPermissions(request);
      outputDone(args.json);
    }, { json: Boolean(args.json) });
  },
});

const revokePermissions = defineCommand({
  meta: { name: 'revoke-permissions', description: 'Revoke test data permissions' },
  args: {
    'context-nip': { type: 'string', description: 'Context NIP', required: true },
    identifier: { type: 'string', description: 'Authorized identifier value', required: true },
    'identifier-type': { type: 'string', description: 'Identifier type (Nip/Pesel/Fingerprint)', required: true },
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

      const request: TestDataPermissionsRevokeRequest = {
        contextIdentifier: { type: 'Nip', value: args['context-nip'] as string },
        authorizedIdentifier: {
          type: args['identifier-type'] as 'Nip' | 'Pesel' | 'Fingerprint',
          value: args.identifier as string,
        },
      };

      await createClient(globalOpts).testData.revokePermissions(request);
      outputDone(args.json);
    }, { json: Boolean(args.json) });
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
      await createClient(globalOpts).testData.enableAttachment(request);
      outputDone(args.json);
    }, { json: Boolean(args.json) });
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

      await createClient(globalOpts).testData.disableAttachment(request);
      outputDone(args.json);
    }, { json: Boolean(args.json) });
  },
});

const changeSessionLimits = defineCommand({
  meta: { name: 'change-session-limits', description: 'Change session limits in current context' },
  args: {
    'online-max-size': { type: 'string', description: 'Online session: max invoice size in MB (0-5)', required: true },
    'online-max-attach-size': { type: 'string', description: 'Online session: max invoice with attachment size in MB (0-10)', required: true },
    'online-max-invoices': { type: 'string', description: 'Online session: max invoices (0-100000)', required: true },
    'batch-max-size': { type: 'string', description: 'Batch session: max invoice size in MB (0-5)', required: true },
    'batch-max-attach-size': { type: 'string', description: 'Batch session: max invoice with attachment size in MB (0-10)', required: true },
    'batch-max-invoices': { type: 'string', description: 'Batch session: max invoices (0-100000)', required: true },
    'collective-max-invoices': { type: 'string', description: 'Collective identifiers: max invoices (2-5000)', required: true },
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

      const { client } = await requireSession(globalOpts);

      const request: SetSessionLimitsRequest = {
        onlineSession: {
          maxInvoiceSizeInMB: parseInt(args['online-max-size'] as string, 10),
          maxInvoiceWithAttachmentSizeInMB: parseInt(args['online-max-attach-size'] as string, 10),
          maxInvoices: parseInt(args['online-max-invoices'] as string, 10),
        },
        batchSession: {
          maxInvoiceSizeInMB: parseInt(args['batch-max-size'] as string, 10),
          maxInvoiceWithAttachmentSizeInMB: parseInt(args['batch-max-attach-size'] as string, 10),
          maxInvoices: parseInt(args['batch-max-invoices'] as string, 10),
        },
        collectiveIdentifier: {
          maxInvoices: parseInt(args['collective-max-invoices'] as string, 10),
        },
      };

      await client.testData.changeSessionLimits(request);
      outputDone(args.json);
    }, { json: Boolean(args.json) });
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

      const { client } = await requireSession(globalOpts);
      await client.testData.restoreDefaultSessionLimits();
      outputDone(args.json);
    }, { json: Boolean(args.json) });
  },
});

const changeCertLimits = defineCommand({
  meta: { name: 'change-cert-limits', description: 'Change subject limits (enrollment/certificate) in current subject' },
  args: {
    'identifier-type': { type: 'string', description: 'Subject identifier type (Nip/Pesel/Fingerprint)' },
    'max-enrollments': { type: 'string', description: 'Max enrollments limit' },
    'max-certificates': { type: 'string', description: 'Max certificates limit' },
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

      const { client } = await requireSession(globalOpts);

      const request: SetSubjectLimitsRequest = {
        subjectIdentifierType: args['identifier-type'] as PermissionSubjectIdentifierType | undefined,
        enrollment: args['max-enrollments'] !== undefined
          ? { maxEnrollments: parseInt(args['max-enrollments'] as string, 10) }
          : undefined,
        certificate: args['max-certificates'] !== undefined
          ? { maxCertificates: parseInt(args['max-certificates'] as string, 10) }
          : undefined,
      };

      await client.testData.changeCertificatesLimit(request);
      outputDone(args.json);
    }, { json: Boolean(args.json) });
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

      const { client } = await requireSession(globalOpts);
      await client.testData.restoreDefaultCertificatesLimit();
      outputDone(args.json);
    }, { json: Boolean(args.json) });
  },
});

const setRateLimits = defineCommand({
  meta: { name: 'set-rate-limits', description: 'Set effective API rate limits' },
  args: {
    limits: { type: 'string', description: 'Rate limits as JSON string (ApiRateLimitsOverride)', required: true },
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

      const { client } = await requireSession(globalOpts);

      const request: SetRateLimitsRequest = {
        rateLimits: JSON.parse(args.limits as string),
      };

      await client.testData.setRateLimits(request);
      outputDone(args.json);
    }, { json: Boolean(args.json) });
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

      const { client } = await requireSession(globalOpts);
      await client.testData.restoreDefaultRateLimits();
      outputDone(args.json);
    }, { json: Boolean(args.json) });
  },
});

const setProductionRateLimits = defineCommand({
  meta: { name: 'set-production-rate-limits', description: 'Set production API rate limits' },
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

      const { client } = await requireSession(globalOpts);

      await client.testData.setProductionRateLimits();
      outputDone(args.json);
    }, { json: Boolean(args.json) });
  },
});


const updateCertificate = defineCommand({
  meta: { name: 'update-certificate', description: 'Update certificate expiry in test environment' },
  args: {
    serial: { type: 'string', description: 'Certificate serial number (16 hex chars)', required: true },
    'valid-to': { type: 'string', description: 'New expiry date (ISO 8601 date-time)', required: true },
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

      const { client } = await requireSession(globalOpts);

      const request: TestDataUpdateCertificateRequest = {
        validTo: args['valid-to'] as string,
      };

      await client.testData.updateCertificate(args.serial as string, request);
      outputDone(args.json);
    }, { json: Boolean(args.json) });
  },
});

const blockContext = defineCommand({
  meta: { name: 'block-context', description: 'Block a context' },
  args: {
    'context-value': { type: 'string', description: 'Context identifier value', required: true },
    'context-type': { type: 'string', description: 'Context identifier type (Nip/InternalId/NipVatUe/PeppolId)', default: 'Nip' },
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

      const { client } = await requireSession(globalOpts);

      const request: BlockContextAuthenticationRequest = {
        contextIdentifier: {
          type: (args['context-type'] ?? 'Nip') as TestDataAuthenticationContextIdentifierType,
          value: args['context-value'] as string,
        },
      };

      await client.testData.blockContext(request);
      outputDone(args.json);
    }, { json: Boolean(args.json) });
  },
});

const unblockContext = defineCommand({
  meta: { name: 'unblock-context', description: 'Unblock a context' },
  args: {
    'context-value': { type: 'string', description: 'Context identifier value', required: true },
    'context-type': { type: 'string', description: 'Context identifier type (Nip/InternalId/NipVatUe/PeppolId)', default: 'Nip' },
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

      const { client } = await requireSession(globalOpts);

      const request: UnblockContextAuthenticationRequest = {
        contextIdentifier: {
          type: (args['context-type'] ?? 'Nip') as TestDataAuthenticationContextIdentifierType,
          value: args['context-value'] as string,
        },
      };

      await client.testData.unblockContext(request);
      outputDone(args.json);
    }, { json: Boolean(args.json) });
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
    'update-certificate': updateCertificate,
    'block-context': blockContext,
    'unblock-context': unblockContext,
  },
});
