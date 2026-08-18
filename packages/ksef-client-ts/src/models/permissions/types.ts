import type { OperationStatusInfo, PermissionSubjectIdentifierType } from '../common.js';

// Permission type enums
export type PersonPermissionType =
  | 'InvoiceRead'
  | 'InvoiceWrite'
  | 'CredentialsRead'
  | 'CredentialsManage'
  | 'EnforcementOperations'
  | 'SubunitManage'
  | 'Introspection'
  | 'CollectiveIdentifierManage';

export type SubunitPermissionScope = 'CredentialsManage';

export type EuEntityPermissionType =
  | 'InvoiceRead'
  | 'InvoiceWrite';

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
  | 'VatUeManage'
  | 'CollectiveIdentifierManage';

export type EuEntityPermissionsQueryPermissionType =
  | 'VatUeManage'
  | 'InvoiceWrite'
  | 'InvoiceRead'
  | 'Introspection';

export type InvoicePermissionType =
  | 'SelfInvoicing'
  | 'TaxRepresentative'
  | 'RRInvoicing'
  | 'PefInvoicing';

export type EntityAuthorizationPermissionType =
  | 'SelfInvoicing'
  | 'TaxRepresentative'
  | 'RRInvoicing'
  | 'PefInvoicing';

export type EntityRoleType =
  | 'CourtBailiff'
  | 'EnforcementAuthority'
  | 'LocalGovernmentUnit'
  | 'LocalGovernmentSubUnit'
  | 'VatGroupUnit'
  | 'VatGroupSubUnit';

export type SubordinateEntityRoleType = 'LocalGovernmentSubUnit' | 'VatGroupSubUnit';

export type PermissionState = 'Active' | 'Inactive';

export type PersonPermissionsQueryType =
  | 'PermissionsInCurrentContext'
  | 'PermissionsGrantedInCurrentContext';

export type EntityAuthorizationsQueryType = 'Granted' | 'Received';

// Request identifier type enums

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

// Response identifier type enums

export type PersonalPermissionsContextIdentifierType = 'Nip' | 'InternalId';

export type PersonalPermissionsAuthorizedIdentifierType = 'Nip' | 'Pesel' | 'Fingerprint';

export type PersonalPermissionsTargetIdentifierType = 'Nip' | 'AllPartners' | 'InternalId';

export type PersonPermissionsAuthorizedIdentifierType = 'Nip' | 'Pesel' | 'Fingerprint';

export type PersonPermissionsContextIdentifierType = 'Nip' | 'InternalId';

export type PersonPermissionsTargetIdentifierType = 'Nip' | 'AllPartners' | 'InternalId';

export type PersonPermissionsAuthorIdentifierType = 'Nip' | 'Pesel' | 'Fingerprint' | 'System';

export type SubunitPermissionsAuthorIdentifierType = 'Nip' | 'Pesel' | 'Fingerprint';

export type EntityRolesParentEntityIdentifierType = 'Nip';

export type SubordinateRoleSubordinateEntityIdentifierType = 'Nip';

export type EntityAuthorizationsAuthorIdentifierType = 'Nip' | 'Pesel' | 'Fingerprint';

export type EntityAuthorizationsAuthorizedEntityIdentifierType = 'Nip' | 'PeppolId';

export type EntityAuthorizationsAuthorizingEntityIdentifierType = 'Nip';

export type EuEntityPermissionsAuthorIdentifierType = 'Nip' | 'Pesel' | 'Fingerprint';

export type PersonIdentifierType = 'Pesel' | 'Nip';

export type PersonSubjectByFingerprintDetailsType = 'PersonByFingerprintWithIdentifier' | 'PersonByFingerprintWithoutIdentifier';

export type EntitySubjectByFingerprintDetailsType = 'EntityByFingerprint';

export type EntitySubjectByIdentifierDetailsType = 'EntityByIdentifier';

export type EntitySubjectDetailsType = 'EntityByIdentifier' | 'EntityByFingerprint';

// Request subject identifier details

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

// Response identifier interfaces

export interface PersonalPermissionsContextIdentifier {
  type: PersonalPermissionsContextIdentifierType;
  value: string;
}

export interface PersonalPermissionsAuthorizedIdentifier {
  type: PersonalPermissionsAuthorizedIdentifierType;
  value: string;
}

export interface PersonalPermissionsTargetIdentifier {
  type: PersonalPermissionsTargetIdentifierType;
  value?: string | null;
}

export interface PersonPermissionsAuthorizedIdentifier {
  type: PersonPermissionsAuthorizedIdentifierType;
  value: string;
}

export interface PersonPermissionsContextIdentifier {
  type: PersonPermissionsContextIdentifierType;
  value: string;
}

export interface PersonPermissionsTargetIdentifier {
  type: PersonPermissionsTargetIdentifierType;
  value?: string | null;
}

export interface PersonPermissionsAuthorIdentifier {
  type: PersonPermissionsAuthorIdentifierType;
  value?: string | null;
}

export interface SubunitPermissionsAuthorizedIdentifier {
  type: SubunitPermissionsSubjectIdentifierType;
  value: string;
}

export interface SubunitPermissionsAuthorIdentifier {
  type: SubunitPermissionsAuthorIdentifierType;
  value: string;
}

export interface EntityRolesParentEntityIdentifier {
  type: EntityRolesParentEntityIdentifierType;
  value: string;
}

export interface SubordinateRoleSubordinateEntityIdentifier {
  type: SubordinateRoleSubordinateEntityIdentifierType;
  value: string;
}

export interface EntityAuthorizationsAuthorIdentifier {
  type: EntityAuthorizationsAuthorIdentifierType;
  value: string;
}

