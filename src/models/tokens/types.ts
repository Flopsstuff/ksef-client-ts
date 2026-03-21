export type KsefTokenPermissionType =
  | 'InvoiceRead'
  | 'InvoiceWrite'
  | 'CredentialsRead'
  | 'CredentialsManage'
  | 'EnforcementOperations'
  | 'SubunitManage'
  | 'Introspection';

export type KsefTokenStatus = 'Pending' | 'Active' | 'Revoking' | 'Revoked' | 'Failed';

export interface KsefTokenRequest {
  description: string;
  permissions: KsefTokenPermissionType[];
}

export interface KsefTokenResponse {
  referenceNumber: string;
  token: string;
}

export interface AuthenticationKsefToken {
  referenceNumber: string;
  authorIdentifier: TokenAuthorIdentifier;
  contextIdentifier: TokenContextIdentifier;
  description: string;
  requestedPermissions: KsefTokenPermissionType[];
  dateCreated: string;
  lastUseDate?: string | null;
  status: KsefTokenStatus;
  statusDetails?: string[] | null;
}

export type QueryTokensResponseItem = AuthenticationKsefToken;
export type TokenStatusResponse = AuthenticationKsefToken;

export type TokenAuthorIdentifierType = 'Nip' | 'Pesel' | 'Fingerprint';

export type TokenContextIdentifierType = 'Nip' | 'InternalId' | 'NipVatUe' | 'PeppolId';

export interface TokenAuthorIdentifier {
  type: TokenAuthorIdentifierType;
  value: string;
}

export interface TokenContextIdentifier {
  type: TokenContextIdentifierType;
  value: string;
}

export interface QueryKsefTokensOptions {
  continuationToken?: string;
  pageSize?: number;
  status?: KsefTokenStatus[];
  description?: string;
  authorIdentifier?: string;
  authorIdentifierType?: TokenAuthorIdentifierType;
}

export interface QueryKsefTokensResponse {
  continuationToken?: string | null;
  tokens: QueryTokensResponseItem[];
}
