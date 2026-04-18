import { defineCommand } from 'citty';
import { requireSession } from '../client-factory.js';
import { outputResult, outputKeyValue, outputTable, outputSuccess, outputWarning } from '../output.js';
import { withErrorHandler } from '../error-handler.js';
import type { GlobalOptions } from '../types.js';
import type { PermissionSubjectIdentifierType } from '../../models/common.js';
import type {
  GrantPermissionsPersonRequest,
  GrantPermissionsEntityRequest,
  GrantPermissionsAuthorizationRequest,
  GrantPermissionsIndirectRequest,
  GrantPermissionsSubunitRequest,
  GrantPermissionsEuEntityAdminRequest,
  GrantPermissionsEuEntityRepresentativeRequest,
  PersonPermissionType,
  EntityPermission,
  EntityAuthorizationPermissionType,
  IndirectPermissionType,
  EuEntityPermissionType,
} from '../../models/permissions/types.js';

function getGlobalOpts(args: Record<string, unknown>): GlobalOptions {
  return {
    env: args.env as string | undefined,
    json: args.json as boolean | undefined,
    verbose: args.verbose as boolean | undefined,
    timeout: args.timeout as string | undefined,
    nip: args.nip as string | undefined,
  };
}

const grant = defineCommand({
  meta: { name: 'grant', description: 'Grant permissions to a subject' },
  args: {
    type: { type: 'string', description: 'Grant type: person, entity, authorization, indirect, subunit, eu-entity-admin, eu-entity-representative', required: true },
    identifier: { type: 'string', description: 'Subject identifier value' },
    identifierType: { type: 'string', description: 'Subject identifier type (Nip/Pesel/Fingerprint)' },
    targetNip: { type: 'string', description: 'Target entity NIP' },
    permissions: { type: 'string', description: 'Comma-separated list of permissions' },
    description: { type: 'string', description: 'Grant description', required: true },
    firstName: { type: 'string', description: 'Subject first name' },
    lastName: { type: 'string', description: 'Subject last name' },
    fullName: { type: 'string', description: 'Entity full name' },
    contextNip: { type: 'string', description: 'Context NIP for subunit grants' },
    subunitName: { type: 'string', description: 'Subunit name' },
    contextNipVatUe: { type: 'string', description: 'Context NIP VAT UE for EU entity admin grants' },
    euEntityName: { type: 'string', description: 'EU entity name' },
    address: { type: 'string', description: 'Address for EU entity grants' },
    canDelegate: { type: 'boolean', description: 'Allow subject to delegate permissions further' },
    env: { type: 'string', description: 'Environment (test/demo/prod)' },
    json: { type: 'boolean', description: 'Output as JSON' },
    verbose: { type: 'boolean', description: 'Show HTTP request/response details' },
    timeout: { type: 'string', description: 'Request timeout (ms)' },
    nip: { type: 'string', description: 'NIP number' },
  },
  run({ args }) {
    return withErrorHandler(async () => {
      const globalOpts = getGlobalOpts(args);
      const { client } = await requireSession(globalOpts);

      let result;

      switch (args.type) {
        case 'person': {
          if (!args.identifier) throw new Error('--identifier is required for person grants.');
          if (!args.identifierType) throw new Error('--identifier-type is required for person grants.');
          if (!args.permissions) throw new Error('--permissions is required for person grants.');
          if (!args.firstName) throw new Error('--first-name is required for person grants.');
          if (!args.lastName) throw new Error('--last-name is required for person grants.');

          const request: GrantPermissionsPersonRequest = {
            subjectIdentifier: {
              type: args.identifierType as PermissionSubjectIdentifierType,
              value: args.identifier,
            },
            permissions: args.permissions.split(',').map((p) => p.trim()) as PersonPermissionType[],
            description: args.description,
            subjectDetails: {
              subjectDetailsType: 'PersonByIdentifier',
              personById: {
                firstName: args.firstName,
                lastName: args.lastName,
              },
            },
          };
          result = await client.permissions.grantPersonPermissions(request);
          break;
        }

        case 'entity': {
          if (!args.targetNip) throw new Error('--target-nip is required for entity grants.');
          if (!args.permissions) throw new Error('--permissions is required for entity grants.');
          if (!args.fullName) throw new Error('--full-name is required for entity grants.');

          const request: GrantPermissionsEntityRequest = {
            subjectIdentifier: { type: 'Nip', value: args.targetNip },
            permissions: args.permissions.split(',').map((p) => p.trim()).map((type) => ({
              type,
              canDelegate: !!args.canDelegate,
            })) as EntityPermission[],
            description: args.description,
            subjectDetails: { fullName: args.fullName },
          };
          result = await client.permissions.grantEntityPermissions(request);
          break;
        }

        case 'authorization': {
          if (!args.targetNip) throw new Error('--target-nip is required for authorization grants.');
          if (!args.permissions) throw new Error('--permissions is required for authorization grants.');
          if (!args.fullName) throw new Error('--full-name is required for authorization grants.');

          const permissionValue = args.permissions.split(',')[0]!.trim() as EntityAuthorizationPermissionType;
          const request: GrantPermissionsAuthorizationRequest = {
            subjectIdentifier: { type: 'Nip', value: args.targetNip },
            permission: permissionValue,
            description: args.description,
            subjectDetails: { fullName: args.fullName },
          };
          result = await client.permissions.grantAuthorizationPermissions(request);
          break;
        }

        case 'indirect': {
          if (!args.identifier) throw new Error('--identifier is required for indirect grants.');
          if (!args.identifierType) throw new Error('--identifier-type is required for indirect grants.');
          if (!args.permissions) throw new Error('--permissions is required for indirect grants.');
          if (!args.firstName) throw new Error('--first-name is required for indirect grants.');
          if (!args.lastName) throw new Error('--last-name is required for indirect grants.');

          const request: GrantPermissionsIndirectRequest = {
            subjectIdentifier: {
              type: args.identifierType as PermissionSubjectIdentifierType,
              value: args.identifier,
            },
            targetIdentifier: args.targetNip ? { type: 'Nip', value: args.targetNip } : undefined,
            permissions: args.permissions.split(',').map((p) => p.trim()) as IndirectPermissionType[],
            description: args.description,
            subjectDetails: {
              subjectDetailsType: 'PersonByIdentifier',
              personById: {
                firstName: args.firstName,
                lastName: args.lastName,
              },
            },
          };
          result = await client.permissions.grantIndirectPermissions(request);
          break;
        }

        case 'subunit': {
          if (!args.identifier) throw new Error('--identifier is required for subunit grants.');
          if (!args.identifierType) throw new Error('--identifier-type is required for subunit grants.');
          if (!args.contextNip) throw new Error('--context-nip is required for subunit grants.');
          if (!args.firstName) throw new Error('--first-name is required for subunit grants.');
          if (!args.lastName) throw new Error('--last-name is required for subunit grants.');

          const request: GrantPermissionsSubunitRequest = {
            subjectIdentifier: {
              type: args.identifierType as PermissionSubjectIdentifierType,
              value: args.identifier,
            },
            contextIdentifier: { type: 'Nip', value: args.contextNip },
            description: args.description,
            subunitName: args.subunitName,
            subjectDetails: {
              subjectDetailsType: 'PersonByIdentifier',
              personById: {
                firstName: args.firstName,
                lastName: args.lastName,
              },
            },
          };
          result = await client.permissions.grantSubunitPermissions(request);
          break;
        }

        case 'eu-entity-admin': {
          if (!args.identifier) throw new Error('--identifier (fingerprint) is required for eu-entity-admin grants.');
          if (!args.contextNipVatUe) throw new Error('--context-nip-vat-ue is required for eu-entity-admin grants.');
          if (!args.euEntityName) throw new Error('--eu-entity-name is required for eu-entity-admin grants.');
          if (!args.fullName) throw new Error('--full-name is required for eu-entity-admin grants.');
          if (!args.address) throw new Error('--address is required for eu-entity-admin grants.');

          const request: GrantPermissionsEuEntityAdminRequest = {
            subjectIdentifier: { type: 'Fingerprint', value: args.identifier },
            contextIdentifier: { type: 'NipVatUe', value: args.contextNipVatUe },
            description: args.description,
            euEntityName: args.euEntityName,
            subjectDetails: {
              subjectDetailsType: 'EntityByFingerprint',
              entityByFp: { fullName: args.fullName, address: args.address },
            },
            euEntityDetails: { fullName: args.euEntityName, address: args.address },
          };
          result = await client.permissions.grantEuEntityAdminPermissions(request);
          break;
        }

        case 'eu-entity-representative': {
          if (!args.identifier) throw new Error('--identifier (fingerprint) is required for eu-entity-representative grants.');
          if (!args.permissions) throw new Error('--permissions is required for eu-entity-representative grants.');
          if (!args.fullName) throw new Error('--full-name is required for eu-entity-representative grants.');
          if (!args.address) throw new Error('--address is required for eu-entity-representative grants.');

          const request: GrantPermissionsEuEntityRepresentativeRequest = {
            subjectIdentifier: { type: 'Fingerprint', value: args.identifier },
            permissions: args.permissions.split(',').map((p) => p.trim()) as EuEntityPermissionType[],
            description: args.description,
            subjectDetails: {
              subjectDetailsType: 'EntityByFingerprint',
              entityByFp: { fullName: args.fullName, address: args.address },
            },
          };
          result = await client.permissions.grantEuEntityRepresentativePermissions(request);
          break;
        }

        default:
          throw new Error(`Unknown grant type: ${args.type}. Use: person, entity, authorization, indirect, subunit, eu-entity-admin, eu-entity-representative`);
      }

      if (args.json) {
        outputResult(result, { json: true });
      } else {
        outputSuccess(`Permission granted. Ref: ${result.referenceNumber}`);
      }
    }, { json: Boolean(args.json) });
  },
});

