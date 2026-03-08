import * as fs from 'node:fs';
import * as path from 'node:path';
import { defineCommand } from 'citty';
import { consola } from 'consola';
import { requireSession } from '../client-factory.js';
import { loadConfig } from '../config-store.js';
import { saveOnlineSessionRef, clearOnlineSessionRef } from '../session-store.js';
import { outputResult, outputTable, outputSuccess } from '../output.js';
import { withErrorHandler } from '../error-handler.js';
import type { GlobalOptions } from '../types.js';
import type { InvoiceQueryFilters, InvoiceSubjectType, InvoiceQueryDateType, AmountType } from '../../models/invoices/types.js';

function getGlobalOpts(args: Record<string, unknown>): GlobalOptions {
  return {
    env: args.env as string | undefined,
    json: args.json as boolean | undefined,
    timeout: args.timeout as string | undefined,
    nip: args.nip as string | undefined,
  };
}

function buildQueryFilters(args: Record<string, unknown>): InvoiceQueryFilters {
  const from = args.from as string | undefined;
  if (!from) {
    throw new Error('--from is required for invoice queries.');
  }

  const filters: InvoiceQueryFilters = {
    subjectType: (args.subjectType as InvoiceSubjectType) ?? 'Subject1',
    dateRange: {
      dateType: (args.dateType as InvoiceQueryDateType) ?? 'Invoicing',
      from,
      to: args.to as string | undefined,
    },
  };

  if (args.sellerNip) {
    filters.sellerNip = args.sellerNip as string;
  }
  if (args.buyerNip) {
    filters.buyerIdentifier = { type: 'Nip', value: args.buyerNip as string };
  }
  if (args.amountFrom !== undefined || args.amountTo !== undefined) {
    filters.amount = {
      type: (args.amountType as AmountType) ?? 'Brutto',
      from: args.amountFrom ? parseFloat(args.amountFrom as string) : undefined,
      to: args.amountTo ? parseFloat(args.amountTo as string) : undefined,
    };
  }
  if (args.currency) {
    filters.currencyCodes = [args.currency as string];
  }

  return filters;
}

const QUERY_FILTER_ARGS = {
  from: { type: 'string' as const, description: 'Start date (YYYY-MM-DD) — required' },
  to: { type: 'string' as const, description: 'End date (YYYY-MM-DD)' },
  subjectType: { type: 'string' as const, description: 'Subject type: Subject1|Subject2|Subject3|SubjectAuthorized (default: Subject1)' },
  dateType: { type: 'string' as const, description: 'Date type: Issue|Invoicing|PermanentStorage (default: Invoicing)' },
  sellerNip: { type: 'string' as const, description: 'Filter by seller NIP' },
  buyerNip: { type: 'string' as const, description: 'Filter by buyer NIP' },
  amountFrom: { type: 'string' as const, description: 'Minimum amount' },
  amountTo: { type: 'string' as const, description: 'Maximum amount' },
  amountType: { type: 'string' as const, description: 'Amount type: Brutto|Netto|Vat (default: Brutto)' },
  currency: { type: 'string' as const, description: 'Currency code (e.g. PLN, EUR)' },
} as const;

