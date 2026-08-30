import * as fs from 'node:fs';
import * as path from 'node:path';
import { Readable } from 'node:stream';
import { defineCommand } from 'citty';
import { consola } from 'consola';
import { requireSession } from '../client-factory.js';
import { loadConfig } from '../config-store.js';
import { saveOnlineSessionRef, clearOnlineSessionRef, loadEncryptionData } from '../session-store.js';
import { outputResult, outputTable, outputSuccess } from '../output.js';
import { withErrorHandler } from '../error-handler.js';
import type { GlobalOptions } from '../types.js';
import type { FormCode } from '../../models/common.js';
import type { InvoiceQueryFilters, InvoiceSubjectType, InvoiceQueryDateType, AmountType } from '../../models/invoices/types.js';
import { DEFAULT_FORM_CODE, FORM_CODE_KEYS, validateFormCodeForSession } from '../../models/document-structures/index.js';
import { exportIncremental } from './export-incremental.js';
import { invoiceBuild } from './invoice-build.js';
import { normalizeCliDate } from '../date-utils.js';
import { validate as validateInvoice } from '../../validation/invoice-validator.js';
import { KSeFValidationError } from '../../errors/ksef-validation-error.js';
import { KSeFPdfError } from '../../pdf/errors.js';
import type { InvoiceTemplate } from '../../pdf/template/dsl.js';
import { type SchemaType, SCHEMA_TYPES } from '../../validation/schemas/index.js';
import { withKeyRotationRetry } from '../../crypto/with-key-rotation-retry.js';

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
  amountFrom: { type: 'string' as const, description: 'Minimum amount (negative values allowed)' },
  amountTo: { type: 'string' as const, description: 'Maximum amount (negative values allowed)' },
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
    parallelism: { type: 'string', description: 'Number of concurrent part uploads (batch mode)' },
    env: { type: 'string', description: 'Environment (test/demo/prod)' },
    json: { type: 'boolean', description: 'Output as JSON' },
    verbose: { type: 'boolean', description: 'Show HTTP request/response details' },
    timeout: { type: 'string', description: 'Request timeout (ms)' },
    nip: { type: 'string', description: 'NIP number' },
  },
  run({ args }) {
    return withErrorHandler(async () => {
      const globalOpts = getGlobalOpts(args);
      const { client, session } = await requireSession(globalOpts);
      const config = loadConfig();
      const nip = args.nip ?? config.nip;
      const filePath = args.path;

      const parallelism = args.parallelism ? Number(args.parallelism) : undefined;
      if (parallelism !== undefined && (!Number.isInteger(parallelism) || parallelism < 1)) {
        throw new Error('--parallelism must be a positive integer');
      }

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
          consola.warn('--validate is not supported in stream mode. Run `ksef invoice validate <path>` before sending, or remove --stream.');
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
          parallelism,
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

        // Read all files once — reused for validation, metadata, and batch hash
        const fileBuffers = xmlFiles.map(file => ({ file, content: fs.readFileSync(file) }));

        if (args.validate) {
          const { validateBatch, batchValidationDetails } = await import('../../validation/invoice-validator.js');
          const invoicesToValidate = fileBuffers.map(({ file, content }) => ({
            fileName: path.basename(file),
            xml: content.toString('utf-8'),
          }));
          if (!args.json) consola.start(`Validating ${invoicesToValidate.length} invoices...`);
          const batchResult = await validateBatch(invoicesToValidate);
          if (!batchResult.valid) {
            const invalidCount = batchResult.results.filter(r => !r.result.valid).length;
            throw new KSeFValidationError(
              `Validation failed: ${invalidCount} of ${xmlFiles.length} invoices invalid`,
              batchValidationDetails(batchResult),
            );
          }
          if (!args.json) consola.success(`All ${xmlFiles.length} invoices valid.`);
        }

        if (!args.json) consola.start(`Sending ${xmlFiles.length} invoices via batch session...`);
        await client.crypto.init();

        const parts = fileBuffers.map(({ content }, i) => {
          const metadata = client.crypto.getFileMetadata(new Uint8Array(content));
          return {
            data: content.buffer as ArrayBuffer,
            metadata,
            ordinalNumber: i + 1,
          };
        });

        const totalContent = Buffer.concat(fileBuffers.map(({ content }) => content));
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

        // Fetch keys inside the retry so a key rotation (KSeF 21470) refreshes them before retrying.
        const openResult = await withKeyRotationRetry(client.crypto, async () => {
          const encryptionData = await client.crypto.getEncryptionData();
          return client.batchSession.openSession(
            { formCode, batchFile: batchFileInfo, encryption: encryptionData.encryptionInfo },
          );
        });

        saveOnlineSessionRef(openResult.referenceNumber);
        await client.batchSession.sendParts(openResult, parts, parallelism);
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

        // Read file once — reused for both validation and sending
        const xmlContent = fs.readFileSync(filePath);

        // Validate before send if --validate flag is set
        if (args.validate) {
          const xmlStr = xmlContent.toString('utf-8');
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
        const storedEnc = loadEncryptionData();
        if (!storedEnc) {
          throw new Error('No encryption keys found. The session must be opened with `ksef session open` first (keys are saved automatically).');
        }

        const xmlBytes = new Uint8Array(xmlContent);
        const plainMetadata = client.crypto.getFileMetadata(xmlBytes);
        const encrypted = client.crypto.encryptAES256(xmlBytes, storedEnc.cipherKey, storedEnc.cipherIv);
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
    }, { json: Boolean(args.json) });
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
      const { client } = await requireSession(globalOpts);

      const { xml, hash } = await client.invoices.getInvoice(args.ksefNumber);

      if (args.json) {
        outputResult({ ksefNumber: args.ksefNumber, xml, hash }, { json: true });
        return;
      }

      if (args.o) {
        fs.writeFileSync(args.o, xml, 'utf-8');
        outputSuccess(`Invoice saved to ${args.o}`);
      } else {
        console.log(xml);
      }
    }, { json: Boolean(args.json) });
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
      const { client } = await requireSession(globalOpts);

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
    }, { json: Boolean(args.json) });
  },
});

