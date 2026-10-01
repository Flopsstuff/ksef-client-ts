import { describe, it, expect, vi, beforeEach } from 'vitest';
import { exportIncremental } from '../../../src/cli/commands/export-incremental.js';
import * as clientFactory from '../../../src/cli/client-factory.js';
import * as hwmStorage from '../../../src/workflows/hwm-storage.js';
import { doExport } from '../../../src/workflows/invoice-export-workflow.js';

// Runs the command against the real incremental workflow; only the export
// round-trip, the session and the file system are stubbed.
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

vi.mock('../../../src/workflows/invoice-export-workflow.js', () => ({
  doExport: vi.fn(),
}));

vi.mock('../../../src/cli/output.js', () => ({
  outputResult: vi.fn(),
  outputSuccess: vi.fn(),
}));

vi.mock('node:fs', () => ({
  existsSync: vi.fn().mockReturnValue(true),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  default: {
    existsSync: vi.fn().mockReturnValue(true),
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
  },
}));

const mockDoExport = vi.mocked(doExport);

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(clientFactory.requireSession).mockResolvedValue({ client: {} as never, session: {} as never });
  vi.mocked(hwmStorage.FileHwmStore).mockImplementation(() => ({
    load: vi.fn().mockResolvedValue({ Subject2: '2026-04-10T12:00:00Z' }),
    save: vi.fn().mockResolvedValue(undefined),
  }) as never);
  mockDoExport.mockResolvedValue({
    referenceNumber: 'ref-1',
    encData: {} as never,
    result: { parts: [], invoiceCount: 0, isTruncated: false, permanentStorageHwmDate: '2026-04-20T00:00:00Z' },
  });
});

describe('export-incremental HWM restriction', () => {
  it('resumes from the stored HWM with restrictToPermanentStorageHwmDate set', async () => {
    await (exportIncremental as any).run!({
      args: { from: '2026-04-01', to: '2026-04-30', subjectType: 'Subject2', json: true },
    });

    expect(mockDoExport).toHaveBeenCalledTimes(1);
    expect(mockDoExport.mock.calls[0]![1]).toEqual({
      subjectType: 'Subject2',
      dateRange: {
        dateType: 'PermanentStorage',
        from: '2026-04-10T12:00:00Z',
        to: '2026-04-30T23:59:59.999+00:00',
        restrictToPermanentStorageHwmDate: true,
      },
    });
  });
});
