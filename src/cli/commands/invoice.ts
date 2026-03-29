import * as fs from 'node:fs';
import * as path from 'node:path';
import { Readable } from 'node:stream';
import { defineCommand } from 'citty';
import { consola } from 'consola';
import { requireSession } from '../client-factory.js';
import { loadConfig } from '../config-store.js';
import { saveOnlineSessionRef, clearOnlineSessionRef } from '../session-store.js';
import { outputResult, outputTable, outputSuccess } from '../output.js';
import { withErrorHandler } from '../error-handler.js';
import type { GlobalOptions } from '../types.js';
import type { FormCode } from '../../models/common.js';
import type { InvoiceQueryFilters, InvoiceSubjectType, InvoiceQueryDateType, AmountType } from '../../models/invoices/types.js';
import { DEFAULT_FORM_CODE, FORM_CODE_KEYS, validateFormCodeForSession } from '../../models/document-structures/index.js';
import { exportIncremental } from './export-incremental.js';
import { normalizeCliDate } from '../date-utils.js';
import { validate as validateInvoice } from '../../validation/invoice-validator.js';
import { KSeFValidationError } from '../../errors/ksef-validation-error.js';
import type { SchemaType } from '../../validation/schemas/index.js';

function getGlobalOpts(args: Record<string, unknown>): GlobalOptions {
  return {
    env: args.env as string | undefined,
    json: args.json as boolean | undefined,
    verbose: args.verbose as boolean | undefined,
    timeout: args.timeout as string | undefined,
    nip: args.nip as string | undefined,
  };
}

