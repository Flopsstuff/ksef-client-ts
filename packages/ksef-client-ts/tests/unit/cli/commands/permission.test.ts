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
  mockRequireSession.mockResolvedValue({ client: mockClient as any, session: { ...validSession } });
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

    it('eu-entity-admin — throws without identifier', async () => {
      await expect(runGrant({ type: 'eu-entity-admin' })).rejects.toThrow('--identifier');
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

    it('outputs JSON when --json is set', async () => {
      const mockOutputResult = vi.mocked(output.outputResult);
      const statusResult = { status: { code: 200, description: 'Done' } };
      mockClient.permissions.getOperationStatus.mockResolvedValue(statusResult);
      await runStatus({ ref: 'op-ref-2', json: true });
      expect(mockOutputResult).toHaveBeenCalledWith(statusResult, { json: true });
    });
  });

  describe('grant happy paths (continued)', () => {
    it('indirect — correct request', async () => {
      mockClient.permissions.grantIndirectPermissions.mockResolvedValue({ referenceNumber: 'ref-i1' });
      await runGrant({
        type: 'indirect', identifier: '99999', identifierType: 'Pesel',
        permissions: 'InvoiceRead', firstName: 'Anna', lastName: 'Nowak',
        targetNip: '5555555555',
      });
      expect(mockClient.permissions.grantIndirectPermissions).toHaveBeenCalledWith(
        expect.objectContaining({
          permissions: ['InvoiceRead'],
          subjectIdentifier: { type: 'Pesel', value: '99999' },
          targetIdentifier: { type: 'Nip', value: '5555555555' },
        }),
      );
    });

    it('indirect — without targetNip sets targetIdentifier to undefined', async () => {
      mockClient.permissions.grantIndirectPermissions.mockResolvedValue({ referenceNumber: 'ref-i2' });
      await runGrant({
        type: 'indirect', identifier: '99999', identifierType: 'Pesel',
        permissions: 'InvoiceRead', firstName: 'Anna', lastName: 'Nowak',
      });
      expect(mockClient.permissions.grantIndirectPermissions).toHaveBeenCalledWith(
        expect.objectContaining({ targetIdentifier: undefined }),
      );
    });

    it('subunit — correct request', async () => {
      mockClient.permissions.grantSubunitPermissions.mockResolvedValue({ referenceNumber: 'ref-s1' });
      await runGrant({
        type: 'subunit', identifier: '11111', identifierType: 'Nip',
        contextNip: '2222222222', firstName: 'Jan', lastName: 'Kowalski',
        subunitName: 'Branch A',
      });
      expect(mockClient.permissions.grantSubunitPermissions).toHaveBeenCalledWith(
        expect.objectContaining({
          contextIdentifier: { type: 'Nip', value: '2222222222' },
          subunitName: 'Branch A',
        }),
      );
    });

    it('eu-entity-admin — correct request', async () => {
      mockClient.permissions.grantEuEntityAdminPermissions.mockResolvedValue({ referenceNumber: 'ref-eu1' });
      await runGrant({
        type: 'eu-entity-admin', identifier: 'fp-abc', contextNipVatUe: 'EU123',
        euEntityName: 'EU Corp', fullName: 'EU Corp Full', address: 'Berlin, DE',
      });
      expect(mockClient.permissions.grantEuEntityAdminPermissions).toHaveBeenCalledWith(
        expect.objectContaining({
          subjectIdentifier: { type: 'Fingerprint', value: 'fp-abc' },
          contextIdentifier: { type: 'NipVatUe', value: 'EU123' },
          euEntityName: 'EU Corp',
          euEntityDetails: { fullName: 'EU Corp', address: 'Berlin, DE' },
        }),
      );
    });

    it('eu-entity-representative — correct request', async () => {
      mockClient.permissions.grantEuEntityRepresentativePermissions.mockResolvedValue({ referenceNumber: 'ref-eu2' });
      await runGrant({
        type: 'eu-entity-representative', identifier: 'fp-xyz',
        permissions: 'InvoiceRead,InvoiceWrite', fullName: 'Rep Corp', address: 'Paris, FR',
      });
      expect(mockClient.permissions.grantEuEntityRepresentativePermissions).toHaveBeenCalledWith(
        expect.objectContaining({
          subjectIdentifier: { type: 'Fingerprint', value: 'fp-xyz' },
          permissions: ['InvoiceRead', 'InvoiceWrite'],
        }),
      );
    });

    it('outputs JSON when --json is set', async () => {
      const mockOutputResult = vi.mocked(output.outputResult);
      const grantResult = { referenceNumber: 'ref-json-1' };
      mockClient.permissions.grantPersonPermissions.mockResolvedValue(grantResult);
      await runGrant({
        type: 'person', identifier: '12345', identifierType: 'Pesel',
        permissions: 'InvoiceRead', firstName: 'Jan', lastName: 'Kowalski',
        json: true,
      });
      expect(mockOutputResult).toHaveBeenCalledWith(grantResult, { json: true });
    });

    it('outputs success message with referenceNumber', async () => {
      mockClient.permissions.grantPersonPermissions.mockResolvedValue({ referenceNumber: 'ref-msg-1' });
      const mockOutputSuccessFn = vi.mocked(output.outputSuccess);
      await runGrant({
        type: 'person', identifier: '12345', identifierType: 'Pesel',
        permissions: 'InvoiceRead', firstName: 'Jan', lastName: 'Kowalski',
      });
      expect(mockOutputSuccessFn).toHaveBeenCalledWith('Permission granted. Ref: ref-msg-1');
    });
  });

  describe('grant validation (continued)', () => {
    it('subunit — throws without identifier', async () => {
      await expect(runGrant({ type: 'subunit' })).rejects.toThrow('--identifier is required');
    });

    it('subunit — throws without identifierType', async () => {
      await expect(runGrant({ type: 'subunit', identifier: 'id' })).rejects.toThrow('--identifier-type is required');
    });

    it('subunit — throws without firstName', async () => {
      await expect(runGrant({
        type: 'subunit', identifier: 'id', identifierType: 'Nip', contextNip: '123',
      })).rejects.toThrow('--first-name is required');
    });

    it('subunit — throws without lastName', async () => {
      await expect(runGrant({
        type: 'subunit', identifier: 'id', identifierType: 'Nip', contextNip: '123', firstName: 'Jan',
      })).rejects.toThrow('--last-name is required');
    });

    it('eu-entity-admin — throws without euEntityName', async () => {
      await expect(runGrant({
        type: 'eu-entity-admin', identifier: 'fp', contextNipVatUe: 'EU1',
      })).rejects.toThrow('--eu-entity-name is required');
    });

    it('eu-entity-admin — throws without fullName', async () => {
      await expect(runGrant({
        type: 'eu-entity-admin', identifier: 'fp', contextNipVatUe: 'EU1', euEntityName: 'EU',
      })).rejects.toThrow('--full-name is required');
    });

    it('eu-entity-admin — throws without address', async () => {
      await expect(runGrant({
        type: 'eu-entity-admin', identifier: 'fp', contextNipVatUe: 'EU1', euEntityName: 'EU', fullName: 'Full',
      })).rejects.toThrow('--address is required');
    });

    it('eu-entity-representative — throws without permissions', async () => {
      await expect(runGrant({
        type: 'eu-entity-representative', identifier: 'fp',
      })).rejects.toThrow('--permissions is required');
    });

    it('eu-entity-representative — throws without fullName', async () => {
      await expect(runGrant({
        type: 'eu-entity-representative', identifier: 'fp', permissions: 'InvoiceRead',
      })).rejects.toThrow('--full-name is required');
    });

    it('eu-entity-representative — throws without address', async () => {
      await expect(runGrant({
        type: 'eu-entity-representative', identifier: 'fp', permissions: 'InvoiceRead', fullName: 'Corp',
      })).rejects.toThrow('--address is required');
    });

    it('indirect — throws without identifierType', async () => {
      await expect(runGrant({ type: 'indirect', identifier: 'id' })).rejects.toThrow('--identifier-type is required');
    });

    it('indirect — throws without permissions', async () => {
      await expect(runGrant({ type: 'indirect', identifier: 'id', identifierType: 'Nip' })).rejects.toThrow('--permissions is required');
    });

    it('indirect — throws without firstName', async () => {
      await expect(runGrant({
        type: 'indirect', identifier: 'id', identifierType: 'Nip', permissions: 'InvoiceRead',
      })).rejects.toThrow('--first-name is required');
    });

    it('indirect — throws without lastName', async () => {
      await expect(runGrant({
        type: 'indirect', identifier: 'id', identifierType: 'Nip', permissions: 'InvoiceRead', firstName: 'Jan',
      })).rejects.toThrow('--last-name is required');
    });

    it('person — throws without identifierType', async () => {
      await expect(runGrant({ type: 'person', identifier: 'id' })).rejects.toThrow('--identifier-type is required');
    });

    it('person — throws without permissions', async () => {
      await expect(runGrant({ type: 'person', identifier: 'id', identifierType: 'Pesel' })).rejects.toThrow('--permissions is required');
    });

    it('person — throws without firstName', async () => {
      await expect(runGrant({
        type: 'person', identifier: 'id', identifierType: 'Pesel', permissions: 'InvoiceRead',
      })).rejects.toThrow('--first-name is required');
    });

    it('person — throws without lastName', async () => {
      await expect(runGrant({
        type: 'person', identifier: 'id', identifierType: 'Pesel', permissions: 'InvoiceRead', firstName: 'Jan',
      })).rejects.toThrow('--last-name is required');
    });

    it('entity — throws without permissions', async () => {
      await expect(runGrant({ type: 'entity', targetNip: '123' })).rejects.toThrow('--permissions is required');
    });

    it('entity — throws without fullName', async () => {
      await expect(runGrant({ type: 'entity', targetNip: '123', permissions: 'InvoiceRead' })).rejects.toThrow('--full-name is required');
    });

    it('authorization — throws without permissions', async () => {
      await expect(runGrant({ type: 'authorization', targetNip: '123' })).rejects.toThrow('--permissions is required');
    });

    it('authorization — throws without fullName', async () => {
      await expect(runGrant({ type: 'authorization', targetNip: '123', permissions: 'SelfInvoicing' })).rejects.toThrow('--full-name is required');
    });
  });

  describe('revoke (continued)', () => {
    it('revokeCommonGrant with --json outputs JSON', async () => {
      const mockOutputResult = vi.mocked(output.outputResult);
      const revokeResult = { referenceNumber: 'rev-json-1' };
      mockClient.permissions.revokeCommonGrant.mockResolvedValue(revokeResult);
      await runRevoke({ grantId: 'grant-j1', json: true });
      expect(mockOutputResult).toHaveBeenCalledWith(revokeResult, { json: true });
    });

    it('revokeAuthorizationGrant with --json outputs JSON', async () => {
      const mockOutputResult = vi.mocked(output.outputResult);
      const revokeResult = { referenceNumber: 'rev-json-2' };
      mockClient.permissions.revokeAuthorizationGrant.mockResolvedValue(revokeResult);
      await runRevoke({ grantId: 'grant-j2', authorization: true, json: true });
      expect(mockOutputResult).toHaveBeenCalledWith(revokeResult, { json: true });
    });

    it('revokeCommonGrant outputs success message', async () => {
      const mockOutputSuccessFn = vi.mocked(output.outputSuccess);
      mockClient.permissions.revokeCommonGrant.mockResolvedValue({ referenceNumber: 'rev-msg-1' });
      await runRevoke({ grantId: 'grant-m1' });
      expect(mockOutputSuccessFn).toHaveBeenCalledWith('Permission grant grant-m1 revoked. Ref: rev-msg-1');
    });
  });

  describe('search personal (continued)', () => {
    it('personal — displays table when permissions exist', async () => {
      const mockOutputTable = vi.mocked(output.outputTable);
      mockClient.permissions.queryPersonalGrants.mockResolvedValue({
        permissions: [
          { id: 'p-1', permissionScope: 'InvoiceRead', startDate: '2025-01-01' },
        ],
      });
      await runSearch({ type: 'personal' });
      expect(mockOutputTable).toHaveBeenCalledWith(
        [expect.objectContaining({ id: 'p-1', permission: 'InvoiceRead' })],
        expect.any(Array),
        { json: false },
      );
    });

    it('personal — shows warning when empty', async () => {
      const mockOutputWarning = vi.mocked(output.outputWarning);
      mockClient.permissions.queryPersonalGrants.mockResolvedValue({ permissions: [] });
      await runSearch({ type: 'personal' });
      expect(mockOutputWarning).toHaveBeenCalledWith('No permissions found.');
    });

    it('personal — outputs JSON when --json is set', async () => {
      const mockOutputResult = vi.mocked(output.outputResult);
      const data = { permissions: [{ id: 'p-1' }] };
      mockClient.permissions.queryPersonalGrants.mockResolvedValue(data);
      await runSearch({ type: 'personal', json: true });
      expect(mockOutputResult).toHaveBeenCalledWith(data, { json: true });
    });

    it('personal — passes page and pageSize', async () => {
      mockClient.permissions.queryPersonalGrants.mockResolvedValue({ permissions: [] });
      await runSearch({ type: 'personal', page: '2', pageSize: '10' });
      expect(mockClient.permissions.queryPersonalGrants).toHaveBeenCalledWith({}, 2, 10);
    });

    it('personal — forwards InternalId contextIdentifier', async () => {
      mockClient.permissions.queryPersonalGrants.mockResolvedValue({ permissions: [] });
      await runSearch({ type: 'personal', contextType: 'InternalId', contextValue: '7762811692-12345' });
      expect(mockClient.permissions.queryPersonalGrants).toHaveBeenCalledWith(
        { contextIdentifier: { type: 'InternalId', value: '7762811692-12345' } },
        undefined,
        undefined,
      );
    });

    it('personal — forwards Nip contextIdentifier', async () => {
      mockClient.permissions.queryPersonalGrants.mockResolvedValue({ permissions: [] });
      await runSearch({ type: 'personal', contextType: 'Nip', contextValue: '1234567890' });
      expect(mockClient.permissions.queryPersonalGrants).toHaveBeenCalledWith(
        { contextIdentifier: { type: 'Nip', value: '1234567890' } },
        undefined,
        undefined,
      );
    });

    it('personal — throws when contextType provided without contextValue', async () => {
      await expect(
        runSearch({ type: 'personal', contextType: 'InternalId' }),
      ).rejects.toThrow(/context-type and --context-value must be provided together/);
      expect(mockClient.permissions.queryPersonalGrants).not.toHaveBeenCalled();
    });

    it('personal — throws when contextValue provided without contextType', async () => {
      await expect(
        runSearch({ type: 'personal', contextValue: '1234567890' }),
      ).rejects.toThrow(/context-type and --context-value must be provided together/);
      expect(mockClient.permissions.queryPersonalGrants).not.toHaveBeenCalled();
    });

    it('personal — throws on invalid contextType value (e.g. typo)', async () => {
      await expect(
        runSearch({ type: 'personal', contextType: 'internalId', contextValue: 'x' }),
      ).rejects.toThrow(/must be "Nip" or "InternalId"/);
      expect(mockClient.permissions.queryPersonalGrants).not.toHaveBeenCalled();
    });

    it('entities-grants — throws on invalid contextType value', async () => {
      await expect(
        runSearch({ type: 'entities-grants', contextType: 'Pesel', contextValue: 'x' }),
      ).rejects.toThrow(/must be "Nip" or "InternalId"/);
      expect(mockClient.permissions.queryEntitiesGrants).not.toHaveBeenCalled();
    });

    it('entities-grants — throws when only contextValue is provided', async () => {
      await expect(
        runSearch({ type: 'entities-grants', contextValue: '1234567890' }),
      ).rejects.toThrow(/context-type and --context-value must be provided together/);
      expect(mockClient.permissions.queryEntitiesGrants).not.toHaveBeenCalled();
    });
  });

  describe('search persons', () => {
    it('persons — displays table when permissions exist', async () => {
      const mockOutputTable = vi.mocked(output.outputTable);
      mockClient.permissions.queryPersonsGrants.mockResolvedValue({
        permissions: [
          {
            id: 'pp-1',
            authorizedIdentifier: { type: 'Pesel', value: '12345678901' },
            permissionScope: 'InvoiceRead',
            startDate: '2025-02-01',
          },
        ],
      });
      await runSearch({ type: 'persons' });
      expect(mockClient.permissions.queryPersonsGrants).toHaveBeenCalledWith(
        { queryType: 'PermissionsInCurrentContext', authorIdentifier: undefined },
        undefined, undefined,
      );
      expect(mockOutputTable).toHaveBeenCalledWith(
        [expect.objectContaining({ id: 'pp-1', identifier: 'Pesel:12345678901' })],
        expect.any(Array),
        { json: false },
      );
    });

    it('persons — passes authorIdentifier when provided', async () => {
      mockClient.permissions.queryPersonsGrants.mockResolvedValue({ permissions: [] });
      await runSearch({
        type: 'persons', identifier: '999', identifierType: 'Nip',
        queryType: 'PermissionsGrantedInCurrentContext',
      });
      expect(mockClient.permissions.queryPersonsGrants).toHaveBeenCalledWith(
        { queryType: 'PermissionsGrantedInCurrentContext', authorIdentifier: { type: 'Nip', value: '999' } },
        undefined, undefined,
      );
    });

    it('persons — shows warning when empty', async () => {
      const mockOutputWarning = vi.mocked(output.outputWarning);
      mockClient.permissions.queryPersonsGrants.mockResolvedValue({ permissions: [] });
      await runSearch({ type: 'persons' });
      expect(mockOutputWarning).toHaveBeenCalledWith('No permissions found.');
    });

    it('persons — outputs JSON when --json is set', async () => {
      const mockOutputResult = vi.mocked(output.outputResult);
      const data = { permissions: [] };
      mockClient.permissions.queryPersonsGrants.mockResolvedValue(data);
      await runSearch({ type: 'persons', json: true });
      expect(mockOutputResult).toHaveBeenCalledWith(data, { json: true });
    });
  });

  describe('search subunits', () => {
    it('subunits — displays table when permissions exist', async () => {
      const mockOutputTable = vi.mocked(output.outputTable);
      mockClient.permissions.querySubunitsGrants.mockResolvedValue({
        permissions: [
          {
            id: 'su-1',
            subunitIdentifier: { type: 'Nip', value: '1234567890' },
            permissionScope: 'InvoiceWrite',
            startDate: '2025-03-01',
          },
        ],
      });
      await runSearch({ type: 'subunits' });
      expect(mockClient.permissions.querySubunitsGrants).toHaveBeenCalled();
      expect(mockOutputTable).toHaveBeenCalledWith(
        [expect.objectContaining({ id: 'su-1', subunitIdentifier: 'Nip:1234567890' })],
        expect.any(Array),
        { json: false },
      );
    });

    it('subunits — shows warning when empty', async () => {
      const mockOutputWarning = vi.mocked(output.outputWarning);
      mockClient.permissions.querySubunitsGrants.mockResolvedValue({ permissions: [] });
      await runSearch({ type: 'subunits' });
      expect(mockOutputWarning).toHaveBeenCalledWith('No permissions found.');
    });

    it('subunits — outputs JSON when --json is set', async () => {
      const mockOutputResult = vi.mocked(output.outputResult);
      const data = { permissions: [] };
      mockClient.permissions.querySubunitsGrants.mockResolvedValue(data);
      await runSearch({ type: 'subunits', json: true });
      expect(mockOutputResult).toHaveBeenCalledWith(data, { json: true });
    });
  });

  describe('search entities', () => {
    it('entities — displays table when roles exist', async () => {
      const mockOutputTable = vi.mocked(output.outputTable);
      mockClient.permissions.queryEntitiesRoles.mockResolvedValue({
        roles: [
          {
            parentEntityIdentifier: { type: 'Nip', value: '9999999999' },
            role: 'Admin',
            startDate: '2025-04-01',
          },
        ],
      });
      await runSearch({ type: 'entities' });
      expect(mockClient.permissions.queryEntitiesRoles).toHaveBeenCalledWith({ pageOffset: undefined, pageSize: undefined });
      expect(mockOutputTable).toHaveBeenCalledWith(
        [expect.objectContaining({ nip: '9999999999', role: 'Admin' })],
        expect.any(Array),
        { json: false },
      );
    });

    it('entities — handles missing parentEntityIdentifier', async () => {
      const mockOutputTable = vi.mocked(output.outputTable);
      mockClient.permissions.queryEntitiesRoles.mockResolvedValue({
        roles: [
          { parentEntityIdentifier: null, role: 'Admin', startDate: '2025-04-01' },
        ],
      });
      await runSearch({ type: 'entities' });
      expect(mockOutputTable).toHaveBeenCalledWith(
        [expect.objectContaining({ nip: 'N/A' })],
        expect.any(Array),
        { json: false },
      );
    });

    it('entities — shows warning when empty', async () => {
      const mockOutputWarning = vi.mocked(output.outputWarning);
      mockClient.permissions.queryEntitiesRoles.mockResolvedValue({ roles: [] });
      await runSearch({ type: 'entities' });
      expect(mockOutputWarning).toHaveBeenCalledWith('No permissions found.');
    });

    it('entities — outputs JSON when --json is set', async () => {
      const mockOutputResult = vi.mocked(output.outputResult);
      const data = { roles: [] };
      mockClient.permissions.queryEntitiesRoles.mockResolvedValue(data);
      await runSearch({ type: 'entities', json: true });
      expect(mockOutputResult).toHaveBeenCalledWith(data, { json: true });
    });

    it('entities — passes page and pageSize', async () => {
      mockClient.permissions.queryEntitiesRoles.mockResolvedValue({ roles: [] });
      await runSearch({ type: 'entities', page: '3', pageSize: '20' });
      expect(mockClient.permissions.queryEntitiesRoles).toHaveBeenCalledWith({ pageOffset: 3, pageSize: 20 });
    });
  });

  describe('search entities-grants', () => {
    it('entities-grants — displays table when permissions exist', async () => {
      const mockOutputTable = vi.mocked(output.outputTable);
      mockClient.permissions.queryEntitiesGrants.mockResolvedValue({
        permissions: [
          {
            id: 'eg-1',
            contextIdentifier: { type: 'Nip', value: '8888888888' },
            permissionScope: 'InvoiceRead',
            startDate: '2025-05-01',
          },
        ],
      });
      await runSearch({ type: 'entities-grants' });
      expect(mockClient.permissions.queryEntitiesGrants).toHaveBeenCalled();
      expect(mockOutputTable).toHaveBeenCalledWith(
        [expect.objectContaining({ id: 'eg-1', context: 'Nip:8888888888' })],
        expect.any(Array),
        { json: false },
      );
    });

    it('entities-grants — shows warning when empty', async () => {
      const mockOutputWarning = vi.mocked(output.outputWarning);
      mockClient.permissions.queryEntitiesGrants.mockResolvedValue({ permissions: [] });
      await runSearch({ type: 'entities-grants' });
      expect(mockOutputWarning).toHaveBeenCalledWith('No permissions found.');
    });

    it('entities-grants — outputs JSON when --json is set', async () => {
      const mockOutputResult = vi.mocked(output.outputResult);
      const data = { permissions: [] };
      mockClient.permissions.queryEntitiesGrants.mockResolvedValue(data);
      await runSearch({ type: 'entities-grants', json: true });
      expect(mockOutputResult).toHaveBeenCalledWith(data, { json: true });
    });

    it('entities-grants — forwards InternalId contextIdentifier', async () => {
      mockClient.permissions.queryEntitiesGrants.mockResolvedValue({ permissions: [] });
      await runSearch({ type: 'entities-grants', contextType: 'InternalId', contextValue: '7762811692-12345' });
      expect(mockClient.permissions.queryEntitiesGrants).toHaveBeenCalledWith(
        { contextIdentifier: { type: 'InternalId', value: '7762811692-12345' } },
        undefined,
        undefined,
      );
    });
  });

  describe('search subordinate-entities', () => {
    it('subordinate-entities — displays table when roles exist', async () => {
      const mockOutputTable = vi.mocked(output.outputTable);
      mockClient.permissions.querySubordinateEntitiesRoles.mockResolvedValue({
        roles: [
          {
            subordinateEntityIdentifier: { type: 'Nip', value: '7777777777' },
            role: 'Subordinate',
            startDate: '2025-06-01',
          },
        ],
      });
      await runSearch({ type: 'subordinate-entities' });
      expect(mockClient.permissions.querySubordinateEntitiesRoles).toHaveBeenCalled();
      expect(mockOutputTable).toHaveBeenCalledWith(
        [expect.objectContaining({ nip: '7777777777', role: 'Subordinate' })],
        expect.any(Array),
        { json: false },
      );
    });

    it('subordinate-entities — shows warning when empty', async () => {
      const mockOutputWarning = vi.mocked(output.outputWarning);
      mockClient.permissions.querySubordinateEntitiesRoles.mockResolvedValue({ roles: [] });
      await runSearch({ type: 'subordinate-entities' });
      expect(mockOutputWarning).toHaveBeenCalledWith('No permissions found.');
    });

    it('subordinate-entities — outputs JSON when --json is set', async () => {
      const mockOutputResult = vi.mocked(output.outputResult);
      const data = { roles: [] };
      mockClient.permissions.querySubordinateEntitiesRoles.mockResolvedValue(data);
      await runSearch({ type: 'subordinate-entities', json: true });
      expect(mockOutputResult).toHaveBeenCalledWith(data, { json: true });
    });
  });

  describe('search authorizations', () => {
    it('authorizations — displays table when grants exist', async () => {
      const mockOutputTable = vi.mocked(output.outputTable);
      mockClient.permissions.queryAuthorizationsGrants.mockResolvedValue({
        authorizationGrants: [
          {
            id: 'auth-1',
            authorizationScope: 'SelfInvoicing',
            startDate: '2025-07-01',
          },
        ],
      });
      await runSearch({ type: 'authorizations' });
      expect(mockClient.permissions.queryAuthorizationsGrants).toHaveBeenCalledWith(
        { queryType: 'Granted' }, undefined, undefined,
      );
      expect(mockOutputTable).toHaveBeenCalledWith(
        [expect.objectContaining({ id: 'auth-1', authorizationScope: 'SelfInvoicing' })],
        expect.any(Array),
        { json: false },
      );
    });

    it('authorizations — passes queryType', async () => {
      mockClient.permissions.queryAuthorizationsGrants.mockResolvedValue({ authorizationGrants: [] });
      await runSearch({ type: 'authorizations', queryType: 'Received' });
      expect(mockClient.permissions.queryAuthorizationsGrants).toHaveBeenCalledWith(
        { queryType: 'Received' }, undefined, undefined,
      );
    });

    it('authorizations — shows warning when empty', async () => {
      const mockOutputWarning = vi.mocked(output.outputWarning);
      mockClient.permissions.queryAuthorizationsGrants.mockResolvedValue({ authorizationGrants: [] });
      await runSearch({ type: 'authorizations' });
      expect(mockOutputWarning).toHaveBeenCalledWith('No permissions found.');
    });

    it('authorizations — outputs JSON when --json is set', async () => {
      const mockOutputResult = vi.mocked(output.outputResult);
      const data = { authorizationGrants: [] };
      mockClient.permissions.queryAuthorizationsGrants.mockResolvedValue(data);
      await runSearch({ type: 'authorizations', json: true });
      expect(mockOutputResult).toHaveBeenCalledWith(data, { json: true });
    });
  });

  describe('search eu-entities', () => {
    it('eu-entities — displays table when permissions exist', async () => {
      const mockOutputTable = vi.mocked(output.outputTable);
      mockClient.permissions.queryEuEntitiesGrants.mockResolvedValue({
        permissions: [
          {
            id: 'eu-1',
            authorIdentifier: { type: 'Fingerprint', value: 'fp-123' },
            permissionScope: 'InvoiceRead',
            startDate: '2025-01-01',
          },
        ],
      });
      await runSearch({ type: 'eu-entities' });
      expect(mockClient.permissions.queryEuEntitiesGrants).toHaveBeenCalled();
      expect(mockOutputTable).toHaveBeenCalledWith(
        [expect.objectContaining({
          id: 'eu-1',
          authorIdentifier: 'Fingerprint:fp-123',
          permission: 'InvoiceRead',
        })],
        expect.any(Array),
        { json: false },
      );
    });

    it('eu-entities — shows warning when empty', async () => {
      const mockOutputWarning = vi.mocked(output.outputWarning);
      mockClient.permissions.queryEuEntitiesGrants.mockResolvedValue({ permissions: [] });
      await runSearch({ type: 'eu-entities' });
      expect(mockOutputWarning).toHaveBeenCalledWith('No permissions found.');
    });

    it('eu-entities — outputs JSON when --json is set', async () => {
      const mockOutputResult = vi.mocked(output.outputResult);
      const data = { permissions: [] };
      mockClient.permissions.queryEuEntitiesGrants.mockResolvedValue(data);
      await runSearch({ type: 'eu-entities', json: true });
      expect(mockOutputResult).toHaveBeenCalledWith(data, { json: true });
    });
  });

  describe('attachment-status', () => {
    async function runAttachmentStatus(args: Record<string, unknown> = {}) {
      return (permissionCommand.subCommands!['attachment-status'] as any).run!({ args });
    }

    it('calls getAttachmentStatus and shows key-value output', async () => {
      const mockOutputKeyValue = vi.mocked(output.outputKeyValue);
      mockClient.permissions.getAttachmentStatus.mockResolvedValue({ isAttachmentAllowed: true });
      await runAttachmentStatus({});
      expect(mockClient.permissions.getAttachmentStatus).toHaveBeenCalled();
      expect(mockOutputKeyValue).toHaveBeenCalledWith(
        { 'Attachments': 'Allowed' },
        { json: false },
      );
    });

    it('shows "Not Allowed" when attachments are disabled', async () => {
      const mockOutputKeyValue = vi.mocked(output.outputKeyValue);
      mockClient.permissions.getAttachmentStatus.mockResolvedValue({ isAttachmentAllowed: false });
      await runAttachmentStatus({});
      expect(mockOutputKeyValue).toHaveBeenCalledWith(
        { 'Attachments': 'Not Allowed' },
        { json: false },
      );
    });

    it('outputs JSON when --json is set', async () => {
      const mockOutputResult = vi.mocked(output.outputResult);
      const attachResult = { isAttachmentAllowed: true };
      mockClient.permissions.getAttachmentStatus.mockResolvedValue(attachResult);
      await runAttachmentStatus({ json: true });
      expect(mockOutputResult).toHaveBeenCalledWith(attachResult, { json: true });
    });
  });
});
