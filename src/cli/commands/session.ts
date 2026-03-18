import * as fs from 'node:fs';
import { defineCommand } from 'citty';
import { consola } from 'consola';
import { requireSession } from '../client-factory.js';
import { loadConfig } from '../config-store.js';
import { saveOnlineSessionRef, clearOnlineSessionRef } from '../session-store.js';
import { outputResult, outputKeyValue, outputTable, outputSuccess, outputWarning } from '../output.js';
import { withErrorHandler } from '../error-handler.js';
import type { GlobalOptions } from '../types.js';
import type { SessionType } from '../../models/common.js';

function getGlobalOpts(args: Record<string, unknown>): GlobalOptions {
  return {
    env: args.env as string | undefined,
    json: args.json as boolean | undefined,
    verbose: args.verbose as boolean | undefined,
    timeout: args.timeout as string | undefined,
    nip: args.nip as string | undefined,
  };
}

const open = defineCommand({
  meta: { name: 'open', description: 'Open a KSeF session (online or batch)' },
  args: {
    batch: { type: 'boolean', description: 'Open a batch session instead of online' },
    env: { type: 'string', description: 'Environment (test/demo/prod)' },
    json: { type: 'boolean', description: 'Output as JSON' },
    verbose: { type: 'boolean', description: 'Show HTTP request/response details' },
    timeout: { type: 'string', description: 'Request timeout (ms)' },
    nip: { type: 'string', description: 'NIP number' },
  },
  run({ args }) {
    return withErrorHandler(async () => {
      const globalOpts = getGlobalOpts(args);
      const { client } = requireSession(globalOpts);
      const config = loadConfig();
      const nip = args.nip ?? config.nip;

      if (!nip) {
        throw new Error('NIP is required. Provide --nip or set it via `ksef config set --nip <nip>`.');
      }

      await client.crypto.init();
      const encryptionData = client.crypto.getEncryptionData();

      const formCode = { systemCode: 'FA (2)', schemaVersion: '1-0E', value: 'FA' };

      if (args.batch) {
        // Batch session requires file info — placeholder for now, real batch is via invoice send <dir>
        throw new Error('Batch session open is used internally by `ksef invoice send <dir>`. Use `ksef session open` for online sessions.');
      }

      if (!args.json) consola.start('Opening online session...');
      const result = await client.onlineSession.openSession(
        { formCode, encryption: encryptionData.encryptionInfo },
      );

      saveOnlineSessionRef(result.referenceNumber);

      if (args.json) {
        outputResult(result, { json: true });
      } else {
        outputSuccess(`Session opened. Ref: ${result.referenceNumber}`);
        outputKeyValue({
          'Reference': result.referenceNumber,
          'Valid Until': result.validUntil,
        }, { json: false });
      }
    });
  },
});

const close = defineCommand({
  meta: { name: 'close', description: 'Close a KSeF session' },
  args: {
    ref: { type: 'positional', description: 'Session reference (uses stored ref if omitted)', required: false },
    env: { type: 'string', description: 'Environment (test/demo/prod)' },
    json: { type: 'boolean', description: 'Output as JSON' },
    verbose: { type: 'boolean', description: 'Show HTTP request/response details' },
    timeout: { type: 'string', description: 'Request timeout (ms)' },
  },
  run({ args }) {
    return withErrorHandler(async () => {
      const globalOpts = getGlobalOpts(args);
      const { client, session } = requireSession(globalOpts);
      const ref = args.ref ?? session.onlineSessionRef;

      if (!ref) {
        throw new Error('No session reference. Provide a ref or run `ksef session open` first.');
      }

      if (!args.json) consola.start('Closing session...');
      await client.onlineSession.closeSession(ref);
      clearOnlineSessionRef();
      outputSuccess(`Session ${ref} closed.`);
    });
  },
});

