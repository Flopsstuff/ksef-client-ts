import type { ContextIdentifier, OperationStatusInfo, TokenInfo } from '../common.js';

export interface AuthChallengeResponse {
  challenge: string;
  timestamp: string;
  timestampMs: number;
}

export interface OperationToken {
  token: string;
  validUntil: string;
}

export interface SignatureResponse {
  referenceNumber: string;
  authenticationToken: OperationToken;
}

export interface AuthOperationStatusResponse {
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

export interface AuthStatus {
  startDate: string;
  authenticationMethodInfo: AuthenticationMethodInfo;
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
