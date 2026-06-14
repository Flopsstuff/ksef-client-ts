import { describe, it, expect, vi, beforeEach } from 'vitest';
import { exportIncremental } from '../../../src/cli/commands/export-incremental.js';
import * as clientFactory from '../../../src/cli/client-factory.js';
import * as hwmStorage from '../../../src/workflows/hwm-storage.js';
import * as exportWorkflow from '../../../src/workflows/incremental-export-workflow.js';
import * as output from '../../../src/cli/output.js';
import * as fs from 'node:fs';
import { consola } from 'consola';

vi.mock('consola', () => ({
  consola: { start: vi.fn(), info: vi.fn(), success: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

vi.mock('../../../src/cli/error-handler.js', () => ({
  withErrorHandler: vi.fn(async (fn: () => Promise<void>) => fn()),
}));

vi.mock('../../../src/cli/client-factory.js', () => ({
  requireSession: vi.fn(),
}));

vi.mock('../../../src/workflows/hwm-storage.js', () => ({
  FileHwmStore: vi.fn(),
}));

vi.mock('../../../src/workflows/incremental-export-workflow.js', () => ({
  incrementalExportAndDownload: vi.fn(),
}));

vi.mock('../../../src/cli/output.js', () => ({
  outputResult: vi.fn(),
  outputSuccess: vi.fn(),
}));

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  default: {
    existsSync: vi.fn(),
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
  },
}));

const mockRequireSession = vi.mocked(clientFactory.requireSession);
const mockIncrementalExport = vi.mocked(exportWorkflow.incrementalExportAndDownload);
const mockFileHwmStore = vi.mocked(hwmStorage.FileHwmStore);

async function runExportIncremental(args: Record<string, unknown>) {
  return (exportIncremental as any).run!({ args });
}

function baseResult() {
  return {
    referenceNumbers: ['ref-1'],
    iterationCount: 2,
    decryptedParts: [Buffer.from('zip-part-1'), Buffer.from('zip-part-2')],
    continuationPoints: { Subject1: '2026-04-15T10:00:00Z' },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireSession.mockResolvedValue({ client: {} as never, session: {} as never });
  mockFileHwmStore.mockImplementation(() => ({}) as never);
});

describe('export-incremental command', () => {
  describe('args surface', () => {
    it('metadata identifies the subcommand', () => {
      expect(exportIncremental.meta?.name).toBe('export-incremental');
      expect(exportIncremental.meta?.description).toContain('Incremental');
    });

    it('requires --from', () => {
      expect(exportIncremental.args!.from.required).toBe(true);
    });
  });

  describe('run() happy paths', () => {
    it('creates outputDir if missing, writes parts, prints success', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      mockIncrementalExport.mockImplementation(async (_client, opts) => {
        // Simulate one completed iteration so the parts-saving loop has work.
        opts.onIterationComplete?.(0, { invoiceCount: 7, isTruncated: false, parts: [{} as never, {} as never] });
        return baseResult();
      });

      await runExportIncremental({ from: '2026-04-01' });

      expect(fs.mkdirSync).toHaveBeenCalledWith('./ksef-exports', { recursive: true });
      expect(fs.writeFileSync).toHaveBeenCalledTimes(2);
      expect(fs.writeFileSync).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining('iter-001-part-001.zip'),
        expect.any(Buffer),
      );
      expect(output.outputSuccess).toHaveBeenCalledWith(
        expect.stringContaining('2 iterations'),
      );
      expect(consola.start).toHaveBeenCalledWith(expect.stringContaining('Incremental export'));
      expect(consola.info).toHaveBeenCalledWith(expect.stringContaining('Iteration 1'));
    });

    it('skips mkdir when outputDir already exists', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      mockIncrementalExport.mockResolvedValue({
        ...baseResult(),
        decryptedParts: [],
        iterationCount: 0,
      });

      await runExportIncremental({
        from: '2026-04-01',
        to: '2026-04-20',
        subjectType: 'Subject2',
        outputDir: './custom-out',
        stateFile: './custom-state.json',
        maxIterations: '5',
      });

      expect(fs.mkdirSync).not.toHaveBeenCalled();
      expect(mockFileHwmStore).toHaveBeenCalledWith('./custom-state.json');
      expect(mockIncrementalExport).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          subjectType: 'Subject2',
          maxIterations: 5,
        }),
      );
    });

    it('emits JSON payload when --json flag set and suppresses consola text', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      mockIncrementalExport.mockResolvedValue(baseResult() as never);

      await runExportIncremental({ from: '2026-04-01', json: true });

      expect(output.outputResult).toHaveBeenCalledWith(
        expect.objectContaining({
          referenceNumbers: ['ref-1'],
          iterationCount: 2,
          totalParts: 2,
          outputDir: './ksef-exports',
        }),
        { json: true },
      );
      expect(consola.start).not.toHaveBeenCalled();
      expect(output.outputSuccess).not.toHaveBeenCalled();
    });

    it('iterationComplete callback stays silent in JSON mode', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      mockIncrementalExport.mockImplementation(async (_client, opts) => {
        opts.onIterationComplete?.(0, { invoiceCount: 3, isTruncated: true, parts: [{} as never] });
        return { ...baseResult(), decryptedParts: [Buffer.from('p')] };
      });

      await runExportIncremental({ from: '2026-04-01', json: true });

      // Iteration log is a consola.info call suppressed under --json.
      const iterationLogs = vi.mocked(consola.info).mock.calls.filter((args) =>
        typeof args[0] === 'string' && args[0].includes('Iteration'),
      );
      expect(iterationLogs).toHaveLength(0);
    });
  });

  describe('run() error path', () => {
    it('propagates requireSession rejection', async () => {
      mockRequireSession.mockRejectedValueOnce(new Error('no session'));
      await expect(runExportIncremental({ from: '2026-04-01' })).rejects.toThrow('no session');
      expect(mockIncrementalExport).not.toHaveBeenCalled();
    });
  });
});