const exportCmd = defineCommand({
  meta: { name: 'export', description: 'Start invoice export' },
  args: {
    ...QUERY_FILTER_ARGS,
    onlyMetadata: { type: 'boolean', description: 'Export metadata only (no invoice XML)' },
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

      if (!args.json) consola.start('Starting invoice export...');
      await client.crypto.init();
      const filters = buildQueryFilters(args);

      // Fetch keys inside the retry so a key rotation (KSeF 21470) refreshes them before retrying.
      const result = await withKeyRotationRetry(client.crypto, async () => {
        const encryptionData = await client.crypto.getEncryptionData();
        return client.invoices.exportInvoices(
          { encryption: encryptionData.encryptionInfo, filters, onlyMetadata: args.onlyMetadata },
        );
      });

      if (args.json) {
        outputResult(result, { json: true });
      } else {
        outputSuccess(`Export started. Ref: ${result.referenceNumber}`);
        consola.info('Check status with: ksef invoice export-status ' + result.referenceNumber);
      }
    }, { json: Boolean(args.json) });
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
      const { client } = await requireSession(globalOpts);

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
    }, { json: Boolean(args.json) });
  },
});

const VALID_SCHEMA_TYPES = SCHEMA_TYPES;

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
          .sort()
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
    }, { json: Boolean(args.json) });
  },
});

const VALID_PDF_LOCALES = ['pl', 'en', 'uk', 'pl+en', 'en+pl', 'pl+uk', 'uk+pl', 'en+uk', 'uk+en'] as const;
type PdfLocale = (typeof VALID_PDF_LOCALES)[number];

const VALID_PDF_TOTALS = ['none', 'buckets', 'summary', 'both'] as const;
type PdfTotals = (typeof VALID_PDF_TOTALS)[number];

/**
 * The environments a QR verification host can be derived for. An unrecognized
 * value falls through to production when the URL is built, so a typo would
 * print a production host on a test invoice and the command would still report
 * success — the flag has to be the place that catches it.
 */
const VALID_PDF_ENVS = ['prod', 'test', 'demo'] as const;
type PdfEnv = (typeof VALID_PDF_ENVS)[number];

/**
 * A CSS hex colour, the one unambiguous way to name a brand colour. pdfmake
 * silently ignores a value it does not recognize — the document comes out
 * exactly as if no accent had been given — so a typo has to be caught at the
 * flag or it becomes a PDF that is quietly wrong. Named colours still work
 * through the library option, where the caller can see what they passed.
 */
const HEX_COLOUR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/**
 * The formats pdfmake's `image` node can actually draw. GIF, WebP and SVG were
 * accepted here once, but pdfmake 0.2.x rejects every one of them with
 * "Unknown image format" partway through rendering — so the PDF never
 * materialized. Better to refuse the file at the flag than to fail at render.
 */
const LOGO_MIME_BY_EXT: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
};

/**
 * `RenderOptions.logo` takes a `data:` URI so the renderer never touches the
 * filesystem; the CLI is where a path becomes one. The extension picks the MIME
 * type — an unknown one is rejected rather than guessed, since a wrong type
 * silently yields a blank space where the logo should be.
 */
