import { describe, it, expect, vi, beforeEach } from 'vitest';
import { invoiceCommand } from '../../../../src/cli/commands/invoice.js';
import * as clientFactory from '../../../../src/cli/client-factory.js';
import * as configStore from '../../../../src/cli/config-store.js';
import * as output from '../../../../src/cli/output.js';
import * as fs from 'node:fs';
import { consola } from 'consola';
import { validate as validateInvoice } from '../../../../src/validation/invoice-validator.js';
import { createMockClient, defaultConfig, validSession } from './_helpers.js';

vi.mock('consola', () => ({
  consola: { level: 0, start: vi.fn(), info: vi.fn(), success: vi.fn(), error: vi.fn(), log: vi.fn(), warn: vi.fn() },
}));

vi.mock('../../../../src/cli/error-handler.js', () => ({
  withErrorHandler: vi.fn((fn) => fn()),
}));

vi.mock('../../../../src/cli/client-factory.js', () => ({
  requireSession: vi.fn(),
  createClient: vi.fn(),
}));

vi.mock('../../../../src/cli/config-store.js', () => ({
  loadConfig: vi.fn(),
}));

vi.mock('../../../../src/cli/session-store.js', () => ({
  saveOnlineSessionRef: vi.fn(),
  clearOnlineSessionRef: vi.fn(),
  loadEncryptionData: vi.fn(() => ({
    cipherKey: new Uint8Array(32),
    cipherIv: new Uint8Array(16),
  })),
}));

vi.mock('../../../../src/cli/output.js', () => ({
  outputResult: vi.fn(),
  outputTable: vi.fn(),
  outputSuccess: vi.fn(),
  outputKeyValue: vi.fn(),
  outputWarning: vi.fn(),
}));

vi.mock('../../../../src/validation/invoice-validator.js', () => ({
  validate: vi.fn(),
}));

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  statSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  readdirSync: vi.fn(),
  mkdirSync: vi.fn(),
  default: {
    existsSync: vi.fn(),
    statSync: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    readdirSync: vi.fn(),
    mkdirSync: vi.fn(),
  },
}));

const mockRequireSession = vi.mocked(clientFactory.requireSession);
const mockLoadConfig = vi.mocked(configStore.loadConfig);
let mockClient: ReturnType<typeof createMockClient>;

beforeEach(() => {
  vi.clearAllMocks();
  mockClient = createMockClient();
  mockRequireSession.mockResolvedValue({ client: mockClient as any, session: { ...validSession, onlineSessionRef: 'online-ref' } });
  mockLoadConfig.mockReturnValue({ ...defaultConfig });
});

async function runQuery(args: Record<string, unknown>) {
  return (invoiceCommand.subCommands!.query as any).run!({ args });
}

async function runSend(args: Record<string, unknown>) {
  return (invoiceCommand.subCommands!.send as any).run!({ args });
}

async function runGet(args: Record<string, unknown>) {
  return (invoiceCommand.subCommands!.get as any).run!({ args });
}

async function runValidate(args: Record<string, unknown>) {
  return (invoiceCommand.subCommands!.validate as any).run!({ args });
}

const mockValidateInvoice = vi.mocked(validateInvoice);

