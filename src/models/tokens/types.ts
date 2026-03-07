export type KsefTokenPermissionType =
  | 'InvoiceRead'
  | 'InvoiceWrite'
  | 'CredentialRead'
  | 'CredentialManage'
  | 'EnforcementOperations'
  | 'SubunitManage'
  | 'SelfInvoicing';

export type KsefTokenStatus = 'Active' | 'Revoked' | 'Expired';

export interface KsefTokenRequest {
  description?: string;
  permissions: KsefTokenPermissionType[];
  validTo?: string;
}

export interface KsefTokenResponse {
  referenceNumber: string;
  token: string;
}

export interface AuthenticationKsefToken {
  referenceNumber: string;
  token: string;
  description?: string;
  permissions: KsefTokenPermissionType[];
  status: KsefTokenStatus;
  createdAt: string;
  validTo?: string;
  revokedAt?: string;
}

export type TokenStatus = 'Pending' | 'Active' | 'Revoking' | 'Revoked' | 'Failed';

export type TokenAuthorIdentifierType = 'Nip' | 'Pesel' | 'Fingerprint';

export interface QueryKsefTokensOptions {
  pageOffset?: number;
  pageSize?: number;
  status?: TokenStatus[];
  description?: string;
  authorIdentifier?: string;
  authorIdentifierType?: TokenAuthorIdentifierType;
}

export interface QueryKsefTokensResponse {
  tokens: AuthenticationKsefToken[];
}
