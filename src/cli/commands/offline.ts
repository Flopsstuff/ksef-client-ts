import * as fs from 'node:fs';
import { defineCommand } from 'citty';
import { consola } from 'consola';
import { createClient, requireSession } from '../client-factory.js';
import { outputResult, outputTable, outputKeyValue, outputSuccess, outputWarning } from '../output.js';
import { withErrorHandler } from '../error-handler.js';
import { loadConfig } from '../config-store.js';
import type { GlobalOptions } from '../types.js';
import { FileOfflineInvoiceStorage } from '../../offline/file-storage.js';
import { QrCodeService } from '../../qr/qrcode-service.js';
import type { OfflineMode } from '../../offline/types.js';
import { extractInvoiceFields } from '../../xml/invoice-field-extractor.js';

function getGlobalOpts(args: Record<string, unknown>): GlobalOptions {
  return {
    env: args.env as string | undefined,
    json: args.json as boolean | undefined,
    verbose: args.verbose as boolean | undefined,
    timeout: args.timeout as string | undefined,
    nip: args.nip as string | undefined,
  };
}

function getStorage(args: Record<string, unknown>): FileOfflineInvoiceStorage {
  return new FileOfflineInvoiceStorage(args['store-dir'] as string | undefined);
}

const globalArgs = {
  env: { type: 'string' as const, description: 'Environment (test/demo/prod)' },
  json: { type: 'boolean' as const, description: 'Output as JSON' },
  verbose: { type: 'boolean' as const, description: 'Verbose output' },
  timeout: { type: 'string' as const, description: 'Request timeout (ms)' },
  nip: { type: 'string' as const, description: 'NIP number' },
  'store-dir': { type: 'string' as const, description: 'Offline invoice store directory' },
};

const generate = defineCommand({
  meta: { name: 'generate', description: 'Generate offline invoice metadata with QR codes' },
  args: {
    ...globalArgs,
    xml: { type: 'positional' as const, description: 'Invoice XML file path', required: true },
    mode: { type: 'string' as const, description: 'Offline mode (offline24/offline/awaryjny)' },
    key: { type: 'string' as const, description: 'Private key PEM file for KOD II signing' },
    'cert-serial': { type: 'string' as const, description: 'Certificate serial number (hex)' },
    'context-type': { type: 'string' as const, description: 'Seller context type (default: Nip)' },
    'context-id': { type: 'string' as const, description: 'Seller context value' },
    'qr-format': { type: 'string' as const, description: 'QR format: png or svg (default: png)' },
    'qr-out': { type: 'string' as const, description: 'Directory to save QR images' },
    'no-store': { type: 'boolean' as const, description: 'Do not save to local store' },
  },
  run({ args }) {
    return withErrorHandler(async () => {
      const globalOpts = getGlobalOpts(args);
      const config = loadConfig();

      const xmlPath = args.xml as string;
      if (!fs.existsSync(xmlPath)) {
        throw new Error(`File not found: ${xmlPath}`);
      }
      const invoiceXml = fs.readFileSync(xmlPath, 'utf-8');

      const sellerNip = (args.nip ?? config.nip) as string;
      if (!sellerNip) {
        throw new Error('NIP is required. Use --nip or set via `ksef config set --nip`');
      }

      const contextType = (args['context-type'] as string) ?? 'Nip';
      const contextId = (args['context-id'] as string) ?? sellerNip;

      const client = createClient(globalOpts);
      const workflow = client.offline;

      if (args.key && !args['cert-serial']) {
        throw new Error('--cert-serial is required when using --key');
      }

      const certificate = args.key
        ? {
            privateKeyPem: fs.readFileSync(args.key as string, 'utf-8'),
            certificateSerial: args['cert-serial'] as string,
          }
        : undefined;

      const validModes: readonly string[] = ['offline24', 'offline', 'awaryjny', 'awaria_calkowita'];
      const modeArg = (args.mode as string) ?? 'offline24';
      if (!validModes.includes(modeArg)) {
        throw new Error(`Invalid --mode "${modeArg}". Must be one of: ${validModes.join(', ')}`);
      }

      const storage = args['no-store'] ? undefined : getStorage(args);

      const { invoiceNumber, invoiceDate } = extractInvoiceFields(invoiceXml);

      const metadata = await workflow.generate(
        {
          invoiceNumber,
          invoiceDate,
          invoiceXml,
          sellerNip,
          sellerIdentifier: { type: contextType as 'Nip', value: contextId },
        },
        {
          mode: modeArg as OfflineMode,
          certificate,
          storage,
        },
      );

      // Save QR images
      if (args['qr-out']) {
        const outDir = args['qr-out'] as string;
        fs.mkdirSync(outDir, { recursive: true });
        const format = (args['qr-format'] as string) ?? 'png';
        if (format !== 'png' && format !== 'svg') {
          throw new Error(`Invalid --qr-format "${format}". Must be one of: png, svg`);
        }
        const shortId = metadata.id.slice(0, 8);

        if (format === 'svg') {
          const svg1 = await QrCodeService.generateQrCodeSvgWithLabel(metadata.kod1Url, 'OFFLINE');
          fs.writeFileSync(`${outDir}/${shortId}-kod1.svg`, svg1);
          if (metadata.kod2Url) {
            const svg2 = await QrCodeService.generateQrCodeSvgWithLabel(metadata.kod2Url, 'CERTYFIKAT');
            fs.writeFileSync(`${outDir}/${shortId}-kod2.svg`, svg2);
          }
        } else {
          const png1 = await QrCodeService.generateQrCode(metadata.kod1Url);
          fs.writeFileSync(`${outDir}/${shortId}-kod1.png`, png1);
          if (metadata.kod2Url) {
            const png2 = await QrCodeService.generateQrCode(metadata.kod2Url);
            fs.writeFileSync(`${outDir}/${shortId}-kod2.png`, png2);
          }
        }
        outputSuccess(`QR codes saved to ${outDir}/`);
      }

      if (!certificate) {
        outputWarning('No certificate provided — KOD II QR code was not generated. Use --key and --cert-serial for offline compliance.');
      }

      if (args.json) {
        outputResult(metadata, { json: true });
      } else {
        outputKeyValue({
          ID: metadata.id,
          Mode: metadata.mode,
          Status: metadata.status,
          Deadline: metadata.submitBy,
          'KOD I': metadata.kod1Url,
          'KOD II': metadata.kod2Url ?? '(not generated)',
        }, { json: false });
      }
    });
  },
});