export interface EntityAuthorizationsAuthorizedEntityIdentifier {
  type: EntityAuthorizationsAuthorizedEntityIdentifierType;
  value: string;
}

export interface EntityAuthorizationsAuthorizingEntityIdentifier {
  type: EntityAuthorizationsAuthorizingEntityIdentifierType;
  value: string;
}

export interface EuEntityPermissionsAuthorIdentifier {
  type: EuEntityPermissionsAuthorIdentifierType;
  value: string;
}

export interface PersonIdentifier {
  type: PersonIdentifierType;
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
  identifier: PersonIdentifier;
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

// Response subject details

export interface PermissionsSubjectPersonDetails {
  subjectDetailsType: PersonSubjectDetailsType;
  firstName: string;
  lastName: string;
  personIdentifier?: PersonIdentifier | null;
  birthDate?: string | null;
  idDocument?: IdDocument | null;
}

export interface PermissionsSubjectPersonByFingerprintDetails {
  subjectDetailsType: PersonSubjectByFingerprintDetailsType;
  firstName: string;
  lastName: string;
  personIdentifier?: PersonIdentifier | null;
  birthDate?: string | null;
  idDocument?: IdDocument | null;
}

export interface PermissionsSubjectEntityDetails {
  subjectDetailsType: EntitySubjectDetailsType;
  fullName: string;
  address?: string | null;
}

export interface PermissionsSubjectEntityByFingerprintDetails {
  subjectDetailsType: EntitySubjectByFingerprintDetailsType;
  fullName: string;
  address?: string | null;
}

export interface PermissionsSubjectEntityByIdentifierDetails {
  subjectDetailsType: EntitySubjectByIdentifierDetailsType;
  fullName: string;
}

export interface PermissionsEuEntityDetails {
  fullName: string;
  address: string;
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
  authorIdentifier?: PersonPermissionsAuthorIdentifier;
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
  authorizingIdentifier?: EntityAuthorizationsAuthorizingEntityIdentifier;
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
  id: string;
  contextIdentifier?: PersonalPermissionsContextIdentifier | null;
  authorizedIdentifier?: PersonalPermissionsAuthorizedIdentifier | null;
  targetIdentifier?: PersonalPermissionsTargetIdentifier | null;
  permissionScope: PersonalPermissionScopeType;
  subjectPersonDetails?: PermissionsSubjectPersonDetails | null;
  subjectEntityDetails?: PermissionsSubjectEntityDetails | null;
  permissionState: PermissionState;
  startDate: string;
  canDelegate: boolean;
  description: string;
}

export interface PersonPermission {
  id: string;
  authorizedIdentifier: PersonPermissionsAuthorizedIdentifier;
  contextIdentifier?: PersonPermissionsContextIdentifier | null;
  targetIdentifier?: PersonPermissionsTargetIdentifier | null;
  authorIdentifier: PersonPermissionsAuthorIdentifier;
  permissionScope: PersonPermissionType;
  subjectPersonDetails?: PermissionsSubjectPersonDetails | null;
  subjectEntityDetails?: PermissionsSubjectEntityDetails | null;
  permissionState: PermissionState;
  startDate: string;
  canDelegate: boolean;
  description: string;
}

export interface SubunitPermission {
  id: string;
  authorizedIdentifier: SubunitPermissionsAuthorizedIdentifier;
  subunitIdentifier: SubunitPermissionsSubunitIdentifier;
  authorIdentifier: SubunitPermissionsAuthorIdentifier;
  permissionScope: SubunitPermissionScope;
  subjectPersonDetails?: PermissionsSubjectPersonDetails | null;
  subunitName?: string | null;
  startDate: string;
  description: string;
}

export interface EntityRole {
  parentEntityIdentifier?: EntityRolesParentEntityIdentifier | null;
  role: EntityRoleType;
  startDate: string;
  description: string;
}

export interface SubordinateEntityRole {
  subordinateEntityIdentifier: SubordinateRoleSubordinateEntityIdentifier;
  role: SubordinateEntityRoleType;
  startDate: string;
  description: string;
}

export interface EntityAuthorizationGrant {
  id: string;
  authorIdentifier?: EntityAuthorizationsAuthorIdentifier | null;
  authorizedEntityIdentifier: EntityAuthorizationsAuthorizedEntityIdentifier;
  authorizingEntityIdentifier: EntityAuthorizationsAuthorizingEntityIdentifier;
  authorizationScope: InvoicePermissionType;
  subjectEntityDetails?: PermissionsSubjectEntityByIdentifierDetails | null;
  startDate: string;
  description: string;
}

/** @deprecated Use EntityAuthorizationGrant instead */
export type AuthorizationGrant = EntityAuthorizationGrant;

export interface EuEntityPermission {
  id: string;
  authorIdentifier: EuEntityPermissionsAuthorIdentifier;
  vatUeIdentifier: string;
  euEntityName: string;
  authorizedFingerprintIdentifier: string;
  permissionScope: EuEntityPermissionsQueryPermissionType;
  subjectPersonDetails?: PermissionsSubjectPersonByFingerprintDetails | null;
  subjectEntityDetails?: PermissionsSubjectEntityByFingerprintDetails | null;
  euEntityDetails?: PermissionsEuEntityDetails | null;
  startDate: string;
  description: string;
}

export interface EntityPermissionItem {
  id: string;
  contextIdentifier: EntityPermissionsContextIdentifier;
  permissionScope: EntityPermissionItemType;
  startDate: string;
  canDelegate: boolean;
  description: string;
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
  authorizationGrants: T[];
}

// Operation status
export interface PermissionsOperationStatusResponse {
  status: OperationStatusInfo;
}

export interface PermissionsAttachmentAllowedResponse {
  isAttachmentAllowed?: boolean;
  revokedDate?: string | null;
}
