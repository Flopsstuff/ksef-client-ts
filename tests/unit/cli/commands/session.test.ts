import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sessionCommand } from '../../../../src/cli/commands/session.js';
import * as clientFactory from '../../../../src/cli/client-factory.js';
import * as configStore from '../../../../src/cli/config-store.js';
import * as sessionStore from '../../../../src/cli/session-store.js';
import * as output from '../../../../src/cli/output.js';
import { createMockClient, defaultConfig, validSession } from './_helpers.js';

vi.mock('consola', () => ({
  consola: { level: 0, start: vi.fn(), info: vi.fn() },
}));

vi.mock('../../../../src/cli/error-handler.js', () => ({
  withErrorHandler: vi.fn((fn) => fn()),
}));

vi.mock('../../../../src/cli/client-factory.js', () => ({
  requireSession: vi.fn(),
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
  outputKeyValue: vi.fn(),
  outputTable: vi.fn(),
  outputSuccess: vi.fn(),
  outputWarning: vi.fn(),
}));

vi.mock('node:fs', () => ({
  writeFileSync: vi.fn(),
  default: { writeFileSync: vi.fn() },
}));

const mockRequireSession = vi.mocked(clientFactory.requireSession);
const mockLoadConfig = vi.mocked(configStore.loadConfig);
const mockSaveOnlineSessionRef = vi.mocked(sessionStore.saveOnlineSessionRef);
const mockClearOnlineSessionRef = vi.mocked(sessionStore.clearOnlineSessionRef);
const mockOutputSuccess = vi.mocked(output.outputSuccess);
let mockClient: ReturnType<typeof createMockClient>;

beforeEach(() => {
  vi.clearAllMocks();
  mockClient = createMockClient();
  mockRequireSession.mockReturnValue({
    client: mockClient as any,
    session: { ...validSession, onlineSessionRef: 'online-ref-1' },
  });
  mockLoadConfig.mockReturnValue({ ...defaultConfig, nip: '1234567890' });
});

async function runOpen(args: Record<string, unknown> = {}) {
  return (sessionCommand.subCommands!.open as any).run!({ args });
}
async function runClose(args: Record<string, unknown> = {}) {
  return (sessionCommand.subCommands!.close as any).run!({ args });
}
async function runUpo(args: Record<string, unknown>) {
  return (sessionCommand.subCommands!.upo as any).run!({ args });
}
async function runRevoke(args: Record<string, unknown> = {}) {
  return (sessionCommand.subCommands!.revoke as any).run!({ args });
}

