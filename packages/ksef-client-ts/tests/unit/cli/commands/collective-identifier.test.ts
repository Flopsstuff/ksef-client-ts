import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'node:fs';
import { collectiveIdentifierCommand } from '../../../../src/cli/commands/collective-identifier.js';
import * as clientFactory from '../../../../src/cli/client-factory.js';
import * as output from '../../../../src/cli/output.js';
import { createMockClient, validSession } from './_helpers.js';

vi.mock('consola', () => ({ consola: { level: 0, info: vi.fn() } }));
vi.mock('node:fs', () => ({ readFileSync: vi.fn() }));
vi.mock('../../../../src/cli/error-handler.js', () => ({
  withErrorHandler: vi.fn((fn) => fn()),
}));
vi.mock('../../../../src/cli/client-factory.js', () => ({
  requireSession: vi.fn(),
}));
vi.mock('../../../../src/cli/output.js', () => ({
  outputResult: vi.fn(),
  outputKeyValue: vi.fn(),
  outputTable: vi.fn(),
  outputSuccess: vi.fn(),
  outputWarning: vi.fn(),
}));

const KSEF_A = '1111111111-20260701-0189AB-CD1234-EF';
const KSEF_B = '1111111111-20260702-0189AB-CD5678-AB';
const COLLECTIVE_NUMBER = '1111111111-IZ202607-65ED02180000-E7';

const sub = (name: string) => collectiveIdentifierCommand.subCommands![name] as any;

const mockRequireSession = vi.mocked(clientFactory.requireSession);
let mockClient: ReturnType<typeof createMockClient>;

beforeEach(() => {
  vi.clearAllMocks();
  mockClient = createMockClient();
  mockRequireSession.mockResolvedValue({ client: mockClient as any, session: { ...validSession } });
});