const list = defineCommand({
  meta: { name: 'list', description: 'List stored offline invoices' },
  args: {
    ...globalArgs,
    status: { type: 'string' as const, description: 'Filter by status' },
    mode: { type: 'string' as const, description: 'Filter by mode' },
    expiring: { type: 'boolean' as const, description: 'Show only invoices expiring within 24h' },
  },
  run({ args }) {
    return withErrorHandler(async () => {
      const storage = getStorage(args);
      const filter: Record<string, unknown> = {};
      if (args.status) filter.status = args.status;
      if (args.mode) filter.mode = args.mode;
      if (args.expiring) {
        const cutoff = new Date(Date.now() + 24 * 60 * 60 * 1000);
        filter.expiringBefore = cutoff.toISOString();
      }

      const invoices = await storage.list(Object.keys(filter).length > 0 ? filter as any : undefined);

      if (invoices.length === 0) {
        if (args.json) {
          outputResult([], { json: true });
        } else {
          outputSuccess('No offline invoices found.');
        }
        return;
      }

      outputTable(
        invoices.map(i => ({
          id: i.id.slice(0, 8),
          number: i.invoiceNumber,
          mode: i.mode,
          status: i.status,
          deadline: i.submitBy.slice(0, 19),
          nip: i.sellerNip,
        })),
        [
          { key: 'id', label: 'ID' },
          { key: 'number', label: 'Number' },
          { key: 'mode', label: 'Mode' },
          { key: 'status', label: 'Status' },
          { key: 'deadline', label: 'Deadline' },
          { key: 'nip', label: 'NIP' },
        ],
        { json: args.json as boolean },
      );
    });
  },
});

const status = defineCommand({
  meta: { name: 'status', description: 'Show offline invoice details' },
  args: {
    ...globalArgs,
    id: { type: 'positional' as const, description: 'Invoice ID', required: true },
  },
  run({ args }) {
    return withErrorHandler(async () => {
      const storage = getStorage(args);
      const invoice = await storage.get(args.id as string);
      if (!invoice) {
        throw new Error(`Offline invoice not found: ${args.id}`);
      }

      if (args.json) {
        outputResult(invoice, { json: true });
      } else {
        outputKeyValue({
          ID: invoice.id,
          Number: invoice.invoiceNumber,
          Date: invoice.invoiceDate,
          Mode: invoice.mode,
          Reason: invoice.reason,
          Status: invoice.status,
          'Seller NIP': invoice.sellerNip,
          Deadline: invoice.submitBy,
          'Generated At': invoice.generatedAt,
          'Submitted At': invoice.submittedAt ?? '-',
          'KSeF Reference': invoice.ksefReferenceNumber ?? '-',
          'KOD I URL': invoice.kod1Url,
          'KOD II URL': invoice.kod2Url ?? '-',
          Error: invoice.error ? `${invoice.error.code}: ${invoice.error.message}` : '-',
        }, { json: false });
      }
    });
  },
});

