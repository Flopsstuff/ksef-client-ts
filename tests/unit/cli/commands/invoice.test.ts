import { describe, it, expect, vi, beforeEach } from 'vitest';
import { invoiceCommand } from '../../../../src/cli/commands/invoice.js';
import * as clientFactory from '../../../../src/cli/client-factory.js';
import * as configStore from '../../../../src/cli/config-store.js';
import * as output from '../../../../src/cli/output.js';
import * as fs from 'node:fs';
import { consola } from 'consola';
import { createMockClient, defaultConfig, validSession } from './_helpers.js';

vi.mock('consola', () => ({
  consola: { level: 0, start: vi.fn(), info: vi.fn() },
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
}));

vi.mock('../../../../src/cli/output.js', () => ({
  outputResult: vi.fn(),
  outputTable: vi.fn(),
  outputSuccess: vi.fn(),
  outputKeyValue: vi.fn(),
  outputWarning: vi.fn(),
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
  mockRequireSession.mockReturnValue({ client: mockClient as any, session: { ...validSession, onlineSessionRef: 'online-ref' } });
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
          dateRange: expect.objectContaining({ dateType: 'Invoicing', from: '2024-01-01' }),
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
      mockClient.invoices.getInvoice.mockResolvedValue('<invoice/>');
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      await runGet({ ksefNumber: 'KSeF-123' });
      expect(mockClient.invoices.getInvoice).toHaveBeenCalledWith('KSeF-123');
      logSpy.mockRestore();
    });

    it('writes to file when --output is provided', async () => {
      mockClient.invoices.getInvoice.mockResolvedValue('<invoice/>');
      await runGet({ ksefNumber: 'KSeF-123', o: '/out.xml' });
      expect(fs.writeFileSync).toHaveBeenCalledWith('/out.xml', '<invoice/>', 'utf-8');
    });
  });
});