const status = defineCommand({
  meta: { name: 'status', description: 'Check session status' },
  args: {
    ref: { type: 'positional', description: 'Session reference (uses stored ref if omitted)', required: false },
    env: { type: 'string', description: 'Environment (test/demo/prod)' },
    json: { type: 'boolean', description: 'Output as JSON' },
    verbose: { type: 'boolean', description: 'Show HTTP request/response details' },
    timeout: { type: 'string', description: 'Request timeout (ms)' },
  },
  run({ args }) {
    return withErrorHandler(async () => {
      const globalOpts = getGlobalOpts(args);
      const { client, session } = requireSession(globalOpts);
      const ref = args.ref ?? session.onlineSessionRef;

      if (!ref) {
        throw new Error('No session reference. Provide a ref or run `ksef session open` first.');
      }

      const result = await client.sessionStatus.getSessionStatus(ref);

      if (args.json) {
        outputResult(result, { json: true });
      } else {
        outputKeyValue({
          'Status': `${result.status.code} — ${result.status.description}`,
          'Created': result.dateCreated,
          'Updated': result.dateUpdated,
          'Valid Until': result.validUntil ?? 'N/A',
          'Invoices': result.invoiceCount ?? 0,
          'Successful': result.successfulInvoiceCount ?? 0,
          'Failed': result.failedInvoiceCount ?? 0,
        }, { json: false });
      }
    });
  },
});

const list = defineCommand({
  meta: { name: 'list', description: 'List sessions' },
  args: {
    type: { type: 'string', description: 'Session type: online or batch (default: online)' },
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
      const sessionType: SessionType = args.type === 'batch' ? 'Batch' : 'Online';
      const pageSize = args.pageSize ? parseInt(args.pageSize, 10) : undefined;

      const result = await client.sessionStatus.getSessions(sessionType, pageSize);

      if (args.json) {
        outputResult(result, { json: true });
        return;
      }

      if (result.sessions.length === 0) {
        outputWarning('No sessions found.');
        return;
      }

      outputTable(
        result.sessions.map((s) => ({
          reference: s.referenceNumber,
          status: `${s.status.code} — ${s.status.description}`,
          created: s.dateCreated,
          total: s.totalInvoiceCount,
          success: s.successfulInvoiceCount,
          failed: s.failedInvoiceCount,
        })),
        [
          { key: 'reference', label: 'Reference' },
          { key: 'status', label: 'Status' },
          { key: 'created', label: 'Created' },
          { key: 'total', label: 'Total' },
          { key: 'success', label: 'Success' },
          { key: 'failed', label: 'Failed' },
        ],
        { json: false },
      );

      if (result.continuationToken) {
        consola.info(`More results available. Continuation token: ${result.continuationToken}`);
      }
    });
  },
});

const invoices = defineCommand({
  meta: { name: 'invoices', description: 'List invoices in a session' },
  args: {
    ref: { type: 'positional', description: 'Session reference (uses stored ref if omitted)', required: false },
    pageSize: { type: 'string', description: 'Number of results per page' },
    env: { type: 'string', description: 'Environment (test/demo/prod)' },
    json: { type: 'boolean', description: 'Output as JSON' },
    verbose: { type: 'boolean', description: 'Show HTTP request/response details' },
    timeout: { type: 'string', description: 'Request timeout (ms)' },
  },
  run({ args }) {
    return withErrorHandler(async () => {
      const globalOpts = getGlobalOpts(args);
      const { client, session } = requireSession(globalOpts);
      const ref = args.ref ?? session.onlineSessionRef;

      if (!ref) {
        throw new Error('No session reference. Provide a ref or run `ksef session open` first.');
      }

      const pageSize = args.pageSize ? parseInt(args.pageSize, 10) : undefined;
      const result = await client.sessionStatus.getSessionInvoices(ref, pageSize);

      if (args.json) {
        outputResult(result, { json: true });
        return;
      }

      if (result.invoices.length === 0) {
        outputWarning('No invoices found.');
        return;
      }

      outputTable(
        result.invoices.map((inv) => ({
          ordinal: inv.ordinalNumber,
          invoiceNumber: inv.invoiceNumber ?? 'N/A',
          ksefNumber: inv.ksefNumber ?? 'N/A',
          status: `${inv.status.code} — ${inv.status.description}`,
          date: inv.invoicingDate,
        })),
        [
          { key: 'ordinal', label: '#' },
          { key: 'invoiceNumber', label: 'Invoice Number' },
          { key: 'ksefNumber', label: 'KSeF Number' },
          { key: 'status', label: 'Status' },
          { key: 'date', label: 'Date' },
        ],
        { json: false },
      );

      if (result.continuationToken) {
        consola.info(`More results available. Continuation token: ${result.continuationToken}`);
      }
    });
  },
});