describe('collective-identifier', () => {
  describe('generate', () => {
    it('turns a comma-separated --ksef list into an invoice list', async () => {
      mockClient.collectiveIdentifiers.generate.mockResolvedValue({
        collectiveIdentifierNumber: COLLECTIVE_NUMBER,
      });

      await sub('generate').run!({ args: { ksef: `${KSEF_A}, ${KSEF_B}` } });

      expect(mockClient.collectiveIdentifiers.generate).toHaveBeenCalledWith({
        invoices: [{ ksefNumber: KSEF_A }, { ksefNumber: KSEF_B }],
      });
      expect(output.outputKeyValue).toHaveBeenCalled();
    });

    it('reads a full request object from --file', async () => {
      const invoices = [
        { ksefNumber: KSEF_A, payment: { amount: 100.5, currency: 'PLN' }, description: 'first' },
      ];
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ invoices }));
      mockClient.collectiveIdentifiers.generate.mockResolvedValue({
        collectiveIdentifierNumber: COLLECTIVE_NUMBER,
      });

      await sub('generate').run!({ args: { file: 'invoices.json' } });

      expect(mockClient.collectiveIdentifiers.generate).toHaveBeenCalledWith({ invoices });
    });

    it('reads a bare invoice array from --file', async () => {
      const invoices = [{ ksefNumber: KSEF_A }];
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(invoices));
      mockClient.collectiveIdentifiers.generate.mockResolvedValue({
        collectiveIdentifierNumber: COLLECTIVE_NUMBER,
      });

      await sub('generate').run!({ args: { file: 'invoices.json' } });

      expect(mockClient.collectiveIdentifiers.generate).toHaveBeenCalledWith({ invoices });
    });

    it('rejects a --file whose contents are not an invoice list', async () => {
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ nope: true }));

      await expect(sub('generate').run!({ args: { file: 'invoices.json' } }))
        .rejects.toThrow(/must contain an array of invoices/);
      expect(mockClient.collectiveIdentifiers.generate).not.toHaveBeenCalled();
    });

    it('errors when neither --ksef nor --file is given', async () => {
      await expect(sub('generate').run!({ args: {} }))
        .rejects.toThrow(/--ksef/);
      expect(mockClient.collectiveIdentifiers.generate).not.toHaveBeenCalled();
    });

    it('json flag outputs the result as JSON', async () => {
      const result = { collectiveIdentifierNumber: COLLECTIVE_NUMBER };
      mockClient.collectiveIdentifiers.generate.mockResolvedValue(result);

      await sub('generate').run!({ args: { ksef: KSEF_A, json: true } });

      expect(output.outputResult).toHaveBeenCalledWith(result, { json: true });
    });
  });

  describe('list', () => {
    it('normalizes --from/--to into the query filter', async () => {
      mockClient.collectiveIdentifiers.query.mockResolvedValue({ collectiveIdentifiers: [] });

      await sub('list').run!({ args: { from: '2026-07-01', to: '2026-07-31' } });

      expect(mockClient.collectiveIdentifiers.query).toHaveBeenCalledWith(
        {
          dateCreatedFrom: '2026-07-01T00:00:00+00:00',
          dateCreatedTo: '2026-07-31T23:59:59.999+00:00',
        },
        undefined,
        undefined,
      );
    });

    it('passes optional filters, pageSize and the continuation token', async () => {
      mockClient.collectiveIdentifiers.query.mockResolvedValue({ collectiveIdentifiers: [] });

      await sub('list').run!({
        args: {
          from: '2026-07-01',
          to: '2026-07-31',
          number: COLLECTIVE_NUMBER,
          minInvoices: '2',
          maxInvoices: '10',
          currentContext: true,
          pageSize: '50',
          continue: 'token-abc',
        },
      });

      expect(mockClient.collectiveIdentifiers.query).toHaveBeenCalledWith(
        {
          dateCreatedFrom: '2026-07-01T00:00:00+00:00',
          dateCreatedTo: '2026-07-31T23:59:59.999+00:00',
          collectiveIdentifierNumber: COLLECTIVE_NUMBER,
          invoiceCountFrom: 2,
          invoiceCountTo: 10,
          createdInCurrentContext: true,
        },
        50,
        'token-abc',
      );
    });

    it('renders results as a table', async () => {
      mockClient.collectiveIdentifiers.query.mockResolvedValue({
        collectiveIdentifiers: [{
          collectiveIdentifierNumber: COLLECTIVE_NUMBER,
          dateCreated: '2026-07-15T09:12:00Z',
          invoiceCount: 3,
          createdInCurrentContext: true,
        }],
      });

      await sub('list').run!({ args: { from: '2026-07-01' } });

      expect(output.outputTable).toHaveBeenCalled();
    });

    it('warns when nothing matches', async () => {
      mockClient.collectiveIdentifiers.query.mockResolvedValue({ collectiveIdentifiers: [] });

      await sub('list').run!({ args: { from: '2026-07-01' } });

      expect(output.outputWarning).toHaveBeenCalledWith(
        expect.stringContaining('No collective identifiers'),
      );
    });
  });

  describe('by-ksef', () => {
    it('passes the KSeF number, pageSize and continuation token through', async () => {
      mockClient.collectiveIdentifiers.getByKsefNumber.mockResolvedValue({
        collectiveIdentifiers: [],
      });

      await sub('by-ksef').run!({
        args: { ksefNumber: KSEF_A, pageSize: '25', continue: 'token-xyz' },
      });

      expect(mockClient.collectiveIdentifiers.getByKsefNumber)
        .toHaveBeenCalledWith(KSEF_A, 25, 'token-xyz');
      expect(output.outputWarning).toHaveBeenCalledWith(
        expect.stringContaining('does not belong'),
      );
    });

    it('renders matches as a table', async () => {
      mockClient.collectiveIdentifiers.getByKsefNumber.mockResolvedValue({
        collectiveIdentifiers: [{
          collectiveIdentifierNumber: COLLECTIVE_NUMBER,
          createdInCurrentContext: false,
          dateCreated: '2026-07-15T09:12:00Z',
        }],
      });

      await sub('by-ksef').run!({ args: { ksefNumber: KSEF_A } });

      expect(output.outputTable).toHaveBeenCalled();
    });
  });

  describe('invoices', () => {
    it('passes the identifier, pageSize and continuation token through', async () => {
      mockClient.collectiveIdentifiers.queryInvoices.mockResolvedValue({ invoices: [] });

      await sub('invoices').run!({
        args: { number: COLLECTIVE_NUMBER, pageSize: '200', continue: 'token-123' },
      });

      expect(mockClient.collectiveIdentifiers.queryInvoices)
        .toHaveBeenCalledWith({ collectiveIdentifierNumbers: [COLLECTIVE_NUMBER] }, 200, 'token-123');
    });

    it('splits a comma-separated positional into several identifiers', async () => {
      mockClient.collectiveIdentifiers.queryInvoices.mockResolvedValue({ invoices: [] });

      await sub('invoices').run!({
        args: { number: `${COLLECTIVE_NUMBER}, ${COLLECTIVE_NUMBER}-2 ,` },
      });

      expect(mockClient.collectiveIdentifiers.queryInvoices).toHaveBeenCalledWith(
        { collectiveIdentifierNumbers: [COLLECTIVE_NUMBER, `${COLLECTIVE_NUMBER}-2`] },
        undefined,
        undefined,
      );
    });

    it('notes hidden payment details when an item has detailsHidden set', async () => {
      const { consola } = await import('consola');
      mockClient.collectiveIdentifiers.queryInvoices.mockResolvedValue({
        invoices: [{ ksefNumber: KSEF_A, collectiveIdentifierNumber: COLLECTIVE_NUMBER, detailsHidden: true }],
      });

      await sub('invoices').run!({ args: { number: COLLECTIVE_NUMBER } });

      expect(output.outputTable).toHaveBeenCalled();
      expect(consola.info).toHaveBeenCalledWith(expect.stringContaining('hidden'));
    });

    it('does not note hidden details when every item is disclosed', async () => {
      const { consola } = await import('consola');
      mockClient.collectiveIdentifiers.queryInvoices.mockResolvedValue({
        invoices: [{
          ksefNumber: KSEF_A,
          collectiveIdentifierNumber: COLLECTIVE_NUMBER,
          payment: { amount: 100.5, currency: 'PLN' },
          detailsHidden: false,
        }],
      });

      await sub('invoices').run!({ args: { number: COLLECTIVE_NUMBER } });

      expect(consola.info).not.toHaveBeenCalledWith(expect.stringContaining('hidden'));
    });
  });
});