function readImageAsDataUri(file: string): string {
  if (!fs.existsSync(file)) {
    throw new Error(`Logo file not found: ${file}`);
  }
  const ext = file.slice(file.lastIndexOf('.')).toLowerCase();
  const mime = LOGO_MIME_BY_EXT[ext];
  if (!mime) {
    throw new Error(
      `Unsupported logo format "${ext}". Supported: ${Object.keys(LOGO_MIME_BY_EXT).join(', ')}`,
    );
  }
  return `data:${mime};base64,${fs.readFileSync(file).toString('base64')}`;
}

/**
 * Read the `--notes` file: an array of `{ head, body }`. Validated here rather
 * than left to the renderer, because a hand-written JSON file is exactly where a
 * shape mistake happens and a silent one would print nothing at all.
 *
 * Either half may be left out — a note that is only a heading, or only a body,
 * prints that half, which is what the renderer does with one and what the docs
 * promise. What is refused is an entry carrying neither, and a half that is
 * present but not a string: both are shape mistakes rather than intent.
 */
function readNotesFile(file: string): Array<{ head: string; body: string }> {
  if (!fs.existsSync(file)) {
    throw new Error(`Notes file not found: ${file}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch (error) {
    throw new Error(`Notes file is not valid JSON: ${file} (${(error as Error).message})`);
  }
  if (!Array.isArray(parsed)) {
    throw new Error(`Notes file must hold an array of { head, body } objects: ${file}`);
  }
  return parsed.map((entry, i) => {
    const note = entry as { head?: unknown; body?: unknown };
    for (const half of ['head', 'body'] as const) {
      if (note?.[half] !== undefined && typeof note[half] !== 'string') {
        throw new Error(`Notes entry ${i} has a non-string "${half}": ${file}`);
      }
    }
    if (typeof note?.head !== 'string' && typeof note?.body !== 'string') {
      throw new Error(`Notes entry ${i} must have a string "head", a string "body", or both: ${file}`);
    }
    return {
      head: typeof note.head === 'string' ? note.head : '',
      body: typeof note.body === 'string' ? note.body : '',
    };
  });
}

const pdf = defineCommand({
  meta: { name: 'pdf', description: 'Render an invoice or UPO XML to a PDF (offline; requires the optional pdfmake peer)' },
  args: {
    file: { type: 'positional', description: 'Path to the invoice or UPO XML file', required: true },
    template: { type: 'string', description: 'Built-in template name (e.g. fa3-default). Mutually exclusive with --template-file.' },
    templateFile: { type: 'string', description: 'Path to a custom JSON template. Mutually exclusive with --template.' },
    locale: { type: 'string', description: 'Label language: pl | en | uk, or any two joined by + (e.g. pl+uk); default pl' },
    out: { type: 'string', description: 'Output PDF path (default: alongside the source, .pdf)' },
    qr: { type: 'boolean', description: 'Embed the KSeF Code I QR derived from the XML' },
    qrUrl: { type: 'string', description: 'Code I verification URL, used verbatim instead of deriving it' },
    qrCertUrl: { type: 'string', description: 'Code II (offline certificate) verification URL — build it with `ksef qr certificate`' },
    qrLinks: { type: 'boolean', description: 'Print a clickable link under each QR code' },
    ksefNumber: { type: 'string', description: 'KSeF number to print (absent → marked OFFLINE)' },
    upo: { type: 'boolean', description: 'Treat the input as a UPO document (otherwise auto-detected)' },
    logo: { type: 'string', description: 'Path to a logo image (PNG/JPEG) to print in the header' },
    accent: { type: 'string', description: 'Accent colour for the title and headings, as hex (e.g. #5AB595)' },
    totals: { type: 'string', description: 'Tax breakdown above the amount due: none | buckets (as recorded) | summary (computed) | both (default: buckets)' },
    notes: { type: 'string', description: 'Path to a JSON file with extra sections: [{ "head": "…", "body": "…" }, …]' },
    env: { type: 'string', description: 'Environment for the QR base URL (test/demo/prod)' },
    json: { type: 'boolean', description: 'Output as JSON' },
  },
  run({ args }) {
    return withErrorHandler(async () => {
      const file = args.file;
      if (!fs.existsSync(file)) {
        throw new Error(`File not found: ${file}`);
      }
      if (args.template && args.templateFile) {
        throw new Error('--template and --template-file are mutually exclusive; pass only one.');
      }

      const locale = (args.locale as string | undefined) ?? 'pl';
      if (!VALID_PDF_LOCALES.includes(locale as PdfLocale)) {
        throw new Error(`Invalid --locale "${locale}". Valid: ${VALID_PDF_LOCALES.join(', ')}`);
      }

      const totals = (args.totals as string | undefined) ?? 'buckets';
      if (!VALID_PDF_TOTALS.includes(totals as PdfTotals)) {
        throw new Error(`Invalid --totals "${totals}". Valid: ${VALID_PDF_TOTALS.join(', ')}`);
      }

      const accent = args.accent as string | undefined;
      if (accent !== undefined && !HEX_COLOUR.test(accent)) {
        throw new Error(`Invalid --accent "${accent}". Expected a hex colour such as #5AB595 or #b04.`);
      }

      const env = args.env as string | undefined;
      if (env !== undefined && !VALID_PDF_ENVS.includes(env as PdfEnv)) {
        throw new Error(`Invalid --env "${env}". Valid: ${VALID_PDF_ENVS.join(', ')}`);
      }
      const logo = args.logo ? readImageAsDataUri(args.logo as string) : undefined;
      const notes = args.notes ? readNotesFile(args.notes as string) : undefined;
      const renderOpts = {
        locale: locale as PdfLocale,
        totals: totals as PdfTotals,
        qr: Boolean(args.qr),
        qrLinks: Boolean(args.qrLinks),
        ...(args.qrUrl ? { qrUrl: args.qrUrl as string } : {}),
        ...(args.qrCertUrl ? { certificateQrUrl: args.qrCertUrl as string } : {}),
        ...(args.ksefNumber ? { ksefNumber: args.ksefNumber as string } : {}),
        ...(env ? { env: env as PdfEnv } : {}),
        ...(logo ? { logo } : {}),
        ...(accent ? { theme: { accent } } : {}),
        ...(notes ? { notes } : {}),
      };

      // Exact bytes preserve the QR hash; pass the raw file as a Uint8Array.
      const xmlBytes = new Uint8Array(fs.readFileSync(file));
      const xmlStr = Buffer.from(xmlBytes).toString('utf-8');

      // Lazy bridge into the internal PDF module; it lazily requires pdfmake and,
      // when absent/incompatible, throws a friendly install hint we surface here.
      const pdfModule = await import('../../pdf/index.js');

      let bytes: Uint8Array;
      // An explicit template wins over document auto-detection: the built-in
      // registry holds the UPO layouts too, so `--template`/`--template-file`
      // must be honoured for UPO input as well. The renderer validates the
      // template's schema against the document, so a wrong pairing still fails.
      const isUpo = Boolean(args.upo) || (pdfModule.detectInvoiceVersion(xmlStr) === null && pdfModule.detectUpoVersion(xmlStr) !== null);
      if (args.templateFile) {
        // Reading the template is the CLI's job, not the renderer's: `./pdf` is
        // isomorphic and touches no filesystem, so the bytes arrive parsed.
        const templatePath = args.templateFile as string;
        let template: unknown;
        try {
          template = JSON.parse(fs.readFileSync(templatePath, 'utf-8'));
        } catch (err) {
          throw new KSeFPdfError(
            `Failed to read template file "${templatePath}": ${(err as Error).message}`,
          );
        }
        bytes = await pdfModule.renderInvoicePdfFromTemplate(xmlBytes, template as InvoiceTemplate, renderOpts);
      } else if (args.template) {
        bytes = await pdfModule.renderInvoicePdf(xmlBytes, args.template as string, renderOpts);
      } else if (isUpo) {
        bytes = await pdfModule.renderUpoPdf(xmlBytes, renderOpts);
      } else {
        const version = pdfModule.detectInvoiceVersion(xmlStr);
        const builtin = version === 'FA(2)' ? 'fa2-default' : 'fa3-default';
        bytes = await pdfModule.renderInvoicePdf(xmlBytes, builtin, renderOpts);
      }

      const outPath = (args.out as string | undefined) ?? file.replace(/\.xml$/i, '') + '.pdf';
      fs.writeFileSync(outPath, bytes);

      if (args.json) {
        outputResult({ file, out: outPath, bytes: bytes.length }, { json: true });
      } else {
        outputSuccess(`PDF written to ${outPath} (${bytes.length} bytes)`);
      }
    }, { json: Boolean(args.json) });
  },
});

export const invoiceCommand = defineCommand({
  meta: { name: 'invoice', description: 'Invoice commands' },
  subCommands: { send, build: invoiceBuild, get, query, pdf, validate: validateCmd, export: exportCmd, 'export-status': exportStatus, 'export-incremental': exportIncremental },
});
