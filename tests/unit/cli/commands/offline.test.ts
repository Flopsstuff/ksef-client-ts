import { describe, it, expect, vi, beforeEach } from 'vitest';
import { offlineCommand } from '../../../../src/cli/commands/offline.js';
import * as clientFactory from '../../../../src/cli/client-factory.js';
import * as output from '../../../../src/cli/output.js';
import * as fs from 'node:fs';
import { QrCodeService } from '../../../../src/qr/qrcode-service.js';
import { createMockClient } from './_helpers.js';
import type { OfflineInvoiceMetadata } from '../../../../src/offline/types.js';

vi.mock('consola', () => ({ consola: { level: 0 } }));
vi.mock('../../../../src/cli/error-handler.js', () => ({
  withErrorHandler: vi.fn((fn) => fn()),
}));
vi.mock('../../../../src/cli/client-factory.js', () => ({
  createClient: vi.fn(),
  requireSession: vi.fn(),
}));
vi.mock('../../../../src/cli/config-store.js', () => ({
  loadConfig: vi.fn().mockReturnValue({ environment: 'test', output: 'pretty', timeout: 30000, nip: '1234567890' }),
}));
vi.mock('../../../../src/cli/output.js', () => ({
  outputResult: vi.fn(),
  outputSuccess: vi.fn(),
  outputKeyValue: vi.fn(),
  outputTable: vi.fn(),
  outputWarning: vi.fn(),
}));
vi.mock('node:fs', () => ({
  existsSync: vi.fn().mockReturnValue(true),
  readFileSync: vi.fn().mockReturnValue('<Faktura><Fa><P_1>2026-04-08</P_1><P_2>FV/2026/001</P_2></Fa></Faktura>'),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  default: { existsSync: vi.fn(), readFileSync: vi.fn(), writeFileSync: vi.fn(), mkdirSync: vi.fn() },
}));
vi.mock('../../../../src/qr/qrcode-service.js', () => ({
  QrCodeService: {
    generateQrCode: vi.fn().mockResolvedValue(Buffer.from('png')),
    generateQrCodeSvgWithLabel: vi.fn().mockResolvedValue('<svg/>'),
  },
}));

const mockStorageInvoice: OfflineInvoiceMetadata = {
  id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  mode: 'offline24',
  reason: 'PLANNED',
  status: 'GENERATED',
  invoiceNumber: 'FV/2026/001',
  invoiceDate: '2026-04-08',
  invoiceXml: '<FA/>',
  sellerNip: '1234567890',
  sellerIdentifier: { type: 'Nip', value: '1234567890' },
  kod1Url: 'https://qr-test.ksef.mf.gov.pl/invoice/1234567890/08-04-2026/hash',
  generatedAt: '2026-04-08T10:00:00Z',
  submitBy: '2026-04-09T23:59:59.999Z',
};

const mockStorageMethods = {
  save: vi.fn(),
  get: vi.fn(),
  list: vi.fn().mockResolvedValue([]),
  update: vi.fn(),
  delete: vi.fn(),
};

vi.mock('../../../../src/offline/file-storage.js', () => ({
  FileOfflineInvoiceStorage: vi.fn().mockImplementation(() => mockStorageMethods),
}));

const mockWorkflow = {
  generate: vi.fn().mockResolvedValue(mockStorageInvoice),
  submit: vi.fn().mockResolvedValue({
    total: 1, submitted: 1, accepted: 1, rejected: 0, failed: 0, expired: 0,
    results: [{ invoiceId: 'aaaaaaaa', invoiceNumber: 'FV/2026/001', status: 'ACCEPTED', ksefReferenceNumber: 'ksef-ref' }],
  }),
  correct: vi.fn().mockResolvedValue({
    invoiceId: 'new-id', invoiceNumber: 'FV/2026/001', status: 'ACCEPTED', ksefReferenceNumber: 'ksef-ref-corrected',
  }),
};

const mockCreateClient = vi.mocked(clientFactory.createClient);
const mockRequireSession = vi.mocked(clientFactory.requireSession);

let mockClient: ReturnType<typeof createMockClient>;