const revoke = defineCommand({
  meta: { name: 'revoke', description: 'Revoke a permission grant' },
  args: {
    grantId: { type: 'positional', description: 'Grant ID to revoke', required: true },
    authorization: { type: 'boolean', description: 'Revoke an authorization grant (instead of common grant)' },
    env: { type: 'string', description: 'Environment (test/demo/prod)' },
    json: { type: 'boolean', description: 'Output as JSON' },
    verbose: { type: 'boolean', description: 'Show HTTP request/response details' },
    timeout: { type: 'string', description: 'Request timeout (ms)' },
    nip: { type: 'string', description: 'NIP number' },
  },
  run({ args }) {
    return withErrorHandler(async () => {
      const globalOpts = getGlobalOpts(args);
      const { client } = await requireSession(globalOpts);

      let result;

      if (args.authorization) {
        result = await client.permissions.revokeAuthorizationGrant(args.grantId);
      } else {
        result = await client.permissions.revokeCommonGrant(args.grantId);
      }

      if (args.json) {
        outputResult(result, { json: true });
      } else {
        outputSuccess(`Permission grant ${args.grantId} revoked. Ref: ${result.referenceNumber}`);
      }
    }, { json: Boolean(args.json) });
  },
});

const search = defineCommand({
  meta: { name: 'search', description: 'Search permissions' },
  args: {
    type: { type: 'string', description: 'Search type: personal, persons, subunits, entities, entities-grants, subordinate-entities, authorizations, eu-entities', required: true },
    identifier: { type: 'string', description: 'Subject identifier value' },
    identifierType: { type: 'string', description: 'Subject identifier type' },
    queryType: { type: 'string', description: 'Query type (e.g. PermissionsInCurrentContext, Granted)' },
    page: { type: 'string', description: 'Page offset (default: 0)' },
    pageSize: { type: 'string', description: 'Page size' },
    env: { type: 'string', description: 'Environment (test/demo/prod)' },
    json: { type: 'boolean', description: 'Output as JSON' },
    verbose: { type: 'boolean', description: 'Show HTTP request/response details' },
    timeout: { type: 'string', description: 'Request timeout (ms)' },
    nip: { type: 'string', description: 'NIP number' },
  },
  run({ args }) {
    return withErrorHandler(async () => {
      const globalOpts = getGlobalOpts(args);
      const { client } = await requireSession(globalOpts);
      const page = args.page ? parseInt(args.page, 10) : undefined;
      const pageSize = args.pageSize ? parseInt(args.pageSize, 10) : undefined;

      switch (args.type) {
        case 'personal': {
          const response = await client.permissions.queryPersonalGrants({}, page, pageSize);

          if (args.json) {
            outputResult(response, { json: true });
            return;
          }

          if (response.permissions.length === 0) {
            outputWarning('No permissions found.');
            return;
          }

          outputTable(
            response.permissions.map((p) => ({
              id: p.id,
              permission: p.permissionScope,
              startDate: p.startDate,
            })),
            [
              { key: 'id', label: 'ID' },
              { key: 'permission', label: 'Permission' },
              { key: 'startDate', label: 'Start Date' },
            ],
            { json: false },
          );
          break;
        }

        case 'persons': {
          const queryType = (args.queryType as 'PermissionsInCurrentContext' | 'PermissionsGrantedInCurrentContext') || 'PermissionsInCurrentContext';
          const authorIdentifier = args.identifier && args.identifierType
            ? { type: args.identifierType as PermissionSubjectIdentifierType, value: args.identifier }
            : undefined;
          const response = await client.permissions.queryPersonsGrants({ queryType, authorIdentifier }, page, pageSize);

          if (args.json) {
            outputResult(response, { json: true });
            return;
          }

          if (response.permissions.length === 0) {
            outputWarning('No permissions found.');
            return;
          }

          outputTable(
            response.permissions.map((p) => ({
              id: p.id,
              identifier: `${p.authorizedIdentifier.type}:${p.authorizedIdentifier.value}`,
              permission: p.permissionScope,
              startDate: p.startDate,
            })),
            [
              { key: 'id', label: 'ID' },
              { key: 'identifier', label: 'Identifier' },
              { key: 'permission', label: 'Permission' },
              { key: 'startDate', label: 'Start Date' },
            ],
            { json: false },
          );
          break;
        }

        case 'subunits': {
          const response = await client.permissions.querySubunitsGrants({}, page, pageSize);

          if (args.json) {
            outputResult(response, { json: true });
            return;
          }

          if (response.permissions.length === 0) {
            outputWarning('No permissions found.');
            return;
          }

          outputTable(
            response.permissions.map((p) => ({
              id: p.id,
              subunitIdentifier: `${p.subunitIdentifier.type}:${p.subunitIdentifier.value}`,
              permissionScope: p.permissionScope,
              startDate: p.startDate,
            })),
            [
              { key: 'id', label: 'ID' },
              { key: 'subunitIdentifier', label: 'Subunit' },
              { key: 'permissionScope', label: 'Permission' },
              { key: 'startDate', label: 'Start Date' },
            ],
            { json: false },
          );
          break;
        }

        case 'entities': {
          const response = await client.permissions.queryEntitiesRoles({ pageOffset: page, pageSize });

          if (args.json) {
            outputResult(response, { json: true });
            return;
          }

          if (response.roles.length === 0) {
            outputWarning('No permissions found.');
            return;
          }

          outputTable(
            response.roles.map((r) => ({
              nip: r.parentEntityIdentifier?.value ?? 'N/A',
              role: r.role,
              startDate: r.startDate,
            })),
            [
              { key: 'nip', label: 'Parent NIP' },
              { key: 'role', label: 'Role' },
              { key: 'startDate', label: 'Start Date' },
            ],
            { json: false },
          );
          break;
        }

        case 'entities-grants': {
          const response = await client.permissions.queryEntitiesGrants({}, page, pageSize);

          if (args.json) {
            outputResult(response, { json: true });
            return;
          }

          if (response.permissions.length === 0) {
            outputWarning('No permissions found.');
            return;
          }

          outputTable(
            response.permissions.map((p) => ({
              id: p.id,
              context: `${p.contextIdentifier.type}:${p.contextIdentifier.value}`,
              permissionScope: p.permissionScope,
              startDate: p.startDate,
            })),
            [
              { key: 'id', label: 'ID' },
              { key: 'context', label: 'Context' },
              { key: 'permissionScope', label: 'Permission' },
              { key: 'startDate', label: 'Start Date' },
            ],
            { json: false },
          );
          break;
        }

        case 'subordinate-entities': {
          const response = await client.permissions.querySubordinateEntitiesRoles({}, page, pageSize);

          if (args.json) {
            outputResult(response, { json: true });
            return;
          }

          if (response.roles.length === 0) {
            outputWarning('No permissions found.');
            return;
          }

          outputTable(
            response.roles.map((r) => ({
              nip: r.subordinateEntityIdentifier.value,
              role: r.role,
              startDate: r.startDate,
            })),
            [
              { key: 'nip', label: 'Subordinate NIP' },
              { key: 'role', label: 'Role' },
              { key: 'startDate', label: 'Start Date' },
            ],
            { json: false },
          );
          break;
        }

        case 'authorizations': {
          const queryType = (args.queryType as 'Granted' | 'Received') || 'Granted';
          const response = await client.permissions.queryAuthorizationsGrants({ queryType }, page, pageSize);

          if (args.json) {
            outputResult(response, { json: true });
            return;
          }

          if (response.authorizationGrants.length === 0) {
            outputWarning('No permissions found.');
            return;
          }

          outputTable(
            response.authorizationGrants.map((a) => ({
              id: a.id,
              authorizationScope: a.authorizationScope,
              startDate: a.startDate,
            })),
            [
              { key: 'id', label: 'ID' },
              { key: 'authorizationScope', label: 'Permission' },
              { key: 'startDate', label: 'Start Date' },
            ],
            { json: false },
          );
          break;
        }

        case 'eu-entities': {
          const response = await client.permissions.queryEuEntitiesGrants({}, page, pageSize);

          if (args.json) {
            outputResult(response, { json: true });
            return;
          }

          if (response.permissions.length === 0) {
            outputWarning('No permissions found.');
            return;
          }

          outputTable(
            response.permissions.map((p) => ({
              id: p.id,
              authorIdentifier: `${p.authorIdentifier.type}:${p.authorIdentifier.value}`,
              permission: p.permissionScope,
              startDate: p.startDate,
            })),
            [
              { key: 'id', label: 'ID' },
              { key: 'authorIdentifier', label: 'Author' },
              { key: 'permission', label: 'Permission' },
              { key: 'startDate', label: 'Start Date' },
            ],
            { json: false },
          );
          break;
        }

        default:
          throw new Error(`Unknown search type: ${args.type}. Use: personal, persons, subunits, entities, entities-grants, subordinate-entities, authorizations, eu-entities`);
      }
    }, { json: Boolean(args.json) });
  },
});