describe('session', () => {
  describe('open', () => {
    it('throws without NIP', async () => {
      mockLoadConfig.mockReturnValue({ ...defaultConfig, nip: undefined });
      mockRequireSession.mockReturnValue({
        client: mockClient as any,
        session: { ...validSession },
      });
      await expect(runOpen({})).rejects.toThrow('NIP is required');
    });

    it('saves onlineSessionRef after opening', async () => {
      mockClient.onlineSession.openSession.mockResolvedValue({
        referenceNumber: 'new-ref', validUntil: '2099-01-01',
      });
      await runOpen({});
      expect(mockSaveOnlineSessionRef).toHaveBeenCalledWith('new-ref');
    });

    it('throws when --batch is used', async () => {
      await expect(runOpen({ batch: true })).rejects.toThrow('Batch session open is used internally');
    });

    it('outputs JSON when --json is set', async () => {
      const mockOutputResult = vi.mocked(output.outputResult);
      const openResult = { referenceNumber: 'new-ref-json', validUntil: '2099-01-01' };
      mockClient.onlineSession.openSession.mockResolvedValue(openResult);
      await runOpen({ json: true });
      expect(mockOutputResult).toHaveBeenCalledWith(openResult, { json: true });
    });
  });

  describe('close', () => {
    it('calls closeSession and clearOnlineSessionRef', async () => {
      await runClose({});
      expect(mockClient.onlineSession.closeSession).toHaveBeenCalledWith('online-ref-1');
      expect(mockClearOnlineSessionRef).toHaveBeenCalled();
    });

    it('throws without ref', async () => {
      mockRequireSession.mockReturnValue({
        client: mockClient as any,
        session: { ...validSession },
      });
      await expect(runClose({})).rejects.toThrow('No session reference');
    });
  });

  describe('upo', () => {
    it('by --upo-ref', async () => {
      mockClient.sessionStatus.getSessionUpo.mockResolvedValue({ upo: '<upo/>' });
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      await runUpo({ sessionRef: 'sess-1', upoRef: 'upo-1' });
      expect(mockClient.sessionStatus.getSessionUpo).toHaveBeenCalledWith('sess-1', 'upo-1');
      logSpy.mockRestore();
    });

    it('by --ksef-number', async () => {
      mockClient.sessionStatus.getInvoiceUpoByKsefNumber.mockResolvedValue({ upo: '<upo/>' });
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      await runUpo({ sessionRef: 'sess-1', ksefNumber: 'KSeF-123' });
      expect(mockClient.sessionStatus.getInvoiceUpoByKsefNumber).toHaveBeenCalledWith('sess-1', 'KSeF-123');
      logSpy.mockRestore();
    });

    it('by --invoice-ref', async () => {
      mockClient.sessionStatus.getInvoiceUpoByReference.mockResolvedValue({ upo: '<upo/>' });
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      await runUpo({ sessionRef: 'sess-1', invoiceRef: 'inv-ref-1' });
      expect(mockClient.sessionStatus.getInvoiceUpoByReference).toHaveBeenCalledWith('sess-1', 'inv-ref-1');
      logSpy.mockRestore();
    });

    it('throws without parameters', async () => {
      await expect(runUpo({ sessionRef: 'sess-1' })).rejects.toThrow('Provide one of');
    });

    it('outputs JSON when --json is set', async () => {
      const mockOutputResult = vi.mocked(output.outputResult);
      const upoData = { upo: '<upo/>', hash: 'abc123' };
      mockClient.sessionStatus.getSessionUpo.mockResolvedValue(upoData);
      await runUpo({ sessionRef: 'sess-1', upoRef: 'upo-1', json: true });
      expect(mockOutputResult).toHaveBeenCalledWith(upoData, { json: true });
    });

    it('saves to file when --o is provided', async () => {
      const fs = await import('node:fs');
      mockClient.sessionStatus.getSessionUpo.mockResolvedValue({ upo: '<upo-content/>' });
      await runUpo({ sessionRef: 'sess-1', upoRef: 'upo-1', o: '/tmp/upo.xml' });
      expect(fs.writeFileSync).toHaveBeenCalledWith('/tmp/upo.xml', '<upo-content/>', 'utf-8');
      expect(mockOutputSuccess).toHaveBeenCalledWith('UPO saved to /tmp/upo.xml');
    });
  });

  describe('revoke', () => {
    it('--current calls revokeCurrentSession', async () => {
      await runRevoke({ current: true });
      expect(mockClient.activeSessions.revokeCurrentSession).toHaveBeenCalled();
    });

    it('by ref calls revokeSession', async () => {
      await runRevoke({ ref: 'sess-ref-1' });
      expect(mockClient.activeSessions.revokeSession).toHaveBeenCalledWith('sess-ref-1');
    });

    it('throws without ref and --current', async () => {
      await expect(runRevoke({})).rejects.toThrow('Provide a session reference or use --current');
    });

    it('--current with --json outputs JSON result', async () => {
      const mockOutputResult = vi.mocked(output.outputResult);
      await runRevoke({ current: true, json: true });
      expect(mockClient.activeSessions.revokeCurrentSession).toHaveBeenCalled();
      expect(mockOutputResult).toHaveBeenCalledWith(
        { status: 'revoked', reference: 'current' },
        { json: true },
      );
    });

    it('by ref with --json outputs JSON result', async () => {
      const mockOutputResult = vi.mocked(output.outputResult);
      await runRevoke({ ref: 'sess-ref-2', json: true });
      expect(mockClient.activeSessions.revokeSession).toHaveBeenCalledWith('sess-ref-2');
      expect(mockOutputResult).toHaveBeenCalledWith(
        { status: 'revoked', reference: 'sess-ref-2' },
        { json: true },
      );
    });
  });

  describe('status', () => {
    async function runStatus(args: Record<string, unknown> = {}) {
      return (sessionCommand.subCommands!.status as any).run!({ args });
    }

    it('throws without session ref', async () => {
      mockRequireSession.mockReturnValue({
        client: mockClient as any,
        session: { ...validSession },
      });
      await expect(runStatus({})).rejects.toThrow('No session reference');
    });

    it('fetches session status and outputs key-value', async () => {
      const mockOutputKeyValue = vi.mocked(output.outputKeyValue);
      mockClient.sessionStatus.getSessionStatus.mockResolvedValue({
        status: { code: 200, description: 'Active' },
        dateCreated: '2025-01-01',
        dateUpdated: '2025-01-02',
        validUntil: '2099-01-01',
        invoiceCount: 10,
        successfulInvoiceCount: 8,
        failedInvoiceCount: 2,
      });
      await runStatus({});
      expect(mockClient.sessionStatus.getSessionStatus).toHaveBeenCalledWith('online-ref-1');
      expect(mockOutputKeyValue).toHaveBeenCalledWith(
        expect.objectContaining({
          'Status': '200 — Active',
          'Created': '2025-01-01',
          'Invoices': 10,
          'Successful': 8,
          'Failed': 2,
        }),
        { json: false },
      );
    });

    it('outputs JSON when --json is set', async () => {
      const mockOutputResult = vi.mocked(output.outputResult);
      const statusData = {
        status: { code: 200, description: 'Active' },
        dateCreated: '2025-01-01',
        dateUpdated: '2025-01-02',
      };
      mockClient.sessionStatus.getSessionStatus.mockResolvedValue(statusData);
      await runStatus({ json: true });
      expect(mockOutputResult).toHaveBeenCalledWith(statusData, { json: true });
    });

    it('uses explicit ref over stored session ref', async () => {
      mockClient.sessionStatus.getSessionStatus.mockResolvedValue({
        status: { code: 200, description: 'Active' },
        dateCreated: '2025-01-01',
        dateUpdated: '2025-01-02',
      });
      await runStatus({ ref: 'explicit-ref' });
      expect(mockClient.sessionStatus.getSessionStatus).toHaveBeenCalledWith('explicit-ref');
    });

    it('handles N/A for missing optional fields', async () => {
      const mockOutputKeyValue = vi.mocked(output.outputKeyValue);
      mockClient.sessionStatus.getSessionStatus.mockResolvedValue({
        status: { code: 200, description: 'Active' },
        dateCreated: '2025-01-01',
        dateUpdated: '2025-01-02',
        validUntil: null,
        invoiceCount: null,
        successfulInvoiceCount: null,
        failedInvoiceCount: null,
      });
      await runStatus({});
      expect(mockOutputKeyValue).toHaveBeenCalledWith(
        expect.objectContaining({
          'Valid Until': 'N/A',
          'Invoices': 0,
          'Successful': 0,
          'Failed': 0,
        }),
        { json: false },
      );
    });
  });

  describe('list', () => {
    async function runList(args: Record<string, unknown> = {}) {
      return (sessionCommand.subCommands!.list as any).run!({ args });
    }

    it('lists sessions as table', async () => {
      const mockOutputTable = vi.mocked(output.outputTable);
      mockClient.sessionStatus.getSessions.mockResolvedValue({
        sessions: [
          {
            referenceNumber: 'ref-1',
            status: { code: 200, description: 'Active' },
            dateCreated: '2025-01-01',
            totalInvoiceCount: 5,
            successfulInvoiceCount: 4,
            failedInvoiceCount: 1,
          },
        ],
      });
      await runList({});
      expect(mockClient.sessionStatus.getSessions).toHaveBeenCalledWith('Online', undefined);
      expect(mockOutputTable).toHaveBeenCalledWith(
        [expect.objectContaining({ reference: 'ref-1', status: '200 — Active' })],
        expect.any(Array),
        { json: false },
      );
    });

    it('passes batch session type', async () => {
      mockClient.sessionStatus.getSessions.mockResolvedValue({ sessions: [] });
      await runList({ type: 'batch' });
      expect(mockClient.sessionStatus.getSessions).toHaveBeenCalledWith('Batch', undefined);
    });

    it('passes pageSize', async () => {
      mockClient.sessionStatus.getSessions.mockResolvedValue({ sessions: [] });
      await runList({ pageSize: '25' });
      expect(mockClient.sessionStatus.getSessions).toHaveBeenCalledWith('Online', 25);
    });

    it('outputs JSON when --json is set', async () => {
      const mockOutputResult = vi.mocked(output.outputResult);
      const listData = { sessions: [{ referenceNumber: 'ref-1' }] };
      mockClient.sessionStatus.getSessions.mockResolvedValue(listData);
      await runList({ json: true });
      expect(mockOutputResult).toHaveBeenCalledWith(listData, { json: true });
    });

    it('shows warning when no sessions found', async () => {
      const mockOutputWarning = vi.mocked(output.outputWarning);
      mockClient.sessionStatus.getSessions.mockResolvedValue({ sessions: [] });
      await runList({});
      expect(mockOutputWarning).toHaveBeenCalledWith('No sessions found.');
    });

    it('shows continuation token info', async () => {
      const { consola } = await import('consola');
      mockClient.sessionStatus.getSessions.mockResolvedValue({
        sessions: [{ referenceNumber: 'ref-1', status: { code: 200, description: 'Active' }, dateCreated: '2025-01-01', totalInvoiceCount: 0, successfulInvoiceCount: 0, failedInvoiceCount: 0 }],
        continuationToken: 'next-page-token',
      });
      await runList({});
      expect(consola.info).toHaveBeenCalledWith(expect.stringContaining('next-page-token'));
    });
  });

  describe('invoices', () => {
    async function runInvoices(args: Record<string, unknown> = {}) {
      return (sessionCommand.subCommands!.invoices as any).run!({ args });
    }

    it('throws without session ref', async () => {
      mockRequireSession.mockReturnValue({
        client: mockClient as any,
        session: { ...validSession },
      });
      await expect(runInvoices({})).rejects.toThrow('No session reference');
    });

    it('lists invoices as table', async () => {
      const mockOutputTable = vi.mocked(output.outputTable);
      mockClient.sessionStatus.getSessionInvoices.mockResolvedValue({
        invoices: [
          {
            ordinalNumber: 1,
            invoiceNumber: 'FV/2025/001',
            ksefNumber: 'KSeF-1',
            status: { code: 200, description: 'OK' },
            invoicingDate: '2025-01-15',
          },
        ],
      });
      await runInvoices({});
      expect(mockClient.sessionStatus.getSessionInvoices).toHaveBeenCalledWith('online-ref-1', undefined);
      expect(mockOutputTable).toHaveBeenCalledWith(
        [expect.objectContaining({ ordinal: 1, invoiceNumber: 'FV/2025/001', ksefNumber: 'KSeF-1' })],
        expect.any(Array),
        { json: false },
      );
    });

    it('passes pageSize', async () => {
      mockClient.sessionStatus.getSessionInvoices.mockResolvedValue({ invoices: [] });
      await runInvoices({ pageSize: '10' });
      expect(mockClient.sessionStatus.getSessionInvoices).toHaveBeenCalledWith('online-ref-1', 10);
    });

    it('outputs JSON when --json is set', async () => {
      const mockOutputResult = vi.mocked(output.outputResult);
      const data = { invoices: [{ ordinalNumber: 1 }] };
      mockClient.sessionStatus.getSessionInvoices.mockResolvedValue(data);
      await runInvoices({ json: true });
      expect(mockOutputResult).toHaveBeenCalledWith(data, { json: true });
    });

    it('shows warning when no invoices found', async () => {
      const mockOutputWarning = vi.mocked(output.outputWarning);
      mockClient.sessionStatus.getSessionInvoices.mockResolvedValue({ invoices: [] });
      await runInvoices({});
      expect(mockOutputWarning).toHaveBeenCalledWith('No invoices found.');
    });

    it('handles N/A for missing optional fields', async () => {
      const mockOutputTable = vi.mocked(output.outputTable);
      mockClient.sessionStatus.getSessionInvoices.mockResolvedValue({
        invoices: [
          {
            ordinalNumber: 1,
            invoiceNumber: null,
            ksefNumber: null,
            status: { code: 200, description: 'OK' },
            invoicingDate: '2025-01-15',
          },
        ],
      });
      await runInvoices({});
      expect(mockOutputTable).toHaveBeenCalledWith(
        [expect.objectContaining({ invoiceNumber: 'N/A', ksefNumber: 'N/A' })],
        expect.any(Array),
        { json: false },
      );
    });

    it('shows continuation token info', async () => {
      const { consola } = await import('consola');
      mockClient.sessionStatus.getSessionInvoices.mockResolvedValue({
        invoices: [{ ordinalNumber: 1, invoiceNumber: 'FV/1', ksefNumber: 'K-1', status: { code: 200, description: 'OK' }, invoicingDate: '2025-01-15' }],
        continuationToken: 'inv-next-token',
      });
      await runInvoices({});
      expect(consola.info).toHaveBeenCalledWith(expect.stringContaining('inv-next-token'));
    });
  });

  describe('failed', () => {
    async function runFailed(args: Record<string, unknown> = {}) {
      return (sessionCommand.subCommands!.failed as any).run!({ args });
    }

    it('throws without session ref', async () => {
      mockRequireSession.mockReturnValue({
        client: mockClient as any,
        session: { ...validSession },
      });
      await expect(runFailed({})).rejects.toThrow('No session reference');
    });

    it('lists failed invoices as table', async () => {
      const mockOutputTable = vi.mocked(output.outputTable);
      mockClient.sessionStatus.getSessionFailedInvoices.mockResolvedValue({
        invoices: [
          {
            ordinalNumber: 1,
            invoiceNumber: 'FV/2025/002',
            status: { code: 400, description: 'Validation Error', details: ['field X missing', 'bad format'] },
            invoicingDate: '2025-01-16',
          },
        ],
      });
      await runFailed({});
      expect(mockClient.sessionStatus.getSessionFailedInvoices).toHaveBeenCalledWith('online-ref-1', undefined);
      expect(mockOutputTable).toHaveBeenCalledWith(
        [expect.objectContaining({ ordinal: 1, invoiceNumber: 'FV/2025/002', details: 'field X missing; bad format' })],
        expect.any(Array),
        { json: false },
      );
    });

    it('passes pageSize', async () => {
      mockClient.sessionStatus.getSessionFailedInvoices.mockResolvedValue({ invoices: [] });
      await runFailed({ pageSize: '5' });
      expect(mockClient.sessionStatus.getSessionFailedInvoices).toHaveBeenCalledWith('online-ref-1', 5);
    });

    it('outputs JSON when --json is set', async () => {
      const mockOutputResult = vi.mocked(output.outputResult);
      const data = { invoices: [{ ordinalNumber: 1 }] };
      mockClient.sessionStatus.getSessionFailedInvoices.mockResolvedValue(data);
      await runFailed({ json: true });
      expect(mockOutputResult).toHaveBeenCalledWith(data, { json: true });
    });

    it('shows success message when no failed invoices', async () => {
      mockClient.sessionStatus.getSessionFailedInvoices.mockResolvedValue({ invoices: [] });
      await runFailed({});
      expect(mockOutputSuccess).toHaveBeenCalledWith('No failed invoices.');
    });

    it('handles N/A for missing invoiceNumber and empty details', async () => {
      const mockOutputTable = vi.mocked(output.outputTable);
      mockClient.sessionStatus.getSessionFailedInvoices.mockResolvedValue({
        invoices: [
          {
            ordinalNumber: 2,
            invoiceNumber: null,
            status: { code: 400, description: 'Error' },
            invoicingDate: '2025-01-17',
          },
        ],
      });
      await runFailed({});
      expect(mockOutputTable).toHaveBeenCalledWith(
        [expect.objectContaining({ invoiceNumber: 'N/A', details: '' })],
        expect.any(Array),
        { json: false },
      );
    });

    it('shows continuation token info', async () => {
      const { consola } = await import('consola');
      mockClient.sessionStatus.getSessionFailedInvoices.mockResolvedValue({
        invoices: [{ ordinalNumber: 1, invoiceNumber: 'FV/1', status: { code: 400, description: 'Err' }, invoicingDate: '2025-01-15' }],
        continuationToken: 'failed-next-token',
      });
      await runFailed({});
      expect(consola.info).toHaveBeenCalledWith(expect.stringContaining('failed-next-token'));
    });
  });

  describe('active', () => {
    async function runActive(args: Record<string, unknown> = {}) {
      return (sessionCommand.subCommands!.active as any).run!({ args });
    }

    it('lists active sessions as table', async () => {
      const mockOutputTable = vi.mocked(output.outputTable);
      mockClient.activeSessions.getActiveSessions.mockResolvedValue({
        items: [
          {
            referenceNumber: 'active-ref-1',
            startDate: '2025-01-01',
            authenticationMethodInfo: { category: 'Token' },
            status: { code: 200, description: 'Active' },
            isCurrent: true,
          },
        ],
      });
      await runActive({});
      expect(mockClient.activeSessions.getActiveSessions).toHaveBeenCalledWith(undefined);
      expect(mockOutputTable).toHaveBeenCalledWith(
        [expect.objectContaining({
          reference: 'active-ref-1',
          authMethod: 'Token',
          isCurrent: 'Yes',
        })],
        expect.any(Array),
        { json: false },
      );
    });

    it('passes pageSize', async () => {
      mockClient.activeSessions.getActiveSessions.mockResolvedValue({ items: [] });
      await runActive({ pageSize: '50' });
      expect(mockClient.activeSessions.getActiveSessions).toHaveBeenCalledWith(50);
    });

    it('outputs JSON when --json is set', async () => {
      const mockOutputResult = vi.mocked(output.outputResult);
      const data = { items: [{ referenceNumber: 'ref-1' }] };
      mockClient.activeSessions.getActiveSessions.mockResolvedValue(data);
      await runActive({ json: true });
      expect(mockOutputResult).toHaveBeenCalledWith(data, { json: true });
    });

    it('shows warning when no active sessions found', async () => {
      const mockOutputWarning = vi.mocked(output.outputWarning);
      mockClient.activeSessions.getActiveSessions.mockResolvedValue({ items: [] });
      await runActive({});
      expect(mockOutputWarning).toHaveBeenCalledWith('No active sessions found.');
    });

    it('handles N/A for missing authenticationMethodInfo', async () => {
      const mockOutputTable = vi.mocked(output.outputTable);
      mockClient.activeSessions.getActiveSessions.mockResolvedValue({
        items: [
          {
            referenceNumber: 'active-ref-2',
            startDate: '2025-01-01',
            authenticationMethodInfo: null,
            status: { code: 200, description: 'Active' },
            isCurrent: false,
          },
        ],
      });
      await runActive({});
      expect(mockOutputTable).toHaveBeenCalledWith(
        [expect.objectContaining({ authMethod: 'N/A', isCurrent: 'No' })],
        expect.any(Array),
        { json: false },
      );
    });

    it('shows continuation token info', async () => {
      const { consola } = await import('consola');
      mockClient.activeSessions.getActiveSessions.mockResolvedValue({
        items: [{ referenceNumber: 'ref-1', startDate: '2025-01-01', status: { code: 200, description: 'Active' }, isCurrent: false }],
        continuationToken: 'active-next-token',
      });
      await runActive({});
      expect(consola.info).toHaveBeenCalledWith(expect.stringContaining('active-next-token'));
    });
  });

  describe('invoice', () => {
    async function runInvoice(args: Record<string, unknown> = {}) {
      return (sessionCommand.subCommands!.invoice as any).run!({ args });
    }

    it('throws without session ref', async () => {
      mockRequireSession.mockReturnValue({
        client: mockClient as any,
        session: { ...validSession },
      });
      await expect(runInvoice({ invoiceRef: 'inv-1' })).rejects.toThrow('No session reference');
    });

    it('fetches invoice status and outputs key-value', async () => {
      const mockOutputKeyValue = vi.mocked(output.outputKeyValue);
      mockClient.sessionStatus.getSessionInvoice.mockResolvedValue({
        ordinalNumber: 1,
        invoiceNumber: 'FV/2025/001',
        ksefNumber: 'KSeF-123',
        referenceNumber: 'inv-ref-1',
        invoiceHash: 'abc123',
        status: { code: 200, description: 'OK' },
        invoicingDate: '2025-01-15',
        invoicingMode: 'Online',
      });
      await runInvoice({ invoiceRef: 'inv-ref-1' });
      expect(mockClient.sessionStatus.getSessionInvoice).toHaveBeenCalledWith('online-ref-1', 'inv-ref-1');
      expect(mockOutputKeyValue).toHaveBeenCalledWith(
        expect.objectContaining({
          'Invoice Number': 'FV/2025/001',
          'KSeF Number': 'KSeF-123',
          'Status': '200 — OK',
        }),
        { json: false },
      );
    });

    it('outputs JSON when --json is set', async () => {
      const mockOutputResult = vi.mocked(output.outputResult);
      const invoiceData = {
        ordinalNumber: 1,
        invoiceNumber: 'FV/2025/001',
        ksefNumber: 'KSeF-123',
        referenceNumber: 'inv-ref-1',
        invoiceHash: 'abc123',
        status: { code: 200, description: 'OK' },
        invoicingDate: '2025-01-15',
        invoicingMode: 'Online',
      };
      mockClient.sessionStatus.getSessionInvoice.mockResolvedValue(invoiceData);
      await runInvoice({ invoiceRef: 'inv-ref-1', json: true });
      expect(mockOutputResult).toHaveBeenCalledWith(invoiceData, { json: true });
    });

    it('uses explicit --ref over stored session ref', async () => {
      mockClient.sessionStatus.getSessionInvoice.mockResolvedValue({
        ordinalNumber: 1,
        status: { code: 200, description: 'OK' },
        invoicingDate: '2025-01-15',
        referenceNumber: 'inv-ref-2',
        invoiceHash: 'hash',
      });
      await runInvoice({ invoiceRef: 'inv-ref-2', ref: 'explicit-session-ref' });
      expect(mockClient.sessionStatus.getSessionInvoice).toHaveBeenCalledWith('explicit-session-ref', 'inv-ref-2');
    });

    it('handles N/A for missing optional fields', async () => {
      const mockOutputKeyValue = vi.mocked(output.outputKeyValue);
      mockClient.sessionStatus.getSessionInvoice.mockResolvedValue({
        ordinalNumber: 1,
        invoiceNumber: null,
        ksefNumber: null,
        referenceNumber: 'inv-ref-3',
        invoiceHash: 'hash',
        status: { code: 200, description: 'OK' },
        invoicingDate: '2025-01-15',
        invoicingMode: null,
      });
      await runInvoice({ invoiceRef: 'inv-ref-3' });
      expect(mockOutputKeyValue).toHaveBeenCalledWith(
        expect.objectContaining({
          'Invoice Number': 'N/A',
          'KSeF Number': 'N/A',
          'Invoicing Mode': 'N/A',
        }),
        { json: false },
      );
    });
  });
});