beforeEach(() => {
  vi.clearAllMocks();
  mockClient = createMockClient();
  (mockClient as any).offline = mockWorkflow;
  mockCreateClient.mockReturnValue(mockClient as any);
  mockRequireSession.mockResolvedValue({ client: mockClient as any, session: { accessToken: 'at', environment: 'test' } as any });
  mockStorageMethods.get.mockResolvedValue(null);
  mockStorageMethods.list.mockResolvedValue([]);
});

function run(subCommand: string, args: Record<string, unknown>) {
  return (offlineCommand.subCommands![subCommand] as any).run!({ args });
}

describe('offline', () => {
  describe('generate', () => {
    it('generates offline invoice metadata', async () => {
      await run('generate', { xml: '/invoice.xml', nip: '1234567890' });
      expect(mockWorkflow.generate).toHaveBeenCalledWith(
        expect.objectContaining({
          sellerNip: '1234567890',
          invoiceNumber: 'FV/2026/001',
          invoiceDate: '2026-04-08',
          invoiceXml: '<Faktura><Fa><P_1>2026-04-08</P_1><P_2>FV/2026/001</P_2></Fa></Faktura>',
        }),
        expect.objectContaining({ mode: 'offline24' }),
      );
      expect(vi.mocked(output.outputKeyValue)).toHaveBeenCalled();
    });

    it('outputs JSON when --json flag is set', async () => {
      await run('generate', { xml: '/invoice.xml', nip: '1234567890', json: true });
      expect(vi.mocked(output.outputResult)).toHaveBeenCalledWith(mockStorageInvoice, { json: true });
    });

    it('shows warning when no certificate provided', async () => {
      await run('generate', { xml: '/invoice.xml', nip: '1234567890' });
      expect(vi.mocked(output.outputWarning)).toHaveBeenCalledWith(expect.stringContaining('No certificate'));
    });

    it('reads private key when --key provided', async () => {
      vi.mocked(fs.readFileSync)
        .mockReturnValueOnce('<Faktura><Fa><P_1>2026-04-08</P_1><P_2>FV/2026/001</P_2></Fa></Faktura>' as any)  // XML file
        .mockReturnValueOnce('PEM-KEY' as any);  // key file
      await run('generate', { xml: '/invoice.xml', nip: '1234567890', key: '/key.pem', 'cert-serial': '01AA' });
      expect(mockWorkflow.generate).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          certificate: { privateKeyPem: 'PEM-KEY', certificateSerial: '01AA' },
        }),
      );
      expect(vi.mocked(output.outputWarning)).not.toHaveBeenCalled();
    });

    it('throws when --key without --cert-serial', async () => {
      await expect(run('generate', { xml: '/invoice.xml', nip: '1234567890', key: '/key.pem' }))
        .rejects.toThrow('--cert-serial is required');
    });

    it('throws when XML file not found', async () => {
      vi.mocked(fs.existsSync).mockReturnValueOnce(false);
      await expect(run('generate', { xml: '/missing.xml', nip: '1234567890' }))
        .rejects.toThrow('File not found: /missing.xml');
    });

    it('skips storage when --no-store is set', async () => {
      await run('generate', { xml: '/invoice.xml', nip: '1234567890', 'no-store': true });
      expect(mockWorkflow.generate).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ storage: undefined }),
      );
    });

    it('saves QR images when --qr-out specified', async () => {
      await run('generate', { xml: '/invoice.xml', nip: '1234567890', 'qr-out': '/qr-dir' });
      expect(fs.mkdirSync).toHaveBeenCalledWith('/qr-dir', { recursive: true });
      expect(QrCodeService.generateQrCode).toHaveBeenCalledWith(mockStorageInvoice.kod1Url);
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('kod1.png'), expect.any(Buffer),
      );
    });

    it('saves SVG QR images when --qr-format svg', async () => {
      await run('generate', { xml: '/invoice.xml', nip: '1234567890', 'qr-out': '/qr-dir', 'qr-format': 'svg' });
      expect(QrCodeService.generateQrCodeSvgWithLabel).toHaveBeenCalledWith(mockStorageInvoice.kod1Url, 'OFFLINE');
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('kod1.svg'), '<svg/>',
      );
    });

    it('throws when NIP not provided and not in config', async () => {
      const { loadConfig } = await import('../../../../src/cli/config-store.js');
      vi.mocked(loadConfig).mockReturnValueOnce({ environment: 'test', output: 'pretty', timeout: 30000 } as any);
      await expect(run('generate', { xml: '/invoice.xml' }))
        .rejects.toThrow('NIP is required');
    });
  });

  describe('list', () => {
    it('shows message when no invoices found', async () => {
      mockStorageMethods.list.mockResolvedValue([]);
      await run('list', {});
      expect(vi.mocked(output.outputSuccess)).toHaveBeenCalledWith('No offline invoices found.');
    });

    it('outputs empty JSON array when no invoices and --json', async () => {
      mockStorageMethods.list.mockResolvedValue([]);
      await run('list', { json: true });
      expect(vi.mocked(output.outputResult)).toHaveBeenCalledWith([], { json: true });
    });

    it('displays table when invoices exist', async () => {
      mockStorageMethods.list.mockResolvedValue([mockStorageInvoice]);
      await run('list', {});
      expect(vi.mocked(output.outputTable)).toHaveBeenCalledWith(
        [expect.objectContaining({ number: 'FV/2026/001', mode: 'offline24', status: 'GENERATED' })],
        expect.any(Array),
        { json: undefined },
      );
    });

    it('passes status filter', async () => {
      mockStorageMethods.list.mockResolvedValue([]);
      await run('list', { status: 'GENERATED' });
      expect(mockStorageMethods.list).toHaveBeenCalledWith(expect.objectContaining({ status: 'GENERATED' }));
    });

    it('passes mode filter', async () => {
      mockStorageMethods.list.mockResolvedValue([]);
      await run('list', { mode: 'awaryjny' });
      expect(mockStorageMethods.list).toHaveBeenCalledWith(expect.objectContaining({ mode: 'awaryjny' }));
    });

    it('passes expiring filter with 24h cutoff', async () => {
      mockStorageMethods.list.mockResolvedValue([]);
      await run('list', { expiring: true });
      expect(mockStorageMethods.list).toHaveBeenCalledWith(
        expect.objectContaining({ expiringBefore: expect.any(String) }),
      );
    });
  });

  describe('status', () => {
    it('displays invoice details', async () => {
      mockStorageMethods.get.mockResolvedValue(mockStorageInvoice);
      await run('status', { id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' });
      expect(vi.mocked(output.outputKeyValue)).toHaveBeenCalledWith(
        expect.objectContaining({ ID: mockStorageInvoice.id, Number: 'FV/2026/001' }),
        { json: false },
      );
    });

    it('outputs JSON when --json', async () => {
      mockStorageMethods.get.mockResolvedValue(mockStorageInvoice);
      await run('status', { id: 'aaaaaaaa', json: true });
      expect(vi.mocked(output.outputResult)).toHaveBeenCalledWith(mockStorageInvoice, { json: true });
    });

    it('throws when invoice not found', async () => {
      mockStorageMethods.get.mockResolvedValue(null);
      await expect(run('status', { id: 'missing' }))
        .rejects.toThrow('Offline invoice not found: missing');
    });
  });

  describe('submit', () => {
    it('submits all pending invoices with --all', async () => {
      await run('submit', { all: true });
      expect(mockWorkflow.submit).toHaveBeenCalledWith(
        mockClient,
        expect.objectContaining({ invoiceIds: undefined, checkExpiry: true }),
      );
      expect(vi.mocked(output.outputSuccess)).toHaveBeenCalledWith(expect.stringContaining('Accepted: 1'));
    });

    it('submits specific IDs', async () => {
      await run('submit', { ids: 'id-1,id-2' });
      expect(mockWorkflow.submit).toHaveBeenCalledWith(
        mockClient,
        expect.objectContaining({ invoiceIds: ['id-1', 'id-2'] }),
      );
    });

    it('throws when no IDs and no --all', async () => {
      await expect(run('submit', {}))
        .rejects.toThrow('Specify invoice IDs or use --all');
    });

    it('shows message when no pending invoices', async () => {
      mockWorkflow.submit.mockResolvedValueOnce({
        total: 0, submitted: 0, accepted: 0, rejected: 0, failed: 0, expired: 0, results: [],
      });
      await run('submit', { all: true });
      expect(vi.mocked(output.outputSuccess)).toHaveBeenCalledWith('No pending invoices to submit.');
    });

    it('outputs JSON when --json', async () => {
      await run('submit', { all: true, json: true });
      expect(vi.mocked(output.outputResult)).toHaveBeenCalledWith(
        expect.objectContaining({ total: 1, accepted: 1 }), { json: true },
      );
    });

    it('passes checkExpiry=false with --no-check-expiry', async () => {
      await run('submit', { all: true, 'no-check-expiry': true });
      expect(mockWorkflow.submit).toHaveBeenCalledWith(
        mockClient,
        expect.objectContaining({ checkExpiry: false }),
      );
    });

    it('displays result table', async () => {
      await run('submit', { all: true });
      expect(vi.mocked(output.outputTable)).toHaveBeenCalledWith(
        [expect.objectContaining({ status: 'ACCEPTED', ref: 'ksef-ref' })],
        expect.any(Array),
        { json: false },
      );
    });
  });

  describe('correct', () => {
    it('submits technical correction', async () => {
      await run('correct', { id: 'rej-1', xml: '/corrected.xml' });
      expect(mockWorkflow.correct).toHaveBeenCalledWith(
        mockClient,
        expect.objectContaining({ rejectedInvoiceId: 'rej-1', correctedInvoiceXml: '<Faktura><Fa><P_1>2026-04-08</P_1><P_2>FV/2026/001</P_2></Fa></Faktura>' }),
      );
      expect(vi.mocked(output.outputSuccess)).toHaveBeenCalledWith(expect.stringContaining('ksef-ref-corrected'));
    });

    it('outputs JSON when --json', async () => {
      await run('correct', { id: 'rej-1', xml: '/corrected.xml', json: true });
      expect(vi.mocked(output.outputResult)).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'ACCEPTED' }), { json: true },
      );
    });

    it('throws when XML file not found', async () => {
      vi.mocked(fs.existsSync).mockReturnValueOnce(false);
      await expect(run('correct', { id: 'rej-1', xml: '/missing.xml' }))
        .rejects.toThrow('File not found: /missing.xml');
    });
  });

  describe('delete', () => {
    it('deletes invoice by ID', async () => {
      mockStorageMethods.get.mockResolvedValue(mockStorageInvoice);
      await run('delete', { id: 'aaaaaaaa' });
      expect(mockStorageMethods.delete).toHaveBeenCalledWith('aaaaaaaa');
      expect(vi.mocked(output.outputSuccess)).toHaveBeenCalledWith(expect.stringContaining('Deleted'));
    });

    it('deletes all expired invoices with --force', async () => {
      const expired = [
        { ...mockStorageInvoice, id: 'exp-1', status: 'EXPIRED' as const },
        { ...mockStorageInvoice, id: 'exp-2', status: 'EXPIRED' as const },
      ];
      mockStorageMethods.list.mockResolvedValue(expired);
      await run('delete', { expired: true, force: true });
      expect(mockStorageMethods.list).toHaveBeenCalledWith({ status: 'EXPIRED' });
      expect(mockStorageMethods.delete).toHaveBeenCalledTimes(2);
      expect(vi.mocked(output.outputSuccess)).toHaveBeenCalledWith('Deleted 2 expired invoice(s).');
    });

    it('requires --force in non-interactive mode for --expired', async () => {
      const expired = [
        { ...mockStorageInvoice, id: 'exp-1', status: 'EXPIRED' as const },
      ];
      mockStorageMethods.list.mockResolvedValue(expired);
      await expect(run('delete', { expired: true }))
        .rejects.toThrow('Use --force to confirm in non-interactive mode');
    });

    it('shows message when no expired invoices', async () => {
      mockStorageMethods.list.mockResolvedValue([]);
      await run('delete', { expired: true });
      expect(vi.mocked(output.outputSuccess)).toHaveBeenCalledWith('No expired invoices to delete.');
      expect(mockStorageMethods.delete).not.toHaveBeenCalled();
    });

    it('throws when invoice not found', async () => {
      mockStorageMethods.get.mockResolvedValue(null);
      await expect(run('delete', { id: 'missing' }))
        .rejects.toThrow('Offline invoice not found: missing');
    });

    it('throws when no ID and no --expired', async () => {
      await expect(run('delete', {}))
        .rejects.toThrow('Specify an invoice ID or use --expired');
    });
  });
});