const failed = defineCommand({
  meta: { name: 'failed', description: 'List failed invoices in a session' },
  args: {
    ref: { type: 'positional', description: 'Session reference (uses stored ref if omitted)', required: false },
    pageSize: { type: 'string', description: 'Number of results per page' },
    env: { type: 'string', description: 'Environment (test/demo/prod)' },
    json: { type: 'boolean', description: 'Output as JSON' },
    verbose: { type: 'boolean', description: 'Show HTTP request/response details' },
    timeout: { type: 'string', description: 'Request timeout (ms)' },
  },
  run({ args }) {
    return withErrorHandler(async () => {
      const globalOpts = getGlobalOpts(args);
      const { client, session } = requireSession(globalOpts);
      const ref = args.ref ?? session.onlineSessionRef;

      if (!ref) {
        throw new Error('No session reference. Provide a ref or run `ksef session open` first.');
      }

      const pageSize = args.pageSize ? parseInt(args.pageSize, 10) : undefined;
      const result = await client.sessionStatus.getSessionFailedInvoices(ref, pageSize);

      if (args.json) {
        outputResult(result, { json: true });
        return;
      }

      if (result.invoices.length === 0) {
        outputSuccess('No failed invoices.');
        return;
      }

      outputTable(
        result.invoices.map((inv) => ({
          ordinal: inv.ordinalNumber,
          invoiceNumber: inv.invoiceNumber ?? 'N/A',
          status: `${inv.status.code} — ${inv.status.description}`,
          details: inv.status.details?.join('; ') ?? '',
          date: inv.invoicingDate,
        })),
        [
          { key: 'ordinal', label: '#' },
          { key: 'invoiceNumber', label: 'Invoice Number' },
          { key: 'status', label: 'Status' },
          { key: 'details', label: 'Details' },
          { key: 'date', label: 'Date' },
        ],
        { json: false },
      );

      if (result.continuationToken) {
        consola.info(`More results available. Continuation token: ${result.continuationToken}`);
      }
    });
  },
});

const upo = defineCommand({
  meta: { name: 'upo', description: 'Download UPO (official receipt)' },
  args: {
    sessionRef: { type: 'positional', description: 'Session reference', required: true },
    upoRef: { type: 'string', description: 'UPO reference' },
    ksefNumber: { type: 'string', description: 'KSeF invoice number' },
    invoiceRef: { type: 'string', description: 'Invoice reference' },
    o: { type: 'string', description: 'Output file path' },
    env: { type: 'string', description: 'Environment (test/demo/prod)' },
    json: { type: 'boolean', description: 'Output as JSON' },
    verbose: { type: 'boolean', description: 'Show HTTP request/response details' },
    timeout: { type: 'string', description: 'Request timeout (ms)' },
  },
  run({ args }) {
    return withErrorHandler(async () => {
      const globalOpts = getGlobalOpts(args);
      const { client } = requireSession(globalOpts);
      const sessionRef = args.sessionRef;

      let result: { upo: string; hash?: string };

      if (args.upoRef) {
        result = await client.sessionStatus.getSessionUpo(sessionRef, args.upoRef);
      } else if (args.ksefNumber) {
        result = await client.sessionStatus.getInvoiceUpoByKsefNumber(sessionRef, args.ksefNumber);
      } else if (args.invoiceRef) {
        result = await client.sessionStatus.getInvoiceUpoByReference(sessionRef, args.invoiceRef);
      } else {
        throw new Error('Provide one of: --upo-ref, --ksef-number, or --invoice-ref');
      }

      if (args.json) {
        outputResult(result, { json: true });
        return;
      }

      if (args.o) {
        fs.writeFileSync(args.o, result.upo, 'utf-8');
        outputSuccess(`UPO saved to ${args.o}`);
      } else {
        console.log(result.upo);
      }
    });
  },
});

