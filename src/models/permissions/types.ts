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

export type EntityPermissionItemType =
  | 'InvoiceRead'
  | 'InvoiceWrite';

export type IndirectPermissionType =
  | 'InvoiceRead'
  | 'InvoiceWrite';

export type PersonalPermissionScopeType =
  | 'CredentialsManage'
  | 'CredentialsRead'
  | 'InvoiceWrite'
  | 'InvoiceRead'
  | 'Introspection'
  | 'SubunitManage'
  | 'EnforcementOperations'
  | 'VatUeManage';

export type EuEntityPermissionsQueryPermissionType =
  | 'VatUeManage'
  | 'InvoiceWrite'
  | 'InvoiceRead'
  | 'Introspection';

export type InvoicePermissionType =
  | 'InvoiceRead'
  | 'InvoiceWrite';

export type EntityAuthorizationPermissionType =
  | 'SelfInvoicing'
  | 'TaxRepresentative'
  | 'RRInvoicing'
  | 'PefInvoicing';

export type PermissionState = 'Active' | 'Inactive';

export type PersonPermissionsQueryType =
  | 'PermissionsInCurrentContext'
  | 'PermissionsGrantedInCurrentContext';

export type EntityAuthorizationsQueryType = 'Granted' | 'Received';

export type EntityAuthorizationPermissionsSubjectIdentifierType = 'Nip' | 'PeppolId';

export type EuEntityAdministrationPermissionsSubjectIdentifierType = 'Fingerprint';

export type EuEntityPermissionsSubjectIdentifierType = 'Fingerprint';

export type SubunitPermissionsSubjectIdentifierType = 'Nip' | 'Pesel' | 'Fingerprint';

export type SubunitPermissionsContextIdentifierType = 'Nip' | 'InternalId';

export type SubunitPermissionsSubunitIdentifierType = 'InternalId' | 'Nip';

export type EuEntityAdministrationPermissionsContextIdentifierType = 'NipVatUe';

export type IndirectPermissionsSubjectIdentifierType = 'Nip' | 'Pesel' | 'Fingerprint';

export type IndirectPermissionsTargetIdentifierType = 'Nip' | 'AllPartners' | 'InternalId';

export type EntityPermissionsContextIdentifierType = 'Nip' | 'InternalId';

export type PersonSubjectDetailsType =
  | 'PersonByIdentifier'
  | 'PersonByFingerprintWithIdentifier'
  | 'PersonByFingerprintWithoutIdentifier';

export type EuEntityPermissionSubjectDetailsType =
  | 'PersonByFingerprintWithIdentifier'
  | 'PersonByFingerprintWithoutIdentifier'
  | 'EntityByFingerprint';

// Subject identifier details
export interface PersonSubjectIdentifier {
  type: PermissionSubjectIdentifierType;
  value: string;
}

export interface EntitySubjectIdentifier {
  type: 'Nip';
  value: string;
}

export interface EntityAuthorizationSubjectIdentifier {
  type: EntityAuthorizationPermissionsSubjectIdentifierType;
  value: string;
}

export interface IndirectPermissionsSubjectIdentifier {
  type: IndirectPermissionsSubjectIdentifierType;
  value: string;
}

export interface IndirectPermissionsTargetIdentifier {
  type: IndirectPermissionsTargetIdentifierType;
  value?: string;
}

export interface SubunitPermissionsSubjectIdentifier {
  type: SubunitPermissionsSubjectIdentifierType;
  value: string;
}

export interface SubunitPermissionsContextIdentifier {
  type: SubunitPermissionsContextIdentifierType;
  value: string;
}

export interface EuEntityAdministrationSubjectIdentifier {
  type: EuEntityAdministrationPermissionsSubjectIdentifierType;
  value: string;
}

export interface EuEntityAdministrationContextIdentifier {
  type: EuEntityAdministrationPermissionsContextIdentifierType;
  value: string;
}

export interface EuEntityPermissionsSubjectIdentifier {
  type: EuEntityPermissionsSubjectIdentifierType;
  value: string;
}

export interface SubunitPermissionsSubunitIdentifier {
  type: SubunitPermissionsSubunitIdentifierType;
  value: string;
}

export interface EntityPermissionsContextIdentifier {
  type: EntityPermissionsContextIdentifierType;
  value: string;
}

// Subject details for grant requests

export interface PersonByIdentifierDetails {
  firstName: string;
  lastName: string;
}

export interface PersonByFingerprintWithIdentifierDetails {
  firstName: string;
  lastName: string;
  identifier: PersonSubjectIdentifier;
}

export interface PersonByFingerprintWithoutIdentifierDetails {
  firstName: string;
  lastName: string;
  birthDate: string;
  idDocument: IdDocument;
}

export interface IdDocument {
  type: string;
  number: string;
  country: string;
}

export interface PersonPermissionSubjectDetails {
  subjectDetailsType: PersonSubjectDetailsType;
  personById?: PersonByIdentifierDetails;
  personByFpWithId?: PersonByFingerprintWithIdentifierDetails;
  personByFpNoId?: PersonByFingerprintWithoutIdentifierDetails;
}

