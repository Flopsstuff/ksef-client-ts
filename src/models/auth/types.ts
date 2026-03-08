import type { ContextIdentifier, OperationStatusInfo, TokenInfo } from '../common.js';

export interface AuthChallengeResponse {
  challenge: string;
  timestamp: string;
  timestampMs: number;
  clientIp: string;
}

export interface OperationToken {
  token: string;
  validUntil: string;
}

export interface AuthenticationInitResponse {
  referenceNumber: string;
  authenticationToken: OperationToken;
}

export interface AuthenticationTokensResponse {
  accessToken: TokenInfo;
  refreshToken: TokenInfo;
}

export interface RefreshTokenResponse {
  accessToken: TokenInfo;
}

export type AuthenticationMethodInfoCategory = 'XadesSignature' | 'NationalNode' | 'Token' | 'Other';

export interface AuthenticationMethodInfo {
  category: AuthenticationMethodInfoCategory;
  code: string;
  displayName: string;
}

export interface AuthenticationOperationStatusResponse {
  startDate: string;
  authenticationMethodInfo: AuthenticationMethodInfo;
  /** @deprecated Required by spec but deprecated. */
  authenticationMethod?: string;
  status: OperationStatusInfo;
  isTokenRedeemed?: boolean;
  lastTokenRefreshDate?: string;
  refreshTokenValidUntil?: string;
}

export type SubjectIdentifierType = 'certificateSubject' | 'certificateFingerprint';

export interface AllowedIps {
  ip4Addresses?: string[];
  ip4Ranges?: string[];
  ip4Masks?: string[];
}

export interface AuthorizationPolicy {
  allowedIps?: AllowedIps;
}

export interface AuthTokenRequest {
  challenge: string;
  contextIdentifier: ContextIdentifier;
  subjectIdentifierType: SubjectIdentifierType;
  authorizationPolicy?: AuthorizationPolicy;
}

export interface AuthKsefTokenRequest {
  challenge: string;
  contextIdentifier: ContextIdentifier;
  encryptedToken: string;
  authorizationPolicy?: AuthorizationPolicy;
}
