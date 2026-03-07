import type { OperationStatusInfo, PermissionSubjectIdentifierType } from '../common.js';

// Permission type enums
export type PersonPermissionType =
  | 'InvoiceRead'
  | 'InvoiceWrite'
  | 'CredentialRead'
  | 'CredentialManage'
  | 'EnforcementOperations'
  | 'SubunitManage'
  | 'SelfInvoicing';

export type EntityStandardPermissionType =
  | 'InvoiceRead'
  | 'InvoiceWrite'
  | 'CredentialRead'
  | 'CredentialManage'
  | 'EnforcementOperations'
  | 'SubunitManage'
  | 'SelfInvoicing';

export type AuthorizationPermissionType =
  | 'InvoiceRead'
  | 'InvoiceWrite'
  | 'CredentialRead'
  | 'CredentialManage';

export type IndirectEntityStandardPermissionType =
  | 'InvoiceRead'
  | 'InvoiceWrite'
  | 'CredentialRead'
  | 'CredentialManage'
  | 'EnforcementOperations'
  | 'SubunitManage'
  | 'SelfInvoicing';

export type SubunitPermissionType =
  | 'InvoiceRead'
  | 'InvoiceWrite'
  | 'CredentialRead'
  | 'CredentialManage'
  | 'EnforcementOperations'
  | 'SubunitManage'
  | 'SelfInvoicing';

export type EuEntityPermissionType =
  | 'InvoiceRead'
  | 'InvoiceWrite'
  | 'CredentialRead'
  | 'CredentialManage';

export type EuEntityRepresentativePermissionType =
  | 'InvoiceRead'
  | 'InvoiceWrite'
  | 'CredentialRead'
  | 'CredentialManage';

// Subject identifier details
export interface PersonSubjectIdentifier {
  type: PermissionSubjectIdentifierType;
  value: string;
}

export interface EntitySubjectIdentifier {
  nip: string;
}

export interface IndirectEntitySubjectIdentifier {
  nip: string;
}

export interface SubunitSubjectIdentifier {
  subunitCode: string;
}

export interface EuEntitySubjectIdentifier {
  identifier: string;
  identifierType: string;
}

// Permission with delegation flag
export interface PermissionWithDelegate<T extends string> {
  permission: T;
  canDelegate: boolean;
}

// Grant request interfaces
export interface GrantPermissionsPersonRequest {
  subjectIdentifier: PersonSubjectIdentifier;
  permissions: PersonPermissionType[];
}

export interface GrantPermissionsEntityRequest {
  subjectIdentifier: EntitySubjectIdentifier;
  permissions: PermissionWithDelegate<EntityStandardPermissionType>[];
}

export interface GrantPermissionsAuthorizationRequest {
  permission: AuthorizationPermissionType;
}

export interface GrantPermissionsIndirectRequest {
  subjectIdentifier: IndirectEntitySubjectIdentifier;
  permissions: PermissionWithDelegate<IndirectEntityStandardPermissionType>[];
}

export interface GrantPermissionsSubunitRequest {
  subjectIdentifier: SubunitSubjectIdentifier;
  permissions: SubunitPermissionType[];
}

export interface GrantPermissionsEuEntityRequest {
  subjectIdentifier: EuEntitySubjectIdentifier;
  permissions: PermissionWithDelegate<EuEntityPermissionType>[];
}

export interface GrantPermissionsEuEntityRepresentativeRequest {
  subjectIdentifier: EuEntitySubjectIdentifier;
  permissions: EuEntityRepresentativePermissionType[];
}

// Search query interfaces
export interface QueryPersonalGrantsRequest {
  pageOffset?: number;
  pageSize?: number;
}

export interface QueryPersonsGrantsRequest {
  subjectIdentifier?: PersonSubjectIdentifier;
  pageOffset?: number;
  pageSize?: number;
}

export interface QuerySubunitsGrantsRequest {
  subunitCode?: string;
  pageOffset?: number;
  pageSize?: number;
}

export interface QueryEntitiesRolesRequest {
  nip?: string;
  pageOffset?: number;
  pageSize?: number;
}

export interface QueryEntitiesGrantsRequest {
  contextIdentifier?: string;
  pageOffset?: number;
  pageSize?: number;
}

export interface QuerySubordinateEntitiesRolesRequest {
  nip?: string;
  pageOffset?: number;
  pageSize?: number;
}

export interface QueryAuthorizationsGrantsRequest {
  pageOffset?: number;
  pageSize?: number;
}

export interface QueryEuEntitiesGrantsRequest {
  identifier?: string;
  pageOffset?: number;
  pageSize?: number;
}

// Search response types
export interface PersonalPermission {
  permissionId: string;
  permission: PersonPermissionType;
  grantDate: string;
}

export interface PersonPermission {
  permissionId: string;
  subjectIdentifier: PersonSubjectIdentifier;
  permission: PersonPermissionType;
  grantDate: string;
}

export interface SubunitPermission {
  permissionId: string;
  subunitCode: string;
  permission: SubunitPermissionType;
  grantDate: string;
}

export interface EntityRole {
  permissionId: string;
  nip: string;
  permission: EntityStandardPermissionType;
  canDelegate: boolean;
  grantDate: string;
}

export interface SubordinateEntityRole {
  permissionId: string;
  nip: string;
  permission: IndirectEntityStandardPermissionType;
  canDelegate: boolean;
  grantDate: string;
}

export interface AuthorizationGrant {
  permissionId: string;
  permission: AuthorizationPermissionType;
  grantDate: string;
}

export interface EuEntityPermission {
  permissionId: string;
  subjectIdentifier: EuEntitySubjectIdentifier;
  permission: EuEntityPermissionType;
  canDelegate: boolean;
  grantDate: string;
}

// Paged wrappers
export interface PagedPermissionsResponse<T> {
  hasMore: boolean;
  permissions: T[];
}

export interface PagedRolesResponse<T> {
  hasMore: boolean;
  roles: T[];
}

export interface PagedAuthorizationsResponse<T> {
  hasMore: boolean;
  authorizations: T[];
}

// Operation status
export interface PermissionsOperationStatusResponse {
  processingCode: number;
  processingDescription: string;
  elementReferenceNumber?: string;
  status: OperationStatusInfo;
}

export interface PermissionsAttachmentAllowedResponse {
  allowed: boolean;
}
