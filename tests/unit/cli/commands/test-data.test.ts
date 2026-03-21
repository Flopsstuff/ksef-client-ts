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
      mockClient.testData.createSubject.mockResolvedValue({ code: 200, description: 'OK' });
      await (testDataCommand.subCommands!['create-subject'] as any).run!({
        args: { nip: '123', type: 'VatGroup', description: 'test' },
      });
      expect(mockClient.testData.createSubject).toHaveBeenCalled();
    });

    it('passes in demo environment', async () => {
      mockLoadConfig.mockReturnValue({ ...defaultConfig, environment: 'demo' });
      mockClient.testData.createSubject.mockResolvedValue({ code: 200, description: 'OK' });
      await (testDataCommand.subCommands!['create-subject'] as any).run!({
        args: { nip: '123', type: 'VatGroup', description: 'test' },
      });
      expect(mockClient.testData.createSubject).toHaveBeenCalled();
    });
  });

  it('createSubject — wiring', async () => {
    mockClient.testData.createSubject.mockResolvedValue({ code: 200, description: 'OK' });
    await (testDataCommand.subCommands!['create-subject'] as any).run!({
      args: { nip: '123', type: 'VatGroup', description: 'test' },
    });
    expect(mockClient.testData.createSubject).toHaveBeenCalledWith(
      expect.objectContaining({ subjectNip: '123', subjectType: 'VatGroup' }),
    );
  });

  it('grantPermissions — splits comma-separated permissions', async () => {
    mockClient.testData.grantPermissions.mockResolvedValue({ code: 200, description: 'OK' });
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
});