function buildQueryFilters(args: Record<string, unknown>): InvoiceQueryFilters {
  const from = args.from as string | undefined;
  if (!from) {
    throw new Error('--from is required for invoice queries.');
  }

  const to = args.to as string | undefined;
  const filters: InvoiceQueryFilters = {
    subjectType: (args.subjectType as InvoiceSubjectType) ?? 'Subject1',
    dateRange: {
      dateType: (args.dateType as InvoiceQueryDateType) ?? 'Invoicing',
      from: normalizeCliDate(from, 'from'),
      to: to ? normalizeCliDate(to, 'to') : undefined,
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
    path: { type: 'positional', description: 'Path to XML file, directory of XMLs, or ZIP for batch', required: true },
    sessionRef: { type: 'string', description: 'Override online session reference' },
    stream: { type: 'boolean', description: 'Use stream-based batch upload (for ZIP files, reduces memory usage)' },
    formCode: { type: 'string', description: 'Document type: FA2, FA3, PEF3, PEFKOR3, FARR1 (default: FA3)' },
    validate: { type: 'boolean', description: 'Validate XML before sending' },
    env: { type: 'string', description: 'Environment (test/demo/prod)' },
    json: { type: 'boolean', description: 'Output as JSON' },
    verbose: { type: 'boolean', description: 'Show HTTP request/response details' },
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

      const formCodeKey = args.formCode as string | undefined;
      let formCode: FormCode = DEFAULT_FORM_CODE;
      if (formCodeKey) {
        const resolved = FORM_CODE_KEYS[formCodeKey];
        if (!resolved) {
          throw new Error(`Invalid form code "${formCodeKey}". Valid keys: ${Object.keys(FORM_CODE_KEYS).join(', ')}`);
        }
        formCode = resolved;
      }

      if (!fs.existsSync(filePath)) {
        throw new Error(`Path not found: ${filePath}`);
      }

      const stat = fs.statSync(filePath);

      if (args.stream) {
        // Stream-based batch upload from a ZIP file
        if (args.validate) {
          consola.warn('--validate is only supported for single-file sends, skipping validation.');
        }

        if (!filePath.endsWith('.zip') || stat.isDirectory()) {
          throw new Error('--stream requires a .zip file path.');
        }

        if (!nip) {
          throw new Error('NIP is required. Provide --nip or set it via `ksef config set --nip <nip>`.');
        }

        if (!validateFormCodeForSession(formCode, 'batch')) {
          throw new Error(`Document type "${formCode.systemCode}" is not supported in batch sessions. PEF/PEF_KOR require online sessions.`);
        }

        const { uploadBatchStream } = await import('../../workflows/batch-session-workflow.js');
        const zipSize = stat.size;
        const zipStreamFactory = () =>
          Readable.toWeb(fs.createReadStream(filePath)) as ReadableStream<Uint8Array>;

        if (!args.json) consola.start(`Sending batch via stream (${(zipSize / 1_000_000).toFixed(1)} MB)...`);

        const result = await uploadBatchStream(client, zipStreamFactory, zipSize, {
          formCode,
          pollOptions: { intervalMs: 3000 },
        });

        if (args.json) {
          outputResult(result, { json: true });
        } else {
          outputSuccess(`Batch sent via stream. Ref: ${result.sessionRef}, invoices: ${result.upo.invoiceCount ?? 'unknown'}`);
        }
        return;
      }

      if (stat.isDirectory()) {
        // Batch mode: send all XMLs in directory
        if (args.validate) {
          consola.warn('--validate is only supported for single-file sends, skipping validation.');
        }

        const xmlFiles = fs.readdirSync(filePath)
          .filter((f) => f.endsWith('.xml'))
          .map((f) => path.join(filePath, f));

        if (xmlFiles.length === 0) {
          throw new Error(`No XML files found in ${filePath}`);
        }

        if (!nip) {
          throw new Error('NIP is required. Provide --nip or set it via `ksef config set --nip <nip>`.');
        }

        if (!validateFormCodeForSession(formCode, 'batch')) {
          throw new Error(`Document type "${formCode.systemCode}" is not supported in batch sessions. PEF/PEF_KOR require online sessions.`);
        }

        if (!args.json) consola.start(`Sending ${xmlFiles.length} invoices via batch session...`);
        await client.crypto.init();
        const encryptionData = client.crypto.getEncryptionData();

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
        );

        saveOnlineSessionRef(openResult.referenceNumber);
        await client.batchSession.sendParts(openResult, parts);
        await client.batchSession.closeSession(openResult.referenceNumber);
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

        // Validate before send if --validate flag is set
        if (args.validate) {
          const xmlStr = fs.readFileSync(filePath, 'utf-8');
          const validationResult = await validateInvoice(xmlStr);
          if (!validationResult.valid) {
            throw new KSeFValidationError(
              `Validation failed for ${filePath}`,
              validationResult.errors.map(e => ({ field: e.path, message: e.message })),
            );
          }
          if (!args.json) consola.success('Validation passed.');
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
        });

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
    verbose: { type: 'boolean', description: 'Show HTTP request/response details' },
    timeout: { type: 'string', description: 'Request timeout (ms)' },
  },
  run({ args }) {
    return withErrorHandler(async () => {
      const globalOpts = getGlobalOpts(args);
      const { client } = requireSession(globalOpts);

      const xml = await client.invoices.getInvoice(args.ksefNumber);

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
    verbose: { type: 'boolean', description: 'Show HTTP request/response details' },
    timeout: { type: 'string', description: 'Request timeout (ms)' },
    nip: { type: 'string', description: 'NIP number' },
  },
  run({ args }) {
    return withErrorHandler(async () => {
      const globalOpts = getGlobalOpts(args);
      const { client } = requireSession(globalOpts);

      const filters = buildQueryFilters(args);
      const pageOffset = args.page ? parseInt(args.page as string, 10) : undefined;
      const pageSize = args.size ? parseInt(args.size as string, 10) : undefined;

      const result = await client.invoices.queryInvoiceMetadata(
        filters,
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
    verbose: { type: 'boolean', description: 'Show HTTP request/response details' },
    timeout: { type: 'string', description: 'Request timeout (ms)' },
    nip: { type: 'string', description: 'NIP number' },
  },
  run({ args }) {
    return withErrorHandler(async () => {
      const globalOpts = getGlobalOpts(args);
      const { client } = requireSession(globalOpts);

      if (!args.json) consola.start('Starting invoice export...');
      await client.crypto.init();
      const encryptionData = client.crypto.getEncryptionData();
      const filters = buildQueryFilters(args);

      const result = await client.invoices.exportInvoices(
        { encryption: encryptionData.encryptionInfo, filters },
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
    verbose: { type: 'boolean', description: 'Show HTTP request/response details' },
    timeout: { type: 'string', description: 'Request timeout (ms)' },
  },
  run({ args }) {
    return withErrorHandler(async () => {
      const globalOpts = getGlobalOpts(args);
      const { client } = requireSession(globalOpts);

      const result = await client.invoices.getInvoiceExportStatus(args.ref);

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

const VALID_SCHEMA_TYPES = ['FA3', 'FA2', 'RR1_V11E', 'RR1_V10E', 'PEF3', 'PEF_KOR3'] as const;

const validateCmd = defineCommand({
  meta: { name: 'validate', description: 'Validate invoice XML against KSeF schema' },
  args: {
    files: { type: 'positional', description: 'XML file(s) or directory to validate', required: true },
    schema: { type: 'string', description: `Schema override: ${VALID_SCHEMA_TYPES.join(', ')}` },
    json: { type: 'boolean', description: 'Output as JSON' },
  },
  run({ args }) {
    return withErrorHandler(async () => {
      const schemaOverride = args.schema as string | undefined;
      if (schemaOverride && !VALID_SCHEMA_TYPES.includes(schemaOverride as SchemaType)) {
        throw new Error(`Invalid schema "${schemaOverride}". Valid: ${VALID_SCHEMA_TYPES.join(', ')}`);
      }

      // Collect files: single file, multiple positional args, or directory
      const inputPath = args.files;
      const filePaths: string[] = [];

      if (fs.existsSync(inputPath) && fs.statSync(inputPath).isDirectory()) {
        const xmlFiles = fs.readdirSync(inputPath)
          .filter(f => f.endsWith('.xml'))
          .map(f => path.join(inputPath, f));
        if (xmlFiles.length === 0) {
          throw new Error(`No XML files found in ${inputPath}`);
        }
        filePaths.push(...xmlFiles);
      } else if (fs.existsSync(inputPath)) {
        filePaths.push(inputPath);
      } else {
        throw new Error(`File not found: ${inputPath}`);
      }

      let validCount = 0;
      let invalidCount = 0;
      const allResults: Array<{ file: string; valid: boolean; schemaType: string | null; errors: unknown[] }> = [];

      for (const file of filePaths) {
        const xml = fs.readFileSync(file, 'utf-8');
        const result = await validateInvoice(xml, schemaOverride ? { schema: schemaOverride as SchemaType } : undefined);

        if (result.valid) {
          validCount++;
          if (!args.json) {
            consola.success(`${path.basename(file)}: valid (${result.schemaType})`);
            if (result.schemaType === 'PEF3' || result.schemaType === 'PEF_KOR3') {
              consola.warn('PEF validation covers wrapper structure only — UBL content is not validated.');
            }
          }
        } else {
          invalidCount++;
          if (!args.json) {
            consola.error(`${path.basename(file)}: INVALID (${result.schemaType ?? 'unknown schema'})`);
            for (const err of result.errors) {
              const loc = err.path ? ` at ${err.path}` : '';
              consola.log(`  [${err.code}]${loc}: ${err.message}`);
            }
          }
        }

        allResults.push({
          file: path.basename(file),
          valid: result.valid,
          schemaType: result.schemaType,
          errors: result.errors,
        });
      }

      if (args.json) {
        outputResult({ files: allResults, summary: { total: filePaths.length, valid: validCount, invalid: invalidCount } }, { json: true });
      } else if (filePaths.length > 1) {
        consola.log('');
        consola.info(`Summary: ${validCount} valid, ${invalidCount} invalid, ${filePaths.length} total`);
      }

      if (invalidCount > 0) {
        process.exitCode = 1;
      }
    });
  },
});

export const invoiceCommand = defineCommand({
  meta: { name: 'invoice', description: 'Invoice commands' },
  subCommands: { send, get, query, validate: validateCmd, export: exportCmd, 'export-status': exportStatus, 'export-incremental': exportIncremental },
});