const send = defineCommand({
  meta: { name: 'send', description: 'Send invoice(s) — single XML file or directory for batch' },
  args: {
    path: { type: 'positional', description: 'Path to XML file or directory of XMLs', required: true },
    sessionRef: { type: 'string', description: 'Override online session reference' },
    env: { type: 'string', description: 'Environment (test/demo/prod)' },
    json: { type: 'boolean', description: 'Output as JSON' },
    timeout: { type: 'string', description: 'Request timeout (ms)' },
    nip: { type: 'string', description: 'NIP number' },
  },
  run({ args }) {
    return withErrorHandler(async () => {
      const globalOpts = getGlobalOpts(args);
      const { client, session } = requireSession(globalOpts);
      const config = loadConfig();
      const nip = args.nip ?? config.nip;
      const filePath = args.path;

      if (!fs.existsSync(filePath)) {
        throw new Error(`Path not found: ${filePath}`);
      }

      const stat = fs.statSync(filePath);

      if (stat.isDirectory()) {
        // Batch mode: send all XMLs in directory
        const xmlFiles = fs.readdirSync(filePath)
          .filter((f) => f.endsWith('.xml'))
          .map((f) => path.join(filePath, f));

        if (xmlFiles.length === 0) {
          throw new Error(`No XML files found in ${filePath}`);
        }

        if (!nip) {
          throw new Error('NIP is required. Provide --nip or set it via `ksef config set --nip <nip>`.');
        }

        if (!args.json) consola.start(`Sending ${xmlFiles.length} invoices via batch session...`);
        await client.crypto.init();
        const encryptionData = client.crypto.getEncryptionData();
        const formCode = { systemCode: 'FA (2)', schemaVersion: '1-0E', value: 'FA' };

        // Read all files and compute metadata
        const parts = xmlFiles.map((file, i) => {
          const content = fs.readFileSync(file);
          const metadata = client.crypto.getFileMetadata(new Uint8Array(content));
          return {
            data: content.buffer as ArrayBuffer,
            metadata,
            ordinalNumber: i + 1,
          };
        });

        // Compute overall batch file info
        const totalContent = Buffer.concat(xmlFiles.map((f) => fs.readFileSync(f)));
        const totalMetadata = client.crypto.getFileMetadata(new Uint8Array(totalContent));
        const batchFileInfo = {
          fileSize: totalMetadata.fileSize,
          fileHash: totalMetadata.hashSHA,
          fileParts: parts.map((p) => ({
            ordinalNumber: p.ordinalNumber,
            fileSize: p.metadata.fileSize,
            fileHash: p.metadata.hashSHA,
          })),
        };

        const openResult = await client.batchSession.openSession(
          { formCode, batchFile: batchFileInfo, encryption: encryptionData.encryptionInfo },
          session.accessToken,
        );

        saveOnlineSessionRef(openResult.referenceNumber);
        await client.batchSession.sendParts(openResult, parts);
        await client.batchSession.closeSession(openResult.referenceNumber, session.accessToken);
        clearOnlineSessionRef();

        if (args.json) {
          outputResult({ referenceNumber: openResult.referenceNumber, invoiceCount: xmlFiles.length }, { json: true });
        } else {
          outputSuccess(`Batch sent: ${xmlFiles.length} invoices. Ref: ${openResult.referenceNumber}`);
        }
      } else {
        // Single file mode
        const ref = args.sessionRef ?? session.onlineSessionRef;
        if (!ref) {
          throw new Error('No active online session. Run `ksef session open` or provide --session-ref.');
        }

        if (!args.json) consola.start('Sending invoice...');
        await client.crypto.init();
        const encryptionData = client.crypto.getEncryptionData();

        const xmlContent = fs.readFileSync(filePath);
        const xmlBytes = new Uint8Array(xmlContent);
        const plainMetadata = client.crypto.getFileMetadata(xmlBytes);
        const encrypted = client.crypto.encryptAES256(xmlBytes, encryptionData.cipherKey, encryptionData.cipherIv);
        const encryptedMetadata = client.crypto.getFileMetadata(encrypted);

        const result = await client.onlineSession.sendInvoice(ref, {
          invoiceHash: plainMetadata.hashSHA,
          invoiceSize: plainMetadata.fileSize,
          encryptedInvoiceHash: encryptedMetadata.hashSHA,
          encryptedInvoiceSize: encryptedMetadata.fileSize,
          encryptedInvoiceContent: Buffer.from(encrypted).toString('base64'),
        }, session.accessToken);

        if (args.json) {
          outputResult(result, { json: true });
        } else {
          outputSuccess(`Invoice sent. Ref: ${result.referenceNumber}`);
        }
      }
    });
  },
});

const get = defineCommand({
  meta: { name: 'get', description: 'Download invoice by KSeF number' },
  args: {
    ksefNumber: { type: 'positional', description: 'KSeF invoice number', required: true },
    o: { type: 'string', description: 'Output file path' },
    env: { type: 'string', description: 'Environment (test/demo/prod)' },
    json: { type: 'boolean', description: 'Output as JSON' },
    timeout: { type: 'string', description: 'Request timeout (ms)' },
  },
  run({ args }) {
    return withErrorHandler(async () => {
      const globalOpts = getGlobalOpts(args);
      const { client, session } = requireSession(globalOpts);

      const xml = await client.invoices.getInvoice(args.ksefNumber, session.accessToken);

      if (args.json) {
        outputResult({ ksefNumber: args.ksefNumber, xml }, { json: true });
        return;
      }

      if (args.o) {
        fs.writeFileSync(args.o, xml, 'utf-8');
        outputSuccess(`Invoice saved to ${args.o}`);
      } else {
        console.log(xml);
      }
    });
  },
});

