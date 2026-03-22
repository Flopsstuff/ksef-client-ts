import { describe, it, expect, vi, beforeEach } from 'vitest';
import { testDataCommand } from '../../../../src/cli/commands/test-data.js';
import * as clientFactory from '../../../../src/cli/client-factory.js';
import * as configStore from '../../../../src/cli/config-store.js';
import { createMockClient, defaultConfig, validSession } from './_helpers.js';

vi.mock('consola', () => ({ consola: { level: 0 } }));
vi.mock('../../../../src/cli/error-handler.js', () => ({
  withErrorHandler: vi.fn((fn) => fn()),
}));
vi.mock('../../../../src/cli/client-factory.js', () => ({
  createClient: vi.fn(),
  requireSession: vi.fn(),
}));
vi.mock('../../../../src/cli/config-store.js', () => ({
  loadConfig: vi.fn(),
}));
vi.mock('../../../../src/cli/output.js', () => ({
  outputResult: vi.fn(),
  outputKeyValue: vi.fn(),
  outputSuccess: vi.fn(),
  outputTable: vi.fn(),
  outputWarning: vi.fn(),
}));

const mockCreateClient = vi.mocked(clientFactory.createClient);
const mockRequireSession = vi.mocked(clientFactory.requireSession);
const mockLoadConfig = vi.mocked(configStore.loadConfig);
let mockClient: ReturnType<typeof createMockClient>;

beforeEach(() => {
  vi.clearAllMocks();
  mockClient = createMockClient();
  mockCreateClient.mockReturnValue(mockClient as any);
  mockRequireSession.mockReturnValue({ client: mockClient as any, session: { ...validSession } });
  mockLoadConfig.mockReturnValue({ ...defaultConfig });
});

