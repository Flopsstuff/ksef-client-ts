import { describe, it, expect, vi, beforeEach } from 'vitest';
import { permissionCommand } from '../../../../src/cli/commands/permission.js';
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
  mockRequireSession.mockReturnValue({ client: mockClient as any, session: { ...validSession } });
});

async function runGrant(args: Record<string, unknown>) {
  return (permissionCommand.subCommands!.grant as any).run!({ args: { description: 'test', ...args } });
}

async function runRevoke(args: Record<string, unknown>) {
  return (permissionCommand.subCommands!.revoke as any).run!({ args });
}

async function runSearch(args: Record<string, unknown>) {
  return (permissionCommand.subCommands!.search as any).run!({ args });
}

async function runStatus(args: Record<string, unknown>) {
  return (permissionCommand.subCommands!.status as any).run!({ args });
}

describe('permission', () => {
  describe('grant validation', () => {
    it('person — throws without identifier', async () => {
      await expect(runGrant({ type: 'person' })).rejects.toThrow('--identifier is required');
    });

    it('entity — throws without targetNip', async () => {
      await expect(runGrant({ type: 'entity' })).rejects.toThrow('--target-nip is required');
    });

    it('authorization — throws without targetNip', async () => {
      await expect(runGrant({ type: 'authorization' })).rejects.toThrow('--target-nip is required');
    });

    it('indirect — throws without identifier', async () => {
      await expect(runGrant({ type: 'indirect' })).rejects.toThrow('--identifier is required');
    });

    it('subunit — throws without contextNip', async () => {
      await expect(runGrant({
        type: 'subunit', identifier: 'id', identifierType: 'Nip',
      })).rejects.toThrow('--context-nip is required');
    });

    it('eu-entity-admin — throws without contextNipVatUe', async () => {
      await expect(runGrant({
        type: 'eu-entity-admin', identifier: 'fp',
      })).rejects.toThrow('--context-nip-vat-ue is required');
    });

    it('eu-entity-representative — throws without identifier', async () => {
      await expect(runGrant({ type: 'eu-entity-representative' })).rejects.toThrow('--identifier');
    });
  });

  describe('grant happy paths', () => {
    it('person — correct request with split permissions', async () => {
      mockClient.permissions.grantPersonPermissions.mockResolvedValue({ referenceNumber: 'ref-1' });
      await runGrant({
        type: 'person', identifier: '12345', identifierType: 'Pesel',
        permissions: 'InvoiceRead,InvoiceWrite', firstName: 'Jan', lastName: 'Kowalski',
      });
      expect(mockClient.permissions.grantPersonPermissions).toHaveBeenCalledWith(
        expect.objectContaining({
          permissions: ['InvoiceRead', 'InvoiceWrite'],
          subjectIdentifier: { type: 'Pesel', value: '12345' },
        }),
      );
    });

    it('entity — permissions with canDelegate: false', async () => {
      mockClient.permissions.grantEntityPermissions.mockResolvedValue({ referenceNumber: 'ref-2' });
      await runGrant({
        type: 'entity', targetNip: '1234567890', permissions: 'InvoiceRead',
        fullName: 'Test Corp',
      });
      expect(mockClient.permissions.grantEntityPermissions).toHaveBeenCalledWith(
        expect.objectContaining({
          permissions: [{ type: 'InvoiceRead', canDelegate: false }],
        }),
      );
    });

    it('authorization — takes only first permission', async () => {
      mockClient.permissions.grantAuthorizationPermissions.mockResolvedValue({ referenceNumber: 'ref-3' });
      await runGrant({
        type: 'authorization', targetNip: '1234567890',
        permissions: 'SelfInvoicing,TaxRepresentative', fullName: 'Test Corp',
      });
      expect(mockClient.permissions.grantAuthorizationPermissions).toHaveBeenCalledWith(
        expect.objectContaining({ permission: 'SelfInvoicing' }),
      );
    });

    it('unknown type throws', async () => {
      await expect(runGrant({ type: 'alien' })).rejects.toThrow('Unknown grant type');
    });
  });

  describe('revoke', () => {
    it('calls revokeCommonGrant', async () => {
      mockClient.permissions.revokeCommonGrant.mockResolvedValue({ referenceNumber: 'ref-r1' });
      await runRevoke({ grantId: 'grant-1' });
      expect(mockClient.permissions.revokeCommonGrant).toHaveBeenCalledWith('grant-1');
    });

    it('calls revokeAuthorizationGrant with --authorization', async () => {
      mockClient.permissions.revokeAuthorizationGrant.mockResolvedValue({ referenceNumber: 'ref-r2' });
      await runRevoke({ grantId: 'grant-2', authorization: true });
      expect(mockClient.permissions.revokeAuthorizationGrant).toHaveBeenCalledWith('grant-2');
    });
  });

  describe('search', () => {
    it('personal — calls queryPersonalGrants', async () => {
      mockClient.permissions.queryPersonalGrants.mockResolvedValue({ permissions: [] });
      await runSearch({ type: 'personal' });
      expect(mockClient.permissions.queryPersonalGrants).toHaveBeenCalled();
    });

    it('unknown type throws', async () => {
      await expect(runSearch({ type: 'alien' })).rejects.toThrow('Unknown search type');
    });
  });

  describe('status', () => {
    it('calls getOperationStatus', async () => {
      mockClient.permissions.getOperationStatus.mockResolvedValue({
        status: { code: 200, description: 'Done' },
      });
      await runStatus({ ref: 'op-ref-1' });
      expect(mockClient.permissions.getOperationStatus).toHaveBeenCalledWith('op-ref-1');
    });
  });
});