const status = defineCommand({
  meta: { name: 'status', description: 'Check permission operation status' },
  args: {
    ref: { type: 'positional', description: 'Operation reference number', required: true },
    env: { type: 'string', description: 'Environment (test/demo/prod)' },
    json: { type: 'boolean', description: 'Output as JSON' },
    verbose: { type: 'boolean', description: 'Show HTTP request/response details' },
    timeout: { type: 'string', description: 'Request timeout (ms)' },
    nip: { type: 'string', description: 'NIP number' },
  },
  run({ args }) {
    return withErrorHandler(async () => {
      const globalOpts = getGlobalOpts(args);
      const { client } = await requireSession(globalOpts);

      const result = await client.permissions.getOperationStatus(args.ref);

      if (args.json) {
        outputResult(result, { json: true });
      } else {
        outputKeyValue({
          'Status Code': result.status.code,
          'Status Description': result.status.description,
        }, { json: false });
      }
    }, { json: Boolean(args.json) });
  },
});

const attachmentStatus = defineCommand({
  meta: { name: 'attachment-status', description: 'Check if attachment permissions are allowed' },
  args: {
    env: { type: 'string', description: 'Environment (test/demo/prod)' },
    json: { type: 'boolean', description: 'Output as JSON' },
    verbose: { type: 'boolean', description: 'Show HTTP request/response details' },
    timeout: { type: 'string', description: 'Request timeout (ms)' },
    nip: { type: 'string', description: 'NIP number' },
  },
  run({ args }) {
    return withErrorHandler(async () => {
      const globalOpts = getGlobalOpts(args);
      const { client } = await requireSession(globalOpts);

      const result = await client.permissions.getAttachmentStatus();

      if (args.json) {
        outputResult(result, { json: true });
      } else {
        outputKeyValue({
          'Attachments': result.isAttachmentAllowed ? 'Allowed' : 'Not Allowed',
        }, { json: false });
      }
    }, { json: Boolean(args.json) });
  },
});

export const permissionCommand = defineCommand({
  meta: { name: 'permission', description: 'Permission management commands' },
  subCommands: { grant, revoke, search, status, 'attachment-status': attachmentStatus },
});