const active = defineCommand({
  meta: { name: 'active', description: 'List active authentication sessions' },
  args: {
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
      const pageSize = args.pageSize ? parseInt(args.pageSize, 10) : undefined;

      const result = await client.activeSessions.getActiveSessions(pageSize);

      if (args.json) {
        outputResult(result, { json: true });
        return;
      }

      if (result.items.length === 0) {
        outputWarning('No active sessions found.');
        return;
      }

      outputTable(
        result.items.map((s) => ({
          reference: s.referenceNumber,
          startDate: s.startDate,
          authMethod: s.authenticationMethodInfo?.category ?? 'N/A',
          status: `${s.status.code} — ${s.status.description}`,
          isCurrent: s.isCurrent ? 'Yes' : 'No',
        })),
        [
          { key: 'reference', label: 'Reference' },
          { key: 'startDate', label: 'Start Date' },
          { key: 'authMethod', label: 'Auth Method' },
          { key: 'status', label: 'Status' },
          { key: 'isCurrent', label: 'Current' },
        ],
        { json: false },
      );

      if (result.continuationToken) {
        consola.info(`More results available. Continuation token: ${result.continuationToken}`);
      }
    });
  },
});

const revoke = defineCommand({
  meta: { name: 'revoke', description: 'Revoke an active authentication session' },
  args: {
    ref: { type: 'positional', description: 'Session reference to revoke', required: false },
    current: { type: 'boolean', description: 'Revoke the current session' },
    env: { type: 'string', description: 'Environment (test/demo/prod)' },
    json: { type: 'boolean', description: 'Output as JSON' },
    verbose: { type: 'boolean', description: 'Show HTTP request/response details' },
    timeout: { type: 'string', description: 'Request timeout (ms)' },
  },
  run({ args }) {
    return withErrorHandler(async () => {
      const globalOpts = getGlobalOpts(args);
      const { client } = requireSession(globalOpts);

      if (args.current) {
        await client.activeSessions.revokeCurrentSession();
        if (args.json) {
          outputResult({ status: 'revoked', reference: 'current' }, { json: true });
        } else {
          outputSuccess('Current session revoked.');
        }
      } else if (args.ref) {
        await client.activeSessions.revokeSession(args.ref);
        if (args.json) {
          outputResult({ status: 'revoked', reference: args.ref }, { json: true });
        } else {
          outputSuccess(`Session ${args.ref} revoked.`);
        }
      } else {
        throw new Error('Provide a session reference or use --current to revoke the current session.');
      }
    });
  },
});

const invoice = defineCommand({
  meta: { name: 'invoice', description: 'Get single invoice status in a session' },
  args: {
    invoiceRef: { type: 'positional', description: 'Invoice reference number', required: true },
    ref: { type: 'string', description: 'Session reference (uses stored ref if omitted)' },
    env: { type: 'string', description: 'Environment (test/demo/prod)' },
    json: { type: 'boolean', description: 'Output as JSON' },
    verbose: { type: 'boolean', description: 'Show HTTP request/response details' },
    timeout: { type: 'string', description: 'Request timeout (ms)' },
  },
  run({ args }) {
    return withErrorHandler(async () => {
      const globalOpts = getGlobalOpts(args);
      const { client, session } = requireSession(globalOpts);
      const sessionRef = args.ref ?? session.onlineSessionRef;

      if (!sessionRef) {
        throw new Error('No session reference. Provide --ref or run `ksef session open` first.');
      }

      const result = await client.sessionStatus.getSessionInvoice(sessionRef, args.invoiceRef);

      if (args.json) {
        outputResult(result, { json: true });
      } else {
        outputKeyValue({
          'Ordinal': result.ordinalNumber,
          'Invoice Number': result.invoiceNumber ?? 'N/A',
          'KSeF Number': result.ksefNumber ?? 'N/A',
          'Reference': result.referenceNumber,
          'Hash': result.invoiceHash,
          'Status': `${result.status.code} — ${result.status.description}`,
          'Invoicing Date': result.invoicingDate,
          'Invoicing Mode': result.invoicingMode,
        }, { json: false });
      }
    });
  },
});

export const sessionCommand = defineCommand({
  meta: { name: 'session', description: 'Session management commands' },
  subCommands: { open, close, status, list, invoices, failed, upo, active, revoke, invoice },
});