describe('invoice', () => {
  describe('query / buildQueryFilters', () => {
    it('throws when --from is missing', async () => {
      await expect(runQuery({})).rejects.toThrow('--from is required');
    });

    it('defaults subjectType to Subject1 and dateType to Invoicing', async () => {
      mockClient.invoices.queryInvoiceMetadata.mockResolvedValue({ invoices: [], hasMore: false });
      await runQuery({ from: '2024-01-01' });
      expect(mockClient.invoices.queryInvoiceMetadata).toHaveBeenCalledWith(
        expect.objectContaining({
          subjectType: 'Subject1',
          dateRange: expect.objectContaining({ dateType: 'Invoicing', from: '2024-01-01T00:00:00+00:00' }),
        }),
        undefined, undefined,
      );
    });

    it('passes sellerNip filter', async () => {
      mockClient.invoices.queryInvoiceMetadata.mockResolvedValue({ invoices: [], hasMore: false });
      await runQuery({ from: '2024-01-01', sellerNip: '1234567890' });
      expect(mockClient.invoices.queryInvoiceMetadata).toHaveBeenCalledWith(
        expect.objectContaining({ sellerNip: '1234567890' }),
        undefined, undefined,
      );
    });

    it('creates buyerIdentifier with type Nip', async () => {
      mockClient.invoices.queryInvoiceMetadata.mockResolvedValue({ invoices: [], hasMore: false });
      await runQuery({ from: '2024-01-01', buyerNip: '9876543210' });
      expect(mockClient.invoices.queryInvoiceMetadata).toHaveBeenCalledWith(
        expect.objectContaining({ buyerIdentifier: { type: 'Nip', value: '9876543210' } }),
        undefined, undefined,
      );
    });

    it('creates amount with default Brutto type', async () => {
      mockClient.invoices.queryInvoiceMetadata.mockResolvedValue({ invoices: [], hasMore: false });
      await runQuery({ from: '2024-01-01', amountFrom: '100' });
      expect(mockClient.invoices.queryInvoiceMetadata).toHaveBeenCalledWith(
        expect.objectContaining({ amount: expect.objectContaining({ type: 'Brutto', from: 100 }) }),
        undefined, undefined,
      );
    });

    it('passes explicit amountType', async () => {
      mockClient.invoices.queryInvoiceMetadata.mockResolvedValue({ invoices: [], hasMore: false });
      await runQuery({ from: '2024-01-01', amountFrom: '100', amountType: 'Netto' });
      expect(mockClient.invoices.queryInvoiceMetadata).toHaveBeenCalledWith(
        expect.objectContaining({ amount: expect.objectContaining({ type: 'Netto' }) }),
        undefined, undefined,
      );
    });

    it('creates currencyCodes array', async () => {
      mockClient.invoices.queryInvoiceMetadata.mockResolvedValue({ invoices: [], hasMore: false });
      await runQuery({ from: '2024-01-01', currency: 'EUR' });
      expect(mockClient.invoices.queryInvoiceMetadata).toHaveBeenCalledWith(
        expect.objectContaining({ currencyCodes: ['EUR'] }),
        undefined, undefined,
      );
    });

    it('calls consola.info when no results', async () => {
      mockClient.invoices.queryInvoiceMetadata.mockResolvedValue({ invoices: [], hasMore: false });
      await runQuery({ from: '2024-01-01' });
      expect(consola.info).toHaveBeenCalledWith(expect.stringContaining('No invoices'));
    });
  });

  describe('send', () => {
    it('throws when path does not exist', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      await expect(runSend({ path: '/nonexistent.xml' })).rejects.toThrow('Path not found');
    });

    it('sends single invoice file', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.statSync).mockReturnValue({ isDirectory: () => false } as any);
      vi.mocked(fs.readFileSync).mockReturnValue(Buffer.from('<xml/>'));
      mockClient.onlineSession.sendInvoice.mockResolvedValue({ referenceNumber: 'ref-123' });

      await runSend({ path: '/test.xml' });
      expect(mockClient.onlineSession.sendInvoice).toHaveBeenCalledWith(
        'online-ref',
        expect.objectContaining({ invoiceHash: 'mock-hash' }),
      );
    });
  });

  describe('get', () => {
    it('calls getInvoice with ksefNumber', async () => {
      mockClient.invoices.getInvoice.mockResolvedValue({ xml: '<invoice/>', hash: 'h1' });
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      await runGet({ ksefNumber: 'KSeF-123' });
      expect(mockClient.invoices.getInvoice).toHaveBeenCalledWith('KSeF-123');
      logSpy.mockRestore();
    });

    it('writes to file when --output is provided', async () => {
      mockClient.invoices.getInvoice.mockResolvedValue({ xml: '<invoice/>' });
      await runGet({ ksefNumber: 'KSeF-123', o: '/out.xml' });
      expect(fs.writeFileSync).toHaveBeenCalledWith('/out.xml', '<invoice/>', 'utf-8');
    });
  });

  describe('query — pretty mode with results', () => {
    it('outputs table when invoices are returned', async () => {
      const invoices = [
        {
          ksefNumber: 'KSeF-001',
          invoiceNumber: 'FV/2024/001',
          invoicingDate: '2024-01-15',
          seller: { nip: '1111111111' },
          grossAmount: 1230.00,
          currency: 'PLN',
        },
        {
          ksefNumber: 'KSeF-002',
          invoiceNumber: 'FV/2024/002',
          invoicingDate: '2024-01-16',
          seller: { nip: '2222222222' },
          grossAmount: 456.78,
          currency: 'EUR',
        },
      ];
      mockClient.invoices.queryInvoiceMetadata.mockResolvedValue({ invoices, hasMore: false });

      await runQuery({ from: '2024-01-01' });

      expect(output.outputTable).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ ksefNumber: 'KSeF-001', invoiceNumber: 'FV/2024/001', grossAmount: 1230.00 }),
          expect.objectContaining({ ksefNumber: 'KSeF-002', currency: 'EUR' }),
        ]),
        expect.arrayContaining([
          expect.objectContaining({ key: 'ksefNumber', label: 'KSeF Number' }),
          expect.objectContaining({ key: 'grossAmount', label: 'Gross Amount' }),
        ]),
        { json: false },
      );
    });

    it('shows "more results" hint when hasMore is true', async () => {
      const invoices = [
        {
          ksefNumber: 'KSeF-001',
          invoiceNumber: 'FV/2024/001',
          invoicingDate: '2024-01-15',
          seller: { nip: '1111111111' },
          grossAmount: 100,
          currency: 'PLN',
        },
      ];
      mockClient.invoices.queryInvoiceMetadata.mockResolvedValue({ invoices, hasMore: true });

      await runQuery({ from: '2024-01-01' });

      expect(consola.info).toHaveBeenCalledWith(expect.stringContaining('More results available'));
    });

    it('does not show "more results" hint when hasMore is false', async () => {
      const invoices = [
        {
          ksefNumber: 'KSeF-001',
          invoiceNumber: 'FV/2024/001',
          invoicingDate: '2024-01-15',
          seller: { nip: '1111111111' },
          grossAmount: 100,
          currency: 'PLN',
        },
      ];
      mockClient.invoices.queryInvoiceMetadata.mockResolvedValue({ invoices, hasMore: false });

      await runQuery({ from: '2024-01-01' });

      // consola.info should NOT have been called with "More results" message
      const calls = vi.mocked(consola.info).mock.calls.map((c) => c[0]);
      expect(calls.every((msg) => typeof msg !== 'string' || !msg.includes('More results'))).toBe(true);
    });
  });

  describe('query — JSON mode', () => {
    it('outputs JSON result when --json is set', async () => {
      const queryResult = { invoices: [], hasMore: false };
      mockClient.invoices.queryInvoiceMetadata.mockResolvedValue(queryResult);

      await runQuery({ from: '2024-01-01', json: true });

      expect(output.outputResult).toHaveBeenCalledWith(queryResult, { json: true });
      // outputTable should NOT be called in JSON mode
      expect(output.outputTable).not.toHaveBeenCalled();
    });

    it('passes page and size parameters', async () => {
      mockClient.invoices.queryInvoiceMetadata.mockResolvedValue({ invoices: [], hasMore: false });

      await runQuery({ from: '2024-01-01', json: true, page: '2', size: '50' });

      expect(mockClient.invoices.queryInvoiceMetadata).toHaveBeenCalledWith(
        expect.any(Object),
        2,
        50,
      );
    });
  });

  describe('send — validate flag', () => {
    it('runs validation before sending when --validate is set', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.statSync).mockReturnValue({ isDirectory: () => false } as any);
      vi.mocked(fs.readFileSync).mockReturnValue(Buffer.from('<Faktura/>'));
      mockValidateInvoice.mockResolvedValue({ valid: true, schemaType: 'FA3', errors: [] });
      mockClient.onlineSession.sendInvoice.mockResolvedValue({ referenceNumber: 'ref-val' });

      await runSend({ path: '/test.xml', validate: true });

      expect(mockValidateInvoice).toHaveBeenCalledWith('<Faktura/>');
      expect(mockClient.onlineSession.sendInvoice).toHaveBeenCalled();
    });

    it('does not send when validation fails', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.statSync).mockReturnValue({ isDirectory: () => false } as any);
      vi.mocked(fs.readFileSync).mockReturnValue(Buffer.from('<bad/>'));
      mockValidateInvoice.mockResolvedValue({
        valid: false, schemaType: null,
        errors: [{ code: 'MALFORMED_XML', message: 'Invalid XML' }],
      });

      await expect(runSend({ path: '/test.xml', validate: true })).rejects.toThrow('Validation failed');
      expect(mockClient.onlineSession.sendInvoice).not.toHaveBeenCalled();
    });
  });

  describe('send — form-code option', () => {
    it('resolves form code for single file send', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.statSync).mockReturnValue({ isDirectory: () => false } as any);
      vi.mocked(fs.readFileSync).mockReturnValue(Buffer.from('<xml/>'));
      mockClient.onlineSession.sendInvoice.mockResolvedValue({ referenceNumber: 'ref-fa3' });

      await runSend({ path: '/test.xml', formCode: 'FA3' });
      expect(mockClient.onlineSession.sendInvoice).toHaveBeenCalled();
    });

    it('resolves form code for batch send', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.statSync).mockReturnValue({ isDirectory: () => true } as any);
      vi.mocked(fs.readdirSync).mockReturnValue(['a.xml'] as any);
      vi.mocked(fs.readFileSync).mockReturnValue(Buffer.from('<xml/>'));
      mockClient.batchSession.openSession.mockResolvedValue({ referenceNumber: 'batch-fa3' });
      mockClient.batchSession.sendParts.mockResolvedValue(undefined);
      mockClient.batchSession.closeSession.mockResolvedValue(undefined);
      mockLoadConfig.mockReturnValue({ ...defaultConfig, nip: '1234567890' });

      await runSend({ path: '/dir', formCode: 'FA3' });
      expect(mockClient.batchSession.openSession).toHaveBeenCalledWith(
        expect.objectContaining({ formCode: { systemCode: 'FA (3)', schemaVersion: '1-0E', value: 'FA' } }),
      );
    });

    it('throws on invalid --form-code key', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.statSync).mockReturnValue({ isDirectory: () => false } as any);
      await expect(runSend({ path: '/test.xml', formCode: 'INVALID' })).rejects.toThrow('Invalid form code "INVALID"');
    });

    it('rejects PEF for batch (directory) mode', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.statSync).mockReturnValue({ isDirectory: () => true } as any);
      vi.mocked(fs.readdirSync).mockReturnValue(['a.xml'] as any);
      mockLoadConfig.mockReturnValue({ ...defaultConfig, nip: '1234567890' });

      await expect(runSend({ path: '/dir', formCode: 'PEF3' })).rejects.toThrow('not supported in batch sessions');
    });

    it('rejects PEFKOR3 for batch mode', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.statSync).mockReturnValue({ isDirectory: () => true } as any);
      vi.mocked(fs.readdirSync).mockReturnValue(['a.xml'] as any);
      mockLoadConfig.mockReturnValue({ ...defaultConfig, nip: '1234567890' });

      await expect(runSend({ path: '/dir', formCode: 'PEFKOR3' })).rejects.toThrow('not supported in batch sessions');
    });
  });

  describe('send — batch error paths', () => {
    it('throws when directory has no XML files', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.statSync).mockReturnValue({ isDirectory: () => true } as any);
      vi.mocked(fs.readdirSync).mockReturnValue(['readme.txt', 'data.csv'] as any);

      await expect(runSend({ path: '/empty-dir' })).rejects.toThrow('No XML files found');
    });

    it('throws when NIP is not provided for batch send', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.statSync).mockReturnValue({ isDirectory: () => true } as any);
      vi.mocked(fs.readdirSync).mockReturnValue(['invoice.xml'] as any);
      mockLoadConfig.mockReturnValue({ ...defaultConfig, nip: undefined });

      await expect(runSend({ path: '/dir' })).rejects.toThrow('NIP is required');
    });
  });

  describe('send — batch JSON mode', () => {
    it('outputs JSON when --json is set in batch mode', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.statSync).mockReturnValue({ isDirectory: () => true } as any);
      vi.mocked(fs.readdirSync).mockReturnValue(['a.xml', 'b.xml'] as any);
      vi.mocked(fs.readFileSync).mockReturnValue(Buffer.from('<xml/>'));
      mockClient.batchSession.openSession.mockResolvedValue({ referenceNumber: 'batch-ref-1' });
      mockClient.batchSession.sendParts.mockResolvedValue(undefined);
      mockClient.batchSession.closeSession.mockResolvedValue(undefined);
      mockLoadConfig.mockReturnValue({ ...defaultConfig, nip: '1234567890' });

      await runSend({ path: '/dir', json: true });

      expect(output.outputResult).toHaveBeenCalledWith(
        { referenceNumber: 'batch-ref-1', invoiceCount: 2 },
        { json: true },
      );
    });
  });

  describe('send — batch pretty mode', () => {
    it('outputs success message when --json is not set in batch mode', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.statSync).mockReturnValue({ isDirectory: () => true } as any);
      vi.mocked(fs.readdirSync).mockReturnValue(['a.xml'] as any);
      vi.mocked(fs.readFileSync).mockReturnValue(Buffer.from('<xml/>'));
      mockClient.batchSession.openSession.mockResolvedValue({ referenceNumber: 'batch-ref-2' });
      mockClient.batchSession.sendParts.mockResolvedValue(undefined);
      mockClient.batchSession.closeSession.mockResolvedValue(undefined);
      mockLoadConfig.mockReturnValue({ ...defaultConfig, nip: '1234567890' });

      await runSend({ path: '/dir' });

      expect(output.outputSuccess).toHaveBeenCalledWith(expect.stringContaining('batch-ref-2'));
    });
  });

  describe('send — single file edge cases', () => {
    it('throws when no online session ref is available', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.statSync).mockReturnValue({ isDirectory: () => false } as any);
      mockRequireSession.mockResolvedValue({
        client: mockClient as any,
        session: { ...validSession, onlineSessionRef: undefined },
      });

      await expect(runSend({ path: '/test.xml' })).rejects.toThrow('No active online session');
    });

    it('outputs JSON when --json is set for single file send', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.statSync).mockReturnValue({ isDirectory: () => false } as any);
      vi.mocked(fs.readFileSync).mockReturnValue(Buffer.from('<xml/>'));
      mockClient.onlineSession.sendInvoice.mockResolvedValue({ referenceNumber: 'single-ref-1' });

      await runSend({ path: '/test.xml', json: true });

      expect(output.outputResult).toHaveBeenCalledWith(
        { referenceNumber: 'single-ref-1' },
        { json: true },
      );
    });
  });

  describe('get — JSON mode', () => {
    it('outputs JSON when --json is set', async () => {
      mockClient.invoices.getInvoice.mockResolvedValue({ xml: '<invoice/>', hash: 'h1' });

      await runGet({ ksefNumber: 'KSeF-456', json: true });

      expect(output.outputResult).toHaveBeenCalledWith(
        { ksefNumber: 'KSeF-456', xml: '<invoice/>', hash: 'h1' },
        { json: true },
      );
    });

    it('outputs JSON without hash when hash is absent', async () => {
      mockClient.invoices.getInvoice.mockResolvedValue({ xml: '<invoice/>' });

      await runGet({ ksefNumber: 'KSeF-789', json: true });

      expect(output.outputResult).toHaveBeenCalledWith(
        { ksefNumber: 'KSeF-789', xml: '<invoice/>' },
        { json: true },
      );
    });
  });

  describe('export', () => {
    async function runExport(args: Record<string, unknown>) {
      return (invoiceCommand.subCommands!.export as any).run!({ args });
    }

    it('starts export and outputs JSON result', async () => {
      const exportResult = { referenceNumber: 'export-ref-123' };
      mockClient.invoices.exportInvoices.mockResolvedValue(exportResult);

      await runExport({ from: '2024-01-01', json: true });

      expect(mockClient.crypto.init).toHaveBeenCalled();
      expect(mockClient.crypto.getEncryptionData).toHaveBeenCalled();
      expect(mockClient.invoices.exportInvoices).toHaveBeenCalledWith(
        expect.objectContaining({
          encryption: { key: 'mock-key' },
          filters: expect.objectContaining({
            subjectType: 'Subject1',
            dateRange: expect.objectContaining({ from: '2024-01-01T00:00:00+00:00' }),
          }),
        }),
      );
      expect(output.outputResult).toHaveBeenCalledWith(exportResult, { json: true });
    });

    it('starts export and outputs success message in pretty mode', async () => {
      const exportResult = { referenceNumber: 'export-ref-456' };
      mockClient.invoices.exportInvoices.mockResolvedValue(exportResult);

      await runExport({ from: '2024-01-01' });

      expect(output.outputSuccess).toHaveBeenCalledWith(expect.stringContaining('export-ref-456'));
      expect(consola.info).toHaveBeenCalledWith(expect.stringContaining('export-status'));
    });

    it('throws when --from is missing', async () => {
      await expect(runExport({})).rejects.toThrow('--from is required');
    });
  });

  describe('export-status', () => {
    async function runExportStatus(args: Record<string, unknown>) {
      return (invoiceCommand.subCommands!['export-status'] as any).run!({ args });
    }

    it('outputs export status as JSON when --json is set', async () => {
      const statusResult = {
        status: { code: 200, description: 'Completed' },
        completedDate: '2024-01-02',
        packageExpirationDate: '2024-02-02',
        package: null,
      };
      mockClient.invoices.getInvoiceExportStatus.mockResolvedValue(statusResult);

      await runExportStatus({ ref: 'export-ref-1', json: true });

      expect(mockClient.invoices.getInvoiceExportStatus).toHaveBeenCalledWith('export-ref-1');
      expect(output.outputResult).toHaveBeenCalledWith(statusResult, { json: true });
    });

    it('displays status info in pretty mode', async () => {
      const statusResult = {
        status: { code: 200, description: 'Completed' },
        completedDate: '2024-01-02',
        packageExpirationDate: '2024-02-02',
        package: null,
      };
      mockClient.invoices.getInvoiceExportStatus.mockResolvedValue(statusResult);

      await runExportStatus({ ref: 'export-ref-2' });

      expect(consola.info).toHaveBeenCalledWith(expect.stringContaining('200'));
      expect(consola.info).toHaveBeenCalledWith(expect.stringContaining('2024-01-02'));
      expect(consola.info).toHaveBeenCalledWith(expect.stringContaining('2024-02-02'));
    });

    it('displays package table with parts', async () => {
      const statusResult = {
        status: { code: 200, description: 'Completed' },
        completedDate: null,
        packageExpirationDate: null,
        package: {
          invoiceCount: 5,
          size: 10240,
          parts: [
            { ordinalNumber: 1, partName: 'part-1.zip', partSize: 5120, url: 'https://example.com/part-1', expirationDate: '2024-03-01' },
            { ordinalNumber: 2, partName: 'part-2.zip', partSize: 5120, url: 'https://example.com/part-2', expirationDate: '2024-03-01' },
          ],
        },
      };
      mockClient.invoices.getInvoiceExportStatus.mockResolvedValue(statusResult);

      await runExportStatus({ ref: 'export-ref-3' });

      expect(consola.info).toHaveBeenCalledWith(expect.stringContaining('5'));
      expect(consola.info).toHaveBeenCalledWith(expect.stringContaining('10240'));
      expect(output.outputTable).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ part: 1, name: 'part-1.zip', size: 5120 }),
          expect.objectContaining({ part: 2, name: 'part-2.zip', size: 5120 }),
        ]),
        expect.arrayContaining([
          expect.objectContaining({ key: 'part', label: '#' }),
          expect.objectContaining({ key: 'name', label: 'Part' }),
        ]),
        { json: false },
      );
    });

    it('handles status without completedDate or packageExpirationDate', async () => {
      const statusResult = {
        status: { code: 100, description: 'Processing' },
        completedDate: null,
        packageExpirationDate: null,
        package: null,
      };
      mockClient.invoices.getInvoiceExportStatus.mockResolvedValue(statusResult);

      await runExportStatus({ ref: 'export-ref-4' });

      expect(consola.info).toHaveBeenCalledWith(expect.stringContaining('Processing'));
    });
  });

  describe('validate', () => {
    it('validates a single XML file successfully', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.statSync).mockReturnValue({ isDirectory: () => false } as any);
      vi.mocked(fs.readFileSync).mockReturnValue('<Faktura/>');
      mockValidateInvoice.mockResolvedValue({ valid: true, schemaType: 'FA3', errors: [] });

      await runValidate({ files: '/test.xml' });

      expect(mockValidateInvoice).toHaveBeenCalledWith('<Faktura/>', undefined);
      expect(consola.success).toHaveBeenCalledWith(expect.stringContaining('valid'));
    });

    it('reports invalid file and sets process.exitCode', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.statSync).mockReturnValue({ isDirectory: () => false } as any);
      vi.mocked(fs.readFileSync).mockReturnValue('<bad/>');
      mockValidateInvoice.mockResolvedValue({
        valid: false, schemaType: null,
        errors: [{ code: 'MALFORMED_XML', message: 'Empty root' }],
      });

      const origExitCode = process.exitCode;
      await runValidate({ files: '/bad.xml' });

      expect(consola.error).toHaveBeenCalledWith(expect.stringContaining('INVALID'));
      expect(process.exitCode).toBe(1);
      process.exitCode = origExitCode;
    });

    it('validates all XML files in a directory', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.statSync).mockReturnValue({ isDirectory: () => true } as any);
      vi.mocked(fs.readdirSync).mockReturnValue(['a.xml', 'b.xml'] as any);
      vi.mocked(fs.readFileSync).mockReturnValue('<Faktura/>');
      mockValidateInvoice.mockResolvedValue({ valid: true, schemaType: 'FA3', errors: [] });

      await runValidate({ files: '/dir' });

      expect(mockValidateInvoice).toHaveBeenCalledTimes(2);
      expect(consola.info).toHaveBeenCalledWith(expect.stringContaining('2 valid'));
    });

    it('throws when directory has no XML files', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.statSync).mockReturnValue({ isDirectory: () => true } as any);
      vi.mocked(fs.readdirSync).mockReturnValue(['readme.txt'] as any);

      await expect(runValidate({ files: '/empty-dir' })).rejects.toThrow('No XML files found');
    });

    it('throws when file does not exist', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      await expect(runValidate({ files: '/missing.xml' })).rejects.toThrow('File not found');
    });

    it('throws on invalid --schema value', async () => {
      await expect(runValidate({ files: '/test.xml', schema: 'INVALID' })).rejects.toThrow('Invalid schema "INVALID"');
    });

    it('passes schema override to validator', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.statSync).mockReturnValue({ isDirectory: () => false } as any);
      vi.mocked(fs.readFileSync).mockReturnValue('<Faktura/>');
      mockValidateInvoice.mockResolvedValue({ valid: true, schemaType: 'FA2', errors: [] });

      await runValidate({ files: '/test.xml', schema: 'FA2' });

      expect(mockValidateInvoice).toHaveBeenCalledWith('<Faktura/>', { schema: 'FA2' });
    });

    it('outputs JSON when --json is set', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.statSync).mockReturnValue({ isDirectory: () => false } as any);
      vi.mocked(fs.readFileSync).mockReturnValue('<Faktura/>');
      mockValidateInvoice.mockResolvedValue({ valid: true, schemaType: 'FA3', errors: [] });

      await runValidate({ files: '/test.xml', json: true });

      expect(output.outputResult).toHaveBeenCalledWith(
        expect.objectContaining({
          files: [expect.objectContaining({ file: 'test.xml', valid: true, schemaType: 'FA3' })],
          summary: { total: 1, valid: 1, invalid: 0 },
        }),
        { json: true },
      );
    });
  });
});