const submit = defineCommand({
  meta: { name: 'submit', description: 'Submit offline invoices to KSeF' },
  args: {
    ...globalArgs,
    all: { type: 'boolean' as const, description: 'Submit all pending invoices' },
    'no-check-expiry': { type: 'boolean' as const, description: 'Skip expiry check' },
    ids: { type: 'positional' as const, description: 'Invoice IDs to submit' },
  },
  run({ args }) {
    return withErrorHandler(async () => {
      const globalOpts = getGlobalOpts(args);
      const { client } = await requireSession(globalOpts);
      const storage = getStorage(args);

      const invoiceIds = args.ids
        ? (args.ids as string).split(',').map(s => s.trim())
        : undefined;

      if (args.all && invoiceIds) {
        throw new Error('Cannot use --all together with specific invoice IDs. Use one or the other.');
      }

      if (!args.all && !invoiceIds) {
        throw new Error('Specify invoice IDs or use --all to submit all pending invoices.');
      }

      const result = await client.offline.submit(client, {
        storage,
        invoiceIds: args.all ? undefined : invoiceIds,
        checkExpiry: !args['no-check-expiry'],
      });

      if (result.total === 0) {
        outputSuccess('No pending invoices to submit.');
        return;
      }

      if (args.json) {
        outputResult(result, { json: true });
      } else {
        outputSuccess(
          `Submitted: ${result.submitted}, Accepted: ${result.accepted}, ` +
          `Rejected: ${result.rejected}, Expired: ${result.expired}`,
        );
        if (result.results.length > 0) {
          outputTable(
            result.results.map(r => ({
              id: r.invoiceId.slice(0, 8),
              number: r.invoiceNumber,
              status: r.status,
              ref: r.ksefReferenceNumber ?? '-',
            })),
            [
              { key: 'id', label: 'ID' },
              { key: 'number', label: 'Number' },
              { key: 'status', label: 'Status' },
              { key: 'ref', label: 'KSeF Ref' },
            ],
            { json: false },
          );
        }
      }
    });
  },
});

const correct = defineCommand({
  meta: { name: 'correct', description: 'Technical correction for rejected offline invoice' },
  args: {
    ...globalArgs,
    id: { type: 'positional' as const, description: 'Rejected invoice ID', required: true },
    xml: { type: 'positional' as const, description: 'Corrected XML file path', required: true },
  },
  run({ args }) {
    return withErrorHandler(async () => {
      const globalOpts = getGlobalOpts(args);
      const { client } = await requireSession(globalOpts);
      const storage = getStorage(args);

      const xmlPath = args.xml as string;
      if (!fs.existsSync(xmlPath)) {
        throw new Error(`File not found: ${xmlPath}`);
      }
      const correctedXml = fs.readFileSync(xmlPath, 'utf-8');

      const result = await client.offline.correct(client, {
        rejectedInvoiceId: args.id as string,
        correctedInvoiceXml: correctedXml,
        storage,
      });

      if (args.json) {
        outputResult(result, { json: true });
      } else {
        outputSuccess(`Correction submitted. KSeF ref: ${result.ksefReferenceNumber ?? 'pending'}`);
      }
    });
  },
});

const del = defineCommand({
  meta: { name: 'delete', description: 'Delete offline invoice from local store' },
  args: {
    ...globalArgs,
    id: { type: 'positional' as const, description: 'Invoice ID to delete' },
    expired: { type: 'boolean' as const, description: 'Delete all expired invoices' },
    force: { type: 'boolean' as const, description: 'Skip confirmation prompt' },
  },
  run({ args }) {
    return withErrorHandler(async () => {
      const storage = getStorage(args);

      if (args.expired) {
        const expired = await storage.list({ status: 'EXPIRED' });
        if (expired.length === 0) {
          outputSuccess('No expired invoices to delete.');
          return;
        }
        if (!args.force) {
          if (!process.stdin.isTTY) {
            throw new Error(
              `${expired.length} expired invoice(s) would be deleted. Use --force to confirm in non-interactive mode.`,
            );
          }
          const confirmed = await consola.prompt(
            `Delete ${expired.length} expired invoice(s)?`,
            { type: 'confirm', initial: false },
          );
          if (!confirmed) {
            consola.info('Cancelled.');
            return;
          }
        }
        for (const inv of expired) {
          await storage.delete(inv.id);
        }
        outputSuccess(`Deleted ${expired.length} expired invoice(s).`);
        return;
      }

      if (!args.id) {
        throw new Error('Specify an invoice ID or use --expired to delete all expired invoices.');
      }

      const invoice = await storage.get(args.id as string);
      if (!invoice) {
        throw new Error(`Offline invoice not found: ${args.id}`);
      }
      await storage.delete(args.id as string);
      outputSuccess(`Deleted offline invoice ${args.id}`);
    });
  },
});

export const offlineCommand = defineCommand({
  meta: { name: 'offline', description: 'Offline invoice management' },
  subCommands: { generate, list, status, submit, correct, delete: del },
});
