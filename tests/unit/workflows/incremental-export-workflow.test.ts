import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ContinuationPoints } from '../../../src/workflows/hwm-coordinator.js';
import type { ExportResult } from '../../../src/workflows/types.js';
import type { HwmStore } from '../../../src/workflows/hwm-storage.js';

// Mock doExport before importing the module under test
vi.mock('../../../src/workflows/invoice-export-workflow.js', () => ({
  doExport: vi.fn(),
}));

import { doExport } from '../../../src/workflows/invoice-export-workflow.js';
import { incrementalExportAndDownload } from '../../../src/workflows/incremental-export-workflow.js';

const mockDoExport = vi.mocked(doExport);

function createMockClient() {
  return {
    crypto: {
      init: vi.fn(),
      getEncryptionData: vi.fn().mockReturnValue({
        encryptionInfo: { encryptedSymmetricKey: 'enc-key', initializationVector: 'iv' },
        cipherKey: new Uint8Array(32),
        cipherIv: new Uint8Array(16),
      }),
      decryptAES256: vi.fn().mockReturnValue(new Uint8Array([0x50, 0x4b])),
    },
  } as any;
}

const mockTransport = vi.fn().mockImplementation(async () =>
  new Response(new Uint8Array([99, 99]).buffer, { status: 200 }),
);

function mockExportResult(overrides: Partial<ExportResult> & { referenceNumber?: string } = {}) {
  return {
    referenceNumber: overrides.referenceNumber ?? 'ref-1',
    encData: {
      encryptionInfo: { encryptedSymmetricKey: 'k', initializationVector: 'iv' },
      cipherKey: new Uint8Array(32),
      cipherIv: new Uint8Array(16),
    },
    result: {
      parts: overrides.parts ?? [
        {
          ordinalNumber: 1,
          url: 'https://dl.example.com/1',
          method: 'GET',
          partSize: 100,
          encryptedPartSize: 110,
          encryptedPartHash: 'h1',
          expirationDate: '2026-12-31',
        },
      ],
      invoiceCount: overrides.invoiceCount ?? 5,
      isTruncated: overrides.isTruncated ?? false,
      permanentStorageHwmDate: overrides.permanentStorageHwmDate,
      lastPermanentStorageDate: overrides.lastPermanentStorageDate,
    },
  };
}

let client: ReturnType<typeof createMockClient>;

beforeEach(() => {
  vi.restoreAllMocks();
  mockDoExport.mockReset();
  mockTransport.mockReset();
  client = createMockClient();
  mockTransport.mockImplementation(async () =>
    new Response(new Uint8Array([99, 99]).buffer, { status: 200 }),
  );
});