const query = defineCommand({
  meta: { name: 'query', description: 'Query invoice metadata' },
  args: {
    ...QUERY_FILTER_ARGS,
    page: { type: 'string', description: 'Page offset (0-based)' },
    size: { type: 'string', description: 'Page size' },
    env: { type: 'string', description: 'Environment (test/demo/prod)' },
    json: { type: 'boolean', description: 'Output as JSON' },
    timeout: { type: 'string', description: 'Request timeout (ms)' },
    nip: { type: 'string', description: 'NIP number' },
  },
  run({ args }) {
    return withErrorHandler(async () => {
      const globalOpts = getGlobalOpts(args);
      const { client, session } = requireSession(globalOpts);

      const filters = buildQueryFilters(args);
      const pageOffset = args.page ? parseInt(args.page as string, 10) : undefined;
      const pageSize = args.size ? parseInt(args.size as string, 10) : undefined;

      const result = await client.invoices.queryInvoiceMetadata(
        filters,
        session.accessToken,
        pageOffset,
        pageSize,
      );

      if (args.json) {
        outputResult(result, { json: true });
        return;
      }

      if (result.invoices.length === 0) {
        consola.info('No invoices found matching the criteria.');
        return;
      }

      outputTable(
        result.invoices.map((inv) => ({
          ksefNumber: inv.ksefNumber,
          invoiceNumber: inv.invoiceNumber,
          date: inv.invoicingDate,
          sellerNip: inv.seller.nip,
          grossAmount: inv.grossAmount,
          currency: inv.currency,
        })),
        [
          { key: 'ksefNumber', label: 'KSeF Number' },
          { key: 'invoiceNumber', label: 'Invoice Number' },
          { key: 'date', label: 'Date' },
          { key: 'sellerNip', label: 'Seller NIP' },
          { key: 'grossAmount', label: 'Gross Amount' },
          { key: 'currency', label: 'Currency' },
        ],
        { json: false },
      );

      if (result.hasMore) {
        consola.info('More results available. Use --page to fetch the next page.');
      }
    });
  },
});

const exportCmd = defineCommand({
  meta: { name: 'export', description: 'Start invoice export' },
  args: {
    ...QUERY_FILTER_ARGS,
    env: { type: 'string', description: 'Environment (test/demo/prod)' },
    json: { type: 'boolean', description: 'Output as JSON' },
    timeout: { type: 'string', description: 'Request timeout (ms)' },
    nip: { type: 'string', description: 'NIP number' },
  },
  run({ args }) {
    return withErrorHandler(async () => {
      const globalOpts = getGlobalOpts(args);
      const { client, session } = requireSession(globalOpts);

      if (!args.json) consola.start('Starting invoice export...');
      await client.crypto.init();
      const encryptionData = client.crypto.getEncryptionData();
      const filters = buildQueryFilters(args);

      const result = await client.invoices.exportInvoices(
        { encryption: encryptionData.encryptionInfo, filters },
        session.accessToken,
      );

      if (args.json) {
        outputResult(result, { json: true });
      } else {
        outputSuccess(`Export started. Ref: ${result.referenceNumber}`);
        consola.info('Check status with: ksef invoice export-status ' + result.referenceNumber);
      }
    });
  },
});

const exportStatus = defineCommand({
  meta: { name: 'export-status', description: 'Check invoice export status' },
  args: {
    ref: { type: 'positional', description: 'Export reference number', required: true },
    env: { type: 'string', description: 'Environment (test/demo/prod)' },
    json: { type: 'boolean', description: 'Output as JSON' },
    timeout: { type: 'string', description: 'Request timeout (ms)' },
  },
  run({ args }) {
    return withErrorHandler(async () => {
      const globalOpts = getGlobalOpts(args);
      const { client, session } = requireSession(globalOpts);

      const result = await client.invoices.getInvoiceExportStatus(args.ref, session.accessToken);

      if (args.json) {
        outputResult(result, { json: true });
        return;
      }

      consola.info(`Status: ${result.status.code} — ${result.status.description}`);

      if (result.completedDate) {
        consola.info(`Completed: ${result.completedDate}`);
      }
      if (result.packageExpirationDate) {
        consola.info(`Package expires: ${result.packageExpirationDate}`);
      }

      if (result.package) {
        consola.info(`Invoices: ${result.package.invoiceCount}, Size: ${result.package.size} bytes`);
        if (result.package.parts.length > 0) {
          outputTable(
            result.package.parts.map((p) => ({
              part: p.ordinalNumber,
              name: p.partName,
              size: p.partSize,
              url: p.url,
              expires: p.expirationDate,
            })),
            [
              { key: 'part', label: '#' },
              { key: 'name', label: 'Part' },
              { key: 'size', label: 'Size' },
              { key: 'url', label: 'URL' },
              { key: 'expires', label: 'Expires' },
            ],
            { json: false },
          );
        }
      }
    });
  },
});

export const invoiceCommand = defineCommand({
  meta: { name: 'invoice', description: 'Invoice commands' },
  subCommands: { send, get, query, export: exportCmd, 'export-status': exportStatus },
});
