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

export interface QueryKsefTokensResponse {
  tokens: AuthenticationKsefToken[];
}