describe('incrementalExportAndDownload', () => {
  describe('single iteration (non-truncated)', () => {
    it('completes in 1 iteration when isTruncated is false', async () => {
      mockDoExport.mockResolvedValueOnce(mockExportResult({ isTruncated: false }));

      const result = await incrementalExportAndDownload(client, {
        subjectType: 'Subject1',
        windowFrom: '2026-01-01',
        windowTo: '2026-03-01',
        continuationPoints: {},
        pollOptions: { intervalMs: 1 },
        transport: mockTransport,
      });

      expect(result.iterationCount).toBe(1);
      expect(result.referenceNumbers).toEqual(['ref-1']);
      expect(result.decryptedParts).toHaveLength(1);
      expect(mockDoExport).toHaveBeenCalledTimes(1);
    });

    it('returns decrypted parts from the single export', async () => {
      mockDoExport.mockResolvedValueOnce(mockExportResult({ isTruncated: false }));

      const result = await incrementalExportAndDownload(client, {
        subjectType: 'Subject1',
        windowFrom: '2026-01-01',
        windowTo: '2026-03-01',
        continuationPoints: {},
        pollOptions: { intervalMs: 1 },
        transport: mockTransport,
      });

      expect(result.decryptedParts[0]).toEqual(new Uint8Array([0x50, 0x4b]));
      expect(client.crypto.decryptAES256).toHaveBeenCalledTimes(1);
      expect(mockTransport).toHaveBeenCalledWith('https://dl.example.com/1', { method: 'GET' });
    });
  });

  describe('multiple iterations with HWM advancement', () => {
    it('continues when isTruncated is true and stops when false', async () => {
      mockDoExport
        .mockResolvedValueOnce(
          mockExportResult({
            referenceNumber: 'ref-iter-1',
            isTruncated: true,
            lastPermanentStorageDate: '2026-02-01',
          }),
        )
        .mockResolvedValueOnce(
          mockExportResult({
            referenceNumber: 'ref-iter-2',
            isTruncated: false,
            permanentStorageHwmDate: '2026-03-01',
          }),
        );

      const result = await incrementalExportAndDownload(client, {
        subjectType: 'Subject1',
        windowFrom: '2026-01-01',
        windowTo: '2026-03-01',
        continuationPoints: {},
        pollOptions: { intervalMs: 1 },
        transport: mockTransport,
      });

      expect(result.iterationCount).toBe(2);
      expect(result.referenceNumbers).toEqual(['ref-iter-1', 'ref-iter-2']);
      expect(result.decryptedParts).toHaveLength(2);
      expect(mockDoExport).toHaveBeenCalledTimes(2);
    });

    it('uses lastPermanentStorageDate as effectiveFrom for the next iteration', async () => {
      mockDoExport
        .mockResolvedValueOnce(
          mockExportResult({
            isTruncated: true,
            lastPermanentStorageDate: '2026-02-15T10:00:00Z',
          }),
        )
        .mockResolvedValueOnce(
          mockExportResult({ isTruncated: false }),
        );

      await incrementalExportAndDownload(client, {
        subjectType: 'Subject1',
        windowFrom: '2026-01-01',
        windowTo: '2026-03-01',
        continuationPoints: {},
        pollOptions: { intervalMs: 1 },
        transport: mockTransport,
      });

      // First call uses windowFrom
      const firstCallFilters = mockDoExport.mock.calls[0][1];
      expect(firstCallFilters.dateRange?.from).toBe('2026-01-01');

      // Second call uses lastPermanentStorageDate as the new start
      const secondCallFilters = mockDoExport.mock.calls[1][1];
      expect(secondCallFilters.dateRange?.from).toBe('2026-02-15T10:00:00Z');
    });
  });

  describe('termination - stall detection', () => {
    it('stops when effectiveFrom does not advance between iterations', async () => {
      // First call: isTruncated=true but no lastPermanentStorageDate and no permanentStorageHwmDate
      // updateContinuationPoint will delete the entry, so getEffectiveStartDate returns windowFrom again
      mockDoExport
        .mockResolvedValueOnce(
          mockExportResult({
            referenceNumber: 'ref-stall-1',
            isTruncated: true,
            // No lastPermanentStorageDate, no permanentStorageHwmDate
          }),
        )
        .mockResolvedValueOnce(
          mockExportResult({
            referenceNumber: 'ref-stall-2',
            isTruncated: false,
          }),
        );

      const result = await incrementalExportAndDownload(client, {
        subjectType: 'Subject1',
        windowFrom: '2026-01-01',
        windowTo: '2026-03-01',
        continuationPoints: {},
        pollOptions: { intervalMs: 1 },
        transport: mockTransport,
      });

      // First iteration runs, second detects stall (effectiveFrom === previousFrom === windowFrom)
      expect(mockDoExport).toHaveBeenCalledTimes(1);
      expect(result.iterationCount).toBe(1);
      expect(result.referenceNumbers).toEqual(['ref-stall-1']);
    });

    it('detects stall when permanentStorageHwmDate matches existing continuation point', async () => {
      // If the export returns permanentStorageHwmDate equal to the current window,
      // the continuation point won't change and the next iteration will see the same effectiveFrom
      mockDoExport
        .mockResolvedValueOnce(
          mockExportResult({
            referenceNumber: 'ref-s1',
            isTruncated: true,
            lastPermanentStorageDate: '2026-02-01',
          }),
        )
        .mockResolvedValueOnce(
          mockExportResult({
            referenceNumber: 'ref-s2',
            isTruncated: true,
            // This time truncated but no lastPermanentStorageDate
            // permanentStorageHwmDate present keeps it at 2026-02-01
            permanentStorageHwmDate: '2026-02-01',
          }),
        )
        .mockResolvedValueOnce(
          mockExportResult({
            referenceNumber: 'ref-should-not-run',
            isTruncated: false,
          }),
        );

      const result = await incrementalExportAndDownload(client, {
        subjectType: 'Subject1',
        windowFrom: '2026-01-01',
        windowTo: '2026-03-01',
        continuationPoints: {},
        pollOptions: { intervalMs: 1 },
        transport: mockTransport,
      });

      // iteration 0: effectiveFrom=2026-01-01 -> sets points to 2026-02-01
      // iteration 1: effectiveFrom=2026-02-01 -> updateContinuationPoint (truncated, no lastPermanent -> falls through to permanentStorageHwmDate=2026-02-01)
      // iteration 2: effectiveFrom=2026-02-01 === previousFrom=2026-02-01 -> stall, break
      expect(mockDoExport).toHaveBeenCalledTimes(2);
      expect(result.iterationCount).toBe(2);
      expect(result.referenceNumbers).toEqual(['ref-s1', 'ref-s2']);
    });
  });

  describe('termination - max iterations', () => {
    it('stops after maxIterations even if still truncated', async () => {
      mockDoExport
        .mockResolvedValueOnce(
          mockExportResult({
            referenceNumber: 'ref-max-1',
            isTruncated: true,
            lastPermanentStorageDate: '2026-02-01',
          }),
        )
        .mockResolvedValueOnce(
          mockExportResult({
            referenceNumber: 'ref-max-2',
            isTruncated: true,
            lastPermanentStorageDate: '2026-02-15',
          }),
        )
        .mockResolvedValueOnce(
          mockExportResult({
            referenceNumber: 'ref-should-not-run',
            isTruncated: false,
          }),
        );

      const result = await incrementalExportAndDownload(client, {
        subjectType: 'Subject1',
        windowFrom: '2026-01-01',
        windowTo: '2026-03-01',
        continuationPoints: {},
        maxIterations: 2,
        pollOptions: { intervalMs: 1 },
        transport: mockTransport,
      });

      expect(mockDoExport).toHaveBeenCalledTimes(2);
      expect(result.iterationCount).toBe(2);
      expect(result.referenceNumbers).toEqual(['ref-max-1', 'ref-max-2']);
    });

    it('defaults maxIterations to 20', async () => {
      // We won't run 20 iterations; just verify it doesn't stop prematurely at e.g. 10
      const mocks: ReturnType<typeof mockExportResult>[] = [];
      for (let i = 0; i < 15; i++) {
        mocks.push(
          mockExportResult({
            referenceNumber: `ref-${i}`,
            isTruncated: true,
            lastPermanentStorageDate: `2026-01-${String(i + 2).padStart(2, '0')}`,
          }),
        );
      }
      // 16th iteration returns non-truncated
      mocks.push(mockExportResult({ referenceNumber: 'ref-final', isTruncated: false }));

      for (const m of mocks) {
        mockDoExport.mockResolvedValueOnce(m);
      }

      const result = await incrementalExportAndDownload(client, {
        subjectType: 'Subject1',
        windowFrom: '2026-01-01',
        windowTo: '2026-12-31',
        continuationPoints: {},
        pollOptions: { intervalMs: 1 },
        transport: mockTransport,
      });

      expect(result.iterationCount).toBe(16);
      expect(mockDoExport).toHaveBeenCalledTimes(16);
    });
  });

  describe('custom filtersFactory', () => {
    it('calls filtersFactory with effectiveFrom and windowTo', async () => {
      const filtersFactory = vi.fn().mockReturnValue({
        subjectType: 'Subject1' as const,
        dateRange: { dateType: 'Invoicing' as const, from: '2026-01-01', to: '2026-03-01' },
        ksefNumber: 'KSEF-CUSTOM',
      });

      mockDoExport.mockResolvedValueOnce(mockExportResult({ isTruncated: false }));

      await incrementalExportAndDownload(client, {
        subjectType: 'Subject1',
        windowFrom: '2026-01-01',
        windowTo: '2026-03-01',
        continuationPoints: {},
        filtersFactory,
        pollOptions: { intervalMs: 1 },
        transport: mockTransport,
      });

      expect(filtersFactory).toHaveBeenCalledWith('2026-01-01', '2026-03-01');
    });

    it('passes custom filters to doExport', async () => {
      const customFilters = {
        subjectType: 'Subject2' as const,
        dateRange: { dateType: 'Issue' as const, from: 'custom-from', to: 'custom-to' },
      };
      const filtersFactory = vi.fn().mockReturnValue(customFilters);

      mockDoExport.mockResolvedValueOnce(mockExportResult({ isTruncated: false }));

      await incrementalExportAndDownload(client, {
        subjectType: 'Subject1',
        windowFrom: '2026-01-01',
        windowTo: '2026-03-01',
        continuationPoints: {},
        filtersFactory,
        pollOptions: { intervalMs: 1 },
        transport: mockTransport,
      });

      expect(mockDoExport).toHaveBeenCalledWith(
        client,
        customFilters,
        expect.any(Object),
      );
    });

    it('calls filtersFactory with advancing dates across iterations', async () => {
      const filtersFactory = vi.fn().mockImplementation((from: string, to: string) => ({
        subjectType: 'Subject1' as const,
        dateRange: { dateType: 'PermanentStorage' as const, from, to },
      }));

      mockDoExport
        .mockResolvedValueOnce(
          mockExportResult({
            isTruncated: true,
            lastPermanentStorageDate: '2026-02-01',
          }),
        )
        .mockResolvedValueOnce(
          mockExportResult({ isTruncated: false }),
        );

      await incrementalExportAndDownload(client, {
        subjectType: 'Subject1',
        windowFrom: '2026-01-01',
        windowTo: '2026-03-01',
        continuationPoints: {},
        filtersFactory,
        pollOptions: { intervalMs: 1 },
        transport: mockTransport,
      });

      expect(filtersFactory).toHaveBeenCalledTimes(2);
      expect(filtersFactory).toHaveBeenNthCalledWith(1, '2026-01-01', '2026-03-01');
      expect(filtersFactory).toHaveBeenNthCalledWith(2, '2026-02-01', '2026-03-01');
    });
  });

  describe('default filters', () => {
    it('builds default filters with subjectType and PermanentStorage dateType', async () => {
      mockDoExport.mockResolvedValueOnce(mockExportResult({ isTruncated: false }));

      await incrementalExportAndDownload(client, {
        subjectType: 'Subject1',
        windowFrom: '2026-01-01',
        windowTo: '2026-03-01',
        continuationPoints: {},
        pollOptions: { intervalMs: 1 },
        transport: mockTransport,
      });

      expect(mockDoExport).toHaveBeenCalledWith(
        client,
        {
          subjectType: 'Subject1',
          dateRange: {
            dateType: 'PermanentStorage',
            from: '2026-01-01',
            to: '2026-03-01',
          },
        },
        expect.any(Object),
      );
    });

    it('uses different subjectType in default filters', async () => {
      mockDoExport.mockResolvedValueOnce(mockExportResult({ isTruncated: false }));

      await incrementalExportAndDownload(client, {
        subjectType: 'SubjectAuthorized',
        windowFrom: '2026-06-01',
        windowTo: '2026-09-30',
        continuationPoints: {},
        pollOptions: { intervalMs: 1 },
        transport: mockTransport,
      });

      expect(mockDoExport).toHaveBeenCalledWith(
        client,
        {
          subjectType: 'SubjectAuthorized',
          dateRange: {
            dateType: 'PermanentStorage',
            from: '2026-06-01',
            to: '2026-09-30',
          },
        },
        expect.any(Object),
      );
    });
  });

  describe('consolidated results', () => {
    it('accumulates decryptedParts and referenceNumbers across iterations', async () => {
      mockDoExport
        .mockResolvedValueOnce(
          mockExportResult({
            referenceNumber: 'ref-a',
            isTruncated: true,
            lastPermanentStorageDate: '2026-02-01',
            parts: [
              {
                ordinalNumber: 1,
                url: 'https://dl.example.com/a1',
                method: 'GET',
                partSize: 100,
                encryptedPartSize: 110,
                encryptedPartHash: 'ha1',
                expirationDate: '2026-12-31',
              },
            ],
          }),
        )
        .mockResolvedValueOnce(
          mockExportResult({
            referenceNumber: 'ref-b',
            isTruncated: false,
            parts: [
              {
                ordinalNumber: 1,
                url: 'https://dl.example.com/b1',
                method: 'GET',
                partSize: 200,
                encryptedPartSize: 210,
                encryptedPartHash: 'hb1',
                expirationDate: '2026-12-31',
              },
            ],
          }),
        );

      const result = await incrementalExportAndDownload(client, {
        subjectType: 'Subject1',
        windowFrom: '2026-01-01',
        windowTo: '2026-03-01',
        continuationPoints: {},
        pollOptions: { intervalMs: 1 },
        transport: mockTransport,
      });

      expect(result.referenceNumbers).toEqual(['ref-a', 'ref-b']);
      expect(result.decryptedParts).toHaveLength(2);
      expect(mockTransport).toHaveBeenCalledTimes(2);
      expect(mockTransport).toHaveBeenCalledWith('https://dl.example.com/a1', { method: 'GET' });
      expect(mockTransport).toHaveBeenCalledWith('https://dl.example.com/b1', { method: 'GET' });
    });

    it('handles multiple parts per iteration', async () => {
      mockDoExport.mockResolvedValueOnce(
        mockExportResult({
          referenceNumber: 'ref-multi',
          isTruncated: false,
          parts: [
            {
              ordinalNumber: 1,
              url: 'https://dl.example.com/p1',
              method: 'GET',
              partSize: 100,
              encryptedPartSize: 110,
              encryptedPartHash: 'h1',
              expirationDate: '2026-12-31',
            },
            {
              ordinalNumber: 2,
              url: 'https://dl.example.com/p2',
              method: 'GET',
              partSize: 200,
              encryptedPartSize: 210,
              encryptedPartHash: 'h2',
              expirationDate: '2026-12-31',
            },
            {
              ordinalNumber: 3,
              url: 'https://dl.example.com/p3',
              method: 'GET',
              partSize: 300,
              encryptedPartSize: 310,
              encryptedPartHash: 'h3',
              expirationDate: '2026-12-31',
            },
          ],
        }),
      );

      const result = await incrementalExportAndDownload(client, {
        subjectType: 'Subject1',
        windowFrom: '2026-01-01',
        windowTo: '2026-03-01',
        continuationPoints: {},
        pollOptions: { intervalMs: 1 },
        transport: mockTransport,
      });

      expect(result.decryptedParts).toHaveLength(3);
      expect(result.referenceNumbers).toEqual(['ref-multi']);
      expect(mockTransport).toHaveBeenCalledTimes(3);
      expect(client.crypto.decryptAES256).toHaveBeenCalledTimes(3);
    });
  });

  describe('HwmStore integration', () => {
    it('calls store.load() once on startup', async () => {
      const store: HwmStore = {
        load: vi.fn().mockResolvedValue({}),
        save: vi.fn(),
      };

      mockDoExport.mockResolvedValueOnce(mockExportResult({ isTruncated: false }));

      await incrementalExportAndDownload(client, {
        subjectType: 'Subject1',
        windowFrom: '2026-01-01',
        windowTo: '2026-03-01',
        continuationPoints: {},
        store,
        pollOptions: { intervalMs: 1 },
        transport: mockTransport,
      });

      expect(store.load).toHaveBeenCalledTimes(1);
    });

    it('calls store.save() after each iteration', async () => {
      const store: HwmStore = {
        load: vi.fn().mockResolvedValue({}),
        save: vi.fn(),
      };

      mockDoExport
        .mockResolvedValueOnce(
          mockExportResult({
            isTruncated: true,
            lastPermanentStorageDate: '2026-02-01',
          }),
        )
        .mockResolvedValueOnce(
          mockExportResult({ isTruncated: false }),
        );

      await incrementalExportAndDownload(client, {
        subjectType: 'Subject1',
        windowFrom: '2026-01-01',
        windowTo: '2026-03-01',
        continuationPoints: {},
        store,
        pollOptions: { intervalMs: 1 },
        transport: mockTransport,
      });

      expect(store.save).toHaveBeenCalledTimes(2);
    });

    it('merges loaded points into continuationPoints (only fills undefined keys)', async () => {
      const store: HwmStore = {
        load: vi.fn().mockResolvedValue({
          Subject1: '2026-01-15',
          Subject2: '2026-01-20',
        }),
        save: vi.fn(),
      };

      mockDoExport.mockResolvedValueOnce(mockExportResult({ isTruncated: false }));

      const points: ContinuationPoints = { Subject1: '2026-01-10' };

      await incrementalExportAndDownload(client, {
        subjectType: 'Subject1',
        windowFrom: '2026-01-01',
        windowTo: '2026-03-01',
        continuationPoints: points,
        store,
        pollOptions: { intervalMs: 1 },
        transport: mockTransport,
      });

      // Subject1 already had a value, so store value should NOT overwrite it
      // Subject2 was undefined in points, so store value should fill it in
      // Check by verifying the first doExport call used the pre-existing Subject1 value
      const filters = mockDoExport.mock.calls[0][1];
      expect(filters.dateRange?.from).toBe('2026-01-10');
      // Also verify Subject2 was loaded
      expect(points['Subject2']).toBe('2026-01-20');
    });

    it('does not call store methods when store is not provided', async () => {
      mockDoExport.mockResolvedValueOnce(mockExportResult({ isTruncated: false }));

      // No store provided — should not throw
      const result = await incrementalExportAndDownload(client, {
        subjectType: 'Subject1',
        windowFrom: '2026-01-01',
        windowTo: '2026-03-01',
        continuationPoints: {},
        pollOptions: { intervalMs: 1 },
        transport: mockTransport,
      });

      expect(result.iterationCount).toBe(1);
    });
  });

  describe('onIterationComplete callback', () => {
    it('calls callback after each iteration with correct arguments', async () => {
      const onIterationComplete = vi.fn();

      mockDoExport
        .mockResolvedValueOnce(
          mockExportResult({
            referenceNumber: 'ref-cb-1',
            isTruncated: true,
            lastPermanentStorageDate: '2026-02-01',
            invoiceCount: 10,
          }),
        )
        .mockResolvedValueOnce(
          mockExportResult({
            referenceNumber: 'ref-cb-2',
            isTruncated: false,
            invoiceCount: 3,
          }),
        );

      await incrementalExportAndDownload(client, {
        subjectType: 'Subject1',
        windowFrom: '2026-01-01',
        windowTo: '2026-03-01',
        continuationPoints: {},
        onIterationComplete,
        pollOptions: { intervalMs: 1 },
        transport: mockTransport,
      });

      expect(onIterationComplete).toHaveBeenCalledTimes(2);
      expect(onIterationComplete).toHaveBeenNthCalledWith(1, 0, expect.objectContaining({ invoiceCount: 10 }));
      expect(onIterationComplete).toHaveBeenNthCalledWith(2, 1, expect.objectContaining({ invoiceCount: 3 }));
    });

    it('is not called when not provided', async () => {
      mockDoExport.mockResolvedValueOnce(mockExportResult({ isTruncated: false }));

      // Should not throw even without callback
      const result = await incrementalExportAndDownload(client, {
        subjectType: 'Subject1',
        windowFrom: '2026-01-01',
        windowTo: '2026-03-01',
        continuationPoints: {},
        pollOptions: { intervalMs: 1 },
        transport: mockTransport,
      });

      expect(result.iterationCount).toBe(1);
    });

    it('receives the ExportResult object for each iteration', async () => {
      const onIterationComplete = vi.fn();

      mockDoExport.mockResolvedValueOnce(
        mockExportResult({
          isTruncated: false,
          invoiceCount: 42,
          permanentStorageHwmDate: '2026-03-01',
        }),
      );

      await incrementalExportAndDownload(client, {
        subjectType: 'Subject1',
        windowFrom: '2026-01-01',
        windowTo: '2026-03-01',
        continuationPoints: {},
        onIterationComplete,
        pollOptions: { intervalMs: 1 },
        transport: mockTransport,
      });

      const receivedResult = onIterationComplete.mock.calls[0][1] as ExportResult;
      expect(receivedResult.invoiceCount).toBe(42);
      expect(receivedResult.isTruncated).toBe(false);
      expect(receivedResult.permanentStorageHwmDate).toBe('2026-03-01');
      expect(receivedResult.parts).toHaveLength(1);
    });
  });

  describe('pollOptions and onlyMetadata forwarding', () => {
    it('forwards pollOptions to doExport', async () => {
      const pollOptions = { intervalMs: 500, maxAttempts: 10 };

      mockDoExport.mockResolvedValueOnce(mockExportResult({ isTruncated: false }));

      await incrementalExportAndDownload(client, {
        subjectType: 'Subject1',
        windowFrom: '2026-01-01',
        windowTo: '2026-03-01',
        continuationPoints: {},
        pollOptions,
        transport: mockTransport,
      });

      expect(mockDoExport).toHaveBeenCalledWith(
        client,
        expect.any(Object),
        expect.objectContaining({ pollOptions }),
      );
    });

    it('forwards onlyMetadata to doExport', async () => {
      mockDoExport.mockResolvedValueOnce(mockExportResult({ isTruncated: false }));

      await incrementalExportAndDownload(client, {
        subjectType: 'Subject1',
        windowFrom: '2026-01-01',
        windowTo: '2026-03-01',
        continuationPoints: {},
        onlyMetadata: true,
        pollOptions: { intervalMs: 1 },
        transport: mockTransport,
      });

      expect(mockDoExport).toHaveBeenCalledWith(
        client,
        expect.any(Object),
        expect.objectContaining({ onlyMetadata: true }),
      );
    });

    it('forwards both pollOptions and onlyMetadata together', async () => {
      const pollOptions = { intervalMs: 200, maxAttempts: 5 };

      mockDoExport.mockResolvedValueOnce(mockExportResult({ isTruncated: false }));

      await incrementalExportAndDownload(client, {
        subjectType: 'Subject1',
        windowFrom: '2026-01-01',
        windowTo: '2026-03-01',
        continuationPoints: {},
        onlyMetadata: true,
        pollOptions,
        transport: mockTransport,
      });

      expect(mockDoExport).toHaveBeenCalledWith(
        client,
        expect.any(Object),
        { onlyMetadata: true, pollOptions },
      );
    });
  });

  describe('continuation points mutation', () => {
    it('returns the same continuationPoints object reference as input', async () => {
      mockDoExport.mockResolvedValueOnce(mockExportResult({ isTruncated: false }));

      const points: ContinuationPoints = {};

      const result = await incrementalExportAndDownload(client, {
        subjectType: 'Subject1',
        windowFrom: '2026-01-01',
        windowTo: '2026-03-01',
        continuationPoints: points,
        pollOptions: { intervalMs: 1 },
        transport: mockTransport,
      });

      expect(result.continuationPoints).toBe(points);
    });

    it('mutates continuationPoints in-place during iteration', async () => {
      mockDoExport
        .mockResolvedValueOnce(
          mockExportResult({
            isTruncated: true,
            lastPermanentStorageDate: '2026-02-01',
          }),
        )
        .mockResolvedValueOnce(
          mockExportResult({
            isTruncated: false,
            permanentStorageHwmDate: '2026-03-01',
          }),
        );

      const points: ContinuationPoints = {};

      const result = await incrementalExportAndDownload(client, {
        subjectType: 'Subject1',
        windowFrom: '2026-01-01',
        windowTo: '2026-03-01',
        continuationPoints: points,
        pollOptions: { intervalMs: 1 },
        transport: mockTransport,
      });

      // After two iterations: first sets lastPermanentStorageDate, second sets permanentStorageHwmDate
      expect(points['Subject1']).toBe('2026-03-01');
      expect(result.continuationPoints['Subject1']).toBe('2026-03-01');
      expect(result.continuationPoints).toBe(points);
    });

    it('deletes continuation point key when no HWM dates are present', async () => {
      mockDoExport.mockResolvedValueOnce(
        mockExportResult({
          isTruncated: false,
          // No permanentStorageHwmDate, no lastPermanentStorageDate
        }),
      );

      const points: ContinuationPoints = { Subject1: '2026-01-15' };

      await incrementalExportAndDownload(client, {
        subjectType: 'Subject1',
        windowFrom: '2026-01-01',
        windowTo: '2026-03-01',
        continuationPoints: points,
        pollOptions: { intervalMs: 1 },
        transport: mockTransport,
      });

      expect(points).not.toHaveProperty('Subject1');
    });
  });

  describe('crypto.init called once', () => {
    it('calls crypto.init exactly once even across multiple iterations', async () => {
      mockDoExport
        .mockResolvedValueOnce(
          mockExportResult({
            isTruncated: true,
            lastPermanentStorageDate: '2026-02-01',
          }),
        )
        .mockResolvedValueOnce(
          mockExportResult({
            isTruncated: true,
            lastPermanentStorageDate: '2026-02-15',
          }),
        )
        .mockResolvedValueOnce(
          mockExportResult({ isTruncated: false }),
        );

      await incrementalExportAndDownload(client, {
        subjectType: 'Subject1',
        windowFrom: '2026-01-01',
        windowTo: '2026-03-01',
        continuationPoints: {},
        pollOptions: { intervalMs: 1 },
        transport: mockTransport,
      });

      expect(client.crypto.init).toHaveBeenCalledTimes(1);
    });

    it('calls getEncryptionData exactly once', async () => {
      mockDoExport
        .mockResolvedValueOnce(
          mockExportResult({
            isTruncated: true,
            lastPermanentStorageDate: '2026-02-01',
          }),
        )
        .mockResolvedValueOnce(
          mockExportResult({ isTruncated: false }),
        );

      await incrementalExportAndDownload(client, {
        subjectType: 'Subject1',
        windowFrom: '2026-01-01',
        windowTo: '2026-03-01',
        continuationPoints: {},
        pollOptions: { intervalMs: 1 },
        transport: mockTransport,
      });

      expect(client.crypto.getEncryptionData).toHaveBeenCalledTimes(1);
    });
  });

  describe('download error handling', () => {
    it('throws when transport returns non-OK status', async () => {
      mockDoExport.mockResolvedValueOnce(mockExportResult({ isTruncated: false }));

      const failTransport = vi.fn().mockResolvedValue(
        new Response('Not Found', { status: 404 }),
      );

      await expect(
        incrementalExportAndDownload(client, {
          subjectType: 'Subject1',
          windowFrom: '2026-01-01',
          windowTo: '2026-03-01',
          continuationPoints: {},
          pollOptions: { intervalMs: 1 },
          transport: failTransport,
        }),
      ).rejects.toThrow('Download failed for part 1: HTTP 404');
    });
  });

  describe('encryption data usage', () => {
    it('passes client encryption data (cipherKey, cipherIv) to decryptAES256', async () => {
      mockDoExport.mockResolvedValueOnce(mockExportResult({ isTruncated: false }));

      await incrementalExportAndDownload(client, {
        subjectType: 'Subject1',
        windowFrom: '2026-01-01',
        windowTo: '2026-03-01',
        continuationPoints: {},
        pollOptions: { intervalMs: 1 },
        transport: mockTransport,
      });

      const encData = client.crypto.getEncryptionData();
      expect(client.crypto.decryptAES256).toHaveBeenCalledWith(
        expect.any(Uint8Array),
        encData.cipherKey,
        encData.cipherIv,
      );
    });
  });

  describe('zero parts edge case', () => {
    it('handles export result with no parts', async () => {
      mockDoExport.mockResolvedValueOnce(
        mockExportResult({
          isTruncated: false,
          parts: [],
          invoiceCount: 0,
        }),
      );

      const result = await incrementalExportAndDownload(client, {
        subjectType: 'Subject1',
        windowFrom: '2026-01-01',
        windowTo: '2026-03-01',
        continuationPoints: {},
        pollOptions: { intervalMs: 1 },
        transport: mockTransport,
      });

      expect(result.decryptedParts).toHaveLength(0);
      expect(result.referenceNumbers).toEqual(['ref-1']);
      expect(mockTransport).not.toHaveBeenCalled();
      expect(client.crypto.decryptAES256).not.toHaveBeenCalled();
    });
  });
});