describe('test-data', () => {
  describe('requireNonProd', () => {
    it('throws in prod environment', async () => {
      mockLoadConfig.mockReturnValue({ ...defaultConfig, environment: 'prod' });
      await expect(
        (testDataCommand.subCommands!['create-subject'] as any).run!({
          args: { nip: '123', type: 'VatGroup', description: 'test' },
        }),
      ).rejects.toThrow('only available in test/demo');
    });

    it('passes in test environment', async () => {
      mockClient.testData.createSubject.mockResolvedValue(undefined);
      await (testDataCommand.subCommands!['create-subject'] as any).run!({
        args: { nip: '123', type: 'VatGroup', description: 'test' },
      });
      expect(mockClient.testData.createSubject).toHaveBeenCalled();
    });

    it('passes in demo environment', async () => {
      mockLoadConfig.mockReturnValue({ ...defaultConfig, environment: 'demo' });
      mockClient.testData.createSubject.mockResolvedValue(undefined);
      await (testDataCommand.subCommands!['create-subject'] as any).run!({
        args: { nip: '123', type: 'VatGroup', description: 'test' },
      });
      expect(mockClient.testData.createSubject).toHaveBeenCalled();
    });
  });

  it('createSubject — wiring', async () => {
    mockClient.testData.createSubject.mockResolvedValue(undefined);
    await (testDataCommand.subCommands!['create-subject'] as any).run!({
      args: { nip: '123', type: 'VatGroup', description: 'test' },
    });
    expect(mockClient.testData.createSubject).toHaveBeenCalledWith(
      expect.objectContaining({ subjectNip: '123', subjectType: 'VatGroup' }),
    );
  });

  it('grantPermissions — splits comma-separated permissions', async () => {
    mockClient.testData.grantPermissions.mockResolvedValue(undefined);
    await (testDataCommand.subCommands!['grant-permissions'] as any).run!({
      args: {
        'context-nip': '111', identifier: '222', 'identifier-type': 'Nip',
        permissions: 'InvoiceRead,InvoiceWrite',
      },
    });
    expect(mockClient.testData.grantPermissions).toHaveBeenCalledWith(
      expect.objectContaining({ permissions: [{ permissionType: 'InvoiceRead', description: '' }, { permissionType: 'InvoiceWrite', description: '' }] }),
    );
  });

  describe('block-context', () => {
    it('calls testData.blockContext with correct request', async () => {
      mockClient.testData.blockContext.mockResolvedValue(undefined);
      await (testDataCommand.subCommands!['block-context'] as any).run!({
        args: { 'context-value': '1234567890', 'context-type': 'Nip' },
      });
      expect(mockClient.testData.blockContext).toHaveBeenCalledWith(
        expect.objectContaining({
          contextIdentifier: { type: 'Nip', value: '1234567890' },
        }),
      );
    });

    it('defaults context-type to Nip', async () => {
      mockClient.testData.blockContext.mockResolvedValue(undefined);
      await (testDataCommand.subCommands!['block-context'] as any).run!({
        args: { 'context-value': '1234567890' },
      });
      expect(mockClient.testData.blockContext).toHaveBeenCalledWith(
        expect.objectContaining({
          contextIdentifier: { type: 'Nip', value: '1234567890' },
        }),
      );
    });

    it('rejects in prod environment', async () => {
      mockLoadConfig.mockReturnValue({ ...defaultConfig, environment: 'prod' });
      await expect(
        (testDataCommand.subCommands!['block-context'] as any).run!({
          args: { 'context-value': '1234567890' },
        }),
      ).rejects.toThrow('only available in test/demo');
    });
  });

  describe('remove-subject', () => {
    it('calls testData.removeSubject with correct NIP', async () => {
      mockClient.testData.removeSubject.mockResolvedValue(undefined);
      await (testDataCommand.subCommands!['remove-subject'] as any).run!({
        args: { nip: '9876543210' },
      });
      expect(mockClient.testData.removeSubject).toHaveBeenCalledWith(
        expect.objectContaining({ subjectNip: '9876543210' }),
      );
    });
  });

  describe('create-person', () => {
    it('calls testData.createPerson with all fields', async () => {
      mockClient.testData.createPerson.mockResolvedValue(undefined);
      await (testDataCommand.subCommands!['create-person'] as any).run!({
        args: { nip: '111', pesel: '22222222222', description: 'test person', bailiff: true, deceased: false, 'created-date': '2024-01-01' },
      });
      expect(mockClient.testData.createPerson).toHaveBeenCalledWith(
        expect.objectContaining({
          nip: '111',
          pesel: '22222222222',
          description: 'test person',
          isBailiff: true,
          isDeceased: false,
          createdDate: '2024-01-01',
        }),
      );
    });

    it('defaults isBailiff to false', async () => {
      mockClient.testData.createPerson.mockResolvedValue(undefined);
      await (testDataCommand.subCommands!['create-person'] as any).run!({
        args: { nip: '111', pesel: '22222222222', description: 'test' },
      });
      expect(mockClient.testData.createPerson).toHaveBeenCalledWith(
        expect.objectContaining({ isBailiff: false }),
      );
    });
  });

  describe('remove-person', () => {
    it('calls testData.removePerson with correct NIP', async () => {
      mockClient.testData.removePerson.mockResolvedValue(undefined);
      await (testDataCommand.subCommands!['remove-person'] as any).run!({
        args: { nip: '333' },
      });
      expect(mockClient.testData.removePerson).toHaveBeenCalledWith(
        expect.objectContaining({ nip: '333' }),
      );
    });
  });

  describe('revoke-permissions', () => {
    it('calls testData.revokePermissions with correct identifiers', async () => {
      mockClient.testData.revokePermissions.mockResolvedValue(undefined);
      await (testDataCommand.subCommands!['revoke-permissions'] as any).run!({
        args: { 'context-nip': '111', identifier: '222', 'identifier-type': 'Pesel' },
      });
      expect(mockClient.testData.revokePermissions).toHaveBeenCalledWith(
        expect.objectContaining({
          contextIdentifier: { type: 'Nip', value: '111' },
          authorizedIdentifier: { type: 'Pesel', value: '222' },
        }),
      );
    });
  });

  describe('enable-attachment', () => {
    it('calls testData.enableAttachment with NIP', async () => {
      mockClient.testData.enableAttachment.mockResolvedValue(undefined);
      await (testDataCommand.subCommands!['enable-attachment'] as any).run!({
        args: { nip: '5555555555' },
      });
      expect(mockClient.testData.enableAttachment).toHaveBeenCalledWith(
        expect.objectContaining({ nip: '5555555555' }),
      );
    });
  });

  describe('disable-attachment', () => {
    it('calls testData.disableAttachment with NIP and end-date', async () => {
      mockClient.testData.disableAttachment.mockResolvedValue(undefined);
      await (testDataCommand.subCommands!['disable-attachment'] as any).run!({
        args: { nip: '6666666666', 'end-date': '2024-12-31' },
      });
      expect(mockClient.testData.disableAttachment).toHaveBeenCalledWith(
        expect.objectContaining({ nip: '6666666666', expectedEndDate: '2024-12-31' }),
      );
    });
  });

  describe('change-session-limits', () => {
    it('calls testData.changeSessionLimits with parsed integer values', async () => {
      mockClient.testData.changeSessionLimits.mockResolvedValue(undefined);
      await (testDataCommand.subCommands!['change-session-limits'] as any).run!({
        args: {
          'online-max-size': '3',
          'online-max-attach-size': '7',
          'online-max-invoices': '5000',
          'batch-max-size': '4',
          'batch-max-attach-size': '8',
          'batch-max-invoices': '10000',
        },
      });
      expect(mockClient.testData.changeSessionLimits).toHaveBeenCalledWith({
        onlineSession: {
          maxInvoiceSizeInMB: 3,
          maxInvoiceWithAttachmentSizeInMB: 7,
          maxInvoices: 5000,
        },
        batchSession: {
          maxInvoiceSizeInMB: 4,
          maxInvoiceWithAttachmentSizeInMB: 8,
          maxInvoices: 10000,
        },
      });
    });
  });

  describe('restore-session-limits', () => {
    it('calls testData.restoreDefaultSessionLimits', async () => {
      mockClient.testData.restoreDefaultSessionLimits.mockResolvedValue(undefined);
      await (testDataCommand.subCommands!['restore-session-limits'] as any).run!({
        args: {},
      });
      expect(mockClient.testData.restoreDefaultSessionLimits).toHaveBeenCalled();
    });
  });

  describe('change-cert-limits', () => {
    it('calls testData.changeCertificatesLimit with all options', async () => {
      mockClient.testData.changeCertificatesLimit.mockResolvedValue(undefined);
      await (testDataCommand.subCommands!['change-cert-limits'] as any).run!({
        args: { 'identifier-type': 'Nip', 'max-enrollments': '10', 'max-certificates': '20' },
      });
      expect(mockClient.testData.changeCertificatesLimit).toHaveBeenCalledWith({
        subjectIdentifierType: 'Nip',
        enrollment: { maxEnrollments: 10 },
        certificate: { maxCertificates: 20 },
      });
    });

    it('omits enrollment and certificate when not provided', async () => {
      mockClient.testData.changeCertificatesLimit.mockResolvedValue(undefined);
      await (testDataCommand.subCommands!['change-cert-limits'] as any).run!({
        args: {},
      });
      expect(mockClient.testData.changeCertificatesLimit).toHaveBeenCalledWith({
        subjectIdentifierType: undefined,
        enrollment: undefined,
        certificate: undefined,
      });
    });
  });

  describe('restore-cert-limits', () => {
    it('calls testData.restoreDefaultCertificatesLimit', async () => {
      mockClient.testData.restoreDefaultCertificatesLimit.mockResolvedValue(undefined);
      await (testDataCommand.subCommands!['restore-cert-limits'] as any).run!({
        args: {},
      });
      expect(mockClient.testData.restoreDefaultCertificatesLimit).toHaveBeenCalled();
    });
  });

  describe('set-rate-limits', () => {
    it('calls testData.setRateLimits with parsed JSON', async () => {
      mockClient.testData.setRateLimits.mockResolvedValue(undefined);
      const limitsJson = JSON.stringify({ requestsPerMinute: 100 });
      await (testDataCommand.subCommands!['set-rate-limits'] as any).run!({
        args: { limits: limitsJson },
      });
      expect(mockClient.testData.setRateLimits).toHaveBeenCalledWith({
        rateLimits: { requestsPerMinute: 100 },
      });
    });
  });

  describe('restore-rate-limits', () => {
    it('calls testData.restoreDefaultRateLimits', async () => {
      mockClient.testData.restoreDefaultRateLimits.mockResolvedValue(undefined);
      await (testDataCommand.subCommands!['restore-rate-limits'] as any).run!({
        args: {},
      });
      expect(mockClient.testData.restoreDefaultRateLimits).toHaveBeenCalled();
    });
  });

  describe('set-production-rate-limits', () => {
    it('calls testData.setProductionRateLimits', async () => {
      mockClient.testData.setProductionRateLimits.mockResolvedValue(undefined);
      await (testDataCommand.subCommands!['set-production-rate-limits'] as any).run!({
        args: {},
      });
      expect(mockClient.testData.setProductionRateLimits).toHaveBeenCalled();
    });

    it('outputs JSON when --json is set', async () => {
      mockClient.testData.setProductionRateLimits.mockResolvedValue(undefined);
      await (testDataCommand.subCommands!['set-production-rate-limits'] as any).run!({
        args: { json: true },
      });
      const { outputResult } = await import('../../../../src/cli/output.js');
      expect(outputResult).toHaveBeenCalledWith({ status: 'ok' }, { json: true });
    });
  });

  describe('unblock-context', () => {
    it('calls testData.unblockContext with correct request', async () => {
      mockClient.testData.unblockContext.mockResolvedValue(undefined);
      await (testDataCommand.subCommands!['unblock-context'] as any).run!({
        args: { 'context-value': '9876543210', 'context-type': 'InternalId' },
      });
      expect(mockClient.testData.unblockContext).toHaveBeenCalledWith(
        expect.objectContaining({
          contextIdentifier: { type: 'InternalId', value: '9876543210' },
        }),
      );
    });

    it('defaults context-type to Nip', async () => {
      mockClient.testData.unblockContext.mockResolvedValue(undefined);
      await (testDataCommand.subCommands!['unblock-context'] as any).run!({
        args: { 'context-value': '9876543210' },
      });
      expect(mockClient.testData.unblockContext).toHaveBeenCalledWith(
        expect.objectContaining({
          contextIdentifier: { type: 'Nip', value: '9876543210' },
        }),
      );
    });

    it('rejects in prod environment', async () => {
      mockLoadConfig.mockReturnValue({ ...defaultConfig, environment: 'prod' });
      await expect(
        (testDataCommand.subCommands!['unblock-context'] as any).run!({
          args: { 'context-value': '9876543210' },
        }),
      ).rejects.toThrow('only available in test/demo');
    });
  });
});