export interface EntityDetails {
  fullName: string;
}

export interface EntityByFingerprintDetails {
  fullName: string;
  address: string;
}

export interface EuEntityDetails {
  fullName: string;
  address: string;
}

export interface EuEntityPermissionSubjectDetails {
  subjectDetailsType: EuEntityPermissionSubjectDetailsType;
  personByFpWithId?: PersonByFingerprintWithIdentifierDetails;
  personByFpNoId?: PersonByFingerprintWithoutIdentifierDetails;
  entityByFp?: EntityByFingerprintDetails;
}

// Permission with delegation flag
export interface PermissionWithDelegate<T extends string> {
  permission: T;
  canDelegate: boolean;
}

// Entity permission (type + canDelegate for entity grants)
export interface EntityPermission {
  type: EntityPermissionItemType;
  canDelegate?: boolean;
}

// Grant request interfaces

export interface GrantPermissionsPersonRequest {
  subjectIdentifier: PersonSubjectIdentifier;
  permissions: PersonPermissionType[];
  description: string;
  subjectDetails: PersonPermissionSubjectDetails;
}

export interface GrantPermissionsEntityRequest {
  subjectIdentifier: EntitySubjectIdentifier;
  permissions: EntityPermission[];
  description: string;
  subjectDetails: EntityDetails;
}

export interface GrantPermissionsAuthorizationRequest {
  subjectIdentifier: EntityAuthorizationSubjectIdentifier;
  permission: EntityAuthorizationPermissionType;
  description: string;
  subjectDetails: EntityDetails;
}

export interface GrantPermissionsIndirectRequest {
  subjectIdentifier: IndirectPermissionsSubjectIdentifier;
  targetIdentifier?: IndirectPermissionsTargetIdentifier;
  permissions: IndirectPermissionType[];
  description: string;
  subjectDetails: PersonPermissionSubjectDetails;
}

export interface GrantPermissionsSubunitRequest {
  subjectIdentifier: SubunitPermissionsSubjectIdentifier;
  contextIdentifier: SubunitPermissionsContextIdentifier;
  description: string;
  subunitName?: string;
  subjectDetails: PersonPermissionSubjectDetails;
}

export interface GrantPermissionsEuEntityAdminRequest {
  subjectIdentifier: EuEntityAdministrationSubjectIdentifier;
  contextIdentifier: EuEntityAdministrationContextIdentifier;
  description: string;
  euEntityName: string;
  subjectDetails: EuEntityPermissionSubjectDetails;
  euEntityDetails: EuEntityDetails;
}

export interface GrantPermissionsEuEntityRepresentativeRequest {
  subjectIdentifier: EuEntityPermissionsSubjectIdentifier;
  permissions: EuEntityPermissionType[];
  description: string;
  subjectDetails: EuEntityPermissionSubjectDetails;
}

// Keep old name as alias for backward compatibility
/** @deprecated Use GrantPermissionsEuEntityAdminRequest instead */
export type GrantPermissionsEuEntityRequest = GrantPermissionsEuEntityAdminRequest;

// Search query interfaces

export interface QueryPersonalGrantsRequest {
  contextIdentifier?: EntityPermissionsContextIdentifier;
  targetIdentifier?: IndirectPermissionsTargetIdentifier;
  permissionTypes?: PersonalPermissionScopeType[];
  permissionState?: PermissionState;
}

export interface QueryPersonsGrantsRequest {
  queryType: PersonPermissionsQueryType;
  authorIdentifier?: PersonSubjectIdentifier;
  authorizedIdentifier?: PersonSubjectIdentifier;
  contextIdentifier?: EntityPermissionsContextIdentifier;
  targetIdentifier?: IndirectPermissionsTargetIdentifier;
  permissionTypes?: PersonPermissionType[];
  permissionState?: PermissionState;
}

export interface QuerySubunitsGrantsRequest {
  subunitIdentifier?: SubunitPermissionsSubunitIdentifier;
}

export interface QueryEntitiesRolesRequest {
  pageOffset?: number;
  pageSize?: number;
}

export interface QueryEntitiesGrantsRequest {
  contextIdentifier?: EntityPermissionsContextIdentifier;
}

export interface QuerySubordinateEntitiesRolesRequest {
  subordinateEntityIdentifier?: {
    type: 'Nip';
    value: string;
  };
}

export interface QueryAuthorizationsGrantsRequest {
  queryType: EntityAuthorizationsQueryType;
  authorizingIdentifier?: EntityAuthorizationSubjectIdentifier;
  authorizedIdentifier?: EntityAuthorizationSubjectIdentifier;
  permissionTypes?: InvoicePermissionType[];
}

export interface QueryEuEntitiesGrantsRequest {
  vatUeIdentifier?: string;
  authorizedFingerprintIdentifier?: string;
  permissionTypes?: EuEntityPermissionsQueryPermissionType[];
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
  subjectIdentifier: EuEntityPermissionsSubjectIdentifier;
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
