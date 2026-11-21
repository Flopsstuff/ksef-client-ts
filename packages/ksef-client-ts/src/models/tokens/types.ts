export type KsefTokenPermissionType =
  | 'InvoiceRead'
  | 'InvoiceWrite'
  | 'CredentialsRead'
  | 'CredentialsManage'
  | 'EnforcementOperations'
  | 'SubunitManage'
  | 'Introspection'
  | 'CollectiveIdentifierManage';

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

export interface GenerateTokenRequestRev2 {
  permissions: KsefTokenPermissionType[];
  /** 5–256 characters. */
  description: string;
  /** Defaults to now on the server; at most 60 days ahead. */
  validFrom?: string | null;
  /** Defaults to 90 days after `validFrom`; at most 365 days after it. */
  validTo?: string | null;
}

export interface GenerateTokenResponseRev2 {
  referenceNumber: string;
  token: string;
}

/** `FutureValue` means the server sent a value this model version does not know; read `rawCode`. */
export type TokenStatusRev2Code =
  | 'Pending'
  | 'Active'
  | 'Revoking'
  | 'Revoked'
  | 'Failed'
  | 'NotYetActive'
  | 'AwaitingApproval'
  | 'ApprovalExpired'
  | 'Expired'
  | 'FutureValue'
  | (string & {});

export interface TokenStatusRev2 {
  code: TokenStatusRev2Code;
  rawCode: string;
  displayName: string;
}

export type TokenPermissionCodeRev2 =
  | KsefTokenPermissionType
  | 'FutureValue'
  | (string & {});

export interface TokenPermissionRev2 {
  code: TokenPermissionCodeRev2;
  rawCode: string;
  displayName: string;
}

export type TokenAuthorIdentifierTypeCodeRev2 =
  | TokenAuthorIdentifierType
  | 'FutureValue'
  | (string & {});

export interface TokenAuthorIdentifierTypeCodeRev2IdentifierType {
  code: TokenAuthorIdentifierTypeCodeRev2;
  rawCode: string;
  displayName: string;
}

export interface TokenAuthorIdentifierTypeCodeRev2Identifier {
  type: TokenAuthorIdentifierTypeCodeRev2IdentifierType;
  value: string;
}

export type TokenContextIdentifierTypeCodeRev2 =
  | TokenContextIdentifierType
  | 'FutureValue'
  | (string & {});

export interface TokenContextIdentifierTypeCodeRev2IdentifierType {
  code: TokenContextIdentifierTypeCodeRev2;
  rawCode: string;
  displayName: string;
}

export interface TokenContextIdentifierTypeCodeRev2Identifier {
  type: TokenContextIdentifierTypeCodeRev2IdentifierType;
  value: string;
}

export interface TokenFailureRev2 {
  code:
    | 'token.permission-grant-failed'
    | 'token.context-limit-exceeded'
    | 'token.unknown-error'
    | (string & {});
  description: string;
  details?: string[] | null;
}

export interface TokenStatusResponseRev2 {
  referenceNumber: string;
  authorIdentifier: TokenAuthorIdentifierTypeCodeRev2Identifier;
  contextIdentifier: TokenContextIdentifierTypeCodeRev2Identifier;
  description: string;
  requestedPermissions: TokenPermissionRev2[];
  dateCreated: string;
  lastUseDate?: string | null;
  validFrom: string;
  validTo: string;
  status: TokenStatusRev2;
  /** Present only when `status.code` is `Failed`. */
  failure?: TokenFailureRev2 | null;
}

export type QueryTokensResponseItemRev2 = TokenStatusResponseRev2;

export interface QueryTokensResponseRev2 {
  continuationToken?: string | null;
  tokens: QueryTokensResponseItemRev2[];
}

export type TokenStatusFilterRev2 =
  | 'Pending'
  | 'Active'
  | 'Revoking'
  | 'Revoked'
  | 'Failed'
  | 'NotYetActive'
  | 'AwaitingApproval'
  | 'ApprovalExpired'
  | 'Expired';

export type TokenAuthorIdentifierTypeFilterRev2 = 'Nip' | 'Pesel' | 'Fingerprint';

export interface QueryTokensRev2Options {
  continuationToken?: string;
  pageSize?: number;
  status?: TokenStatusFilterRev2[];
  description?: string;
  authorIdentifier?: string;
  authorIdentifierType?: TokenAuthorIdentifierTypeFilterRev2;
  validFrom?: string;
  validTo?: string;
}
