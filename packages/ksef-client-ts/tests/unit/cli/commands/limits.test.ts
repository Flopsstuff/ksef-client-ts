import { describe, it, expect, vi, beforeEach } from 'vitest';
import { limitsCommand } from '../../../../src/cli/commands/limits.js';
import * as clientFactory from '../../../../src/cli/client-factory.js';
import * as output from '../../../../src/cli/output.js';
import { createMockClient, validSession } from './_helpers.js';

vi.mock('consola', () => ({ consola: { level: 0 } }));
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

const mockRequireSession = vi.mocked(clientFactory.requireSession);
let mockClient: ReturnType<typeof createMockClient>;

beforeEach(() => {
  vi.clearAllMocks();
  mockClient = createMockClient();
  mockRequireSession.mockResolvedValue({ client: mockClient as any, session: { ...validSession } });
});

describe('limits', () => {
  it('context — calls getContextLimits and prints every section it returns', async () => {
    mockClient.limits.getContextLimits.mockResolvedValue({
      onlineSession: { maxInvoiceSizeInMB: 10, maxInvoiceWithAttachmentSizeInMB: 50, maxInvoices: 100 },
      batchSession: { maxInvoiceSizeInMB: 10, maxInvoiceWithAttachmentSizeInMB: 50, maxInvoices: 1000 },
      collectiveIdentifier: { maxInvoices: 500 },
    });
    await (limitsCommand.subCommands!.context as any).run!({ args: {} });
    expect(mockClient.limits.getContextLimits).toHaveBeenCalled();
    // Asserted by value, not just "was called": the printed list is hand-written,
    // so only a value check catches a section the response carries and it omits.
    expect(output.outputKeyValue).toHaveBeenCalledWith(
      expect.objectContaining({
        'Online — Max Invoices': 100,
        'Batch — Max Invoices': 1000,
        'Collective Identifier — Max Invoices': 500,
      }),
      { json: false },
    );
  });

  it('subject — calls getSubjectLimits', async () => {
    mockClient.limits.getSubjectLimits.mockResolvedValue({
      enrollment: { maxEnrollments: 5 },
      certificate: { maxCertificates: 10 },
    });
    await (limitsCommand.subCommands!.subject as any).run!({ args: {} });
    expect(mockClient.limits.getSubjectLimits).toHaveBeenCalled();
  });

  it('rate — calls getRateLimits', async () => {
    mockClient.limits.getRateLimits.mockResolvedValue({
      invoiceQueries: { perSecond: 10, perMinute: 100, perHour: 1000 },
    });
    await (limitsCommand.subCommands!.rate as any).run!({ args: {} });
    expect(mockClient.limits.getRateLimits).toHaveBeenCalled();
    expect(output.outputTable).toHaveBeenCalled();
  });

  it('context — json flag outputs result as JSON', async () => {
    const result = {
      onlineSession: { maxInvoiceSizeInMB: 10, maxInvoiceWithAttachmentSizeInMB: 50, maxInvoices: 100 },
      batchSession: { maxInvoiceSizeInMB: 10, maxInvoiceWithAttachmentSizeInMB: 50, maxInvoices: 1000 },
    };
    mockClient.limits.getContextLimits.mockResolvedValue(result);
    await (limitsCommand.subCommands!.context as any).run!({ args: { json: true } });
    expect(output.outputResult).toHaveBeenCalledWith(result, { json: true });
  });

  it('subject — json flag outputs result as JSON', async () => {
    const result = { enrollment: { maxEnrollments: 5 }, certificate: { maxCertificates: 10 } };
    mockClient.limits.getSubjectLimits.mockResolvedValue(result);
    await (limitsCommand.subCommands!.subject as any).run!({ args: { json: true } });
    expect(output.outputResult).toHaveBeenCalledWith(result, { json: true });
  });

  it('rate — json flag outputs result as JSON', async () => {
    const result = { invoiceQueries: { perSecond: 10, perMinute: 100, perHour: 1000 } };
    mockClient.limits.getRateLimits.mockResolvedValue(result);
    await (limitsCommand.subCommands!.rate as any).run!({ args: { json: true } });
    expect(output.outputResult).toHaveBeenCalledWith(result, { json: true });
  });
});
