import type { ContextIdentifier, OperationStatusInfo, TokenInfo } from '../common.js';

export interface AuthChallengeResponse {
  challenge: string;
  timestamp: string;
  timestampMs: number;
  clientIp: string;
}

export interface LoginResult {
  /** Client IP as seen by KSeF during the challenge — use to configure AuthorizationPolicy.allowedIps. */
  clientIp: string;
}

export interface AuthenticationInitResponse {
  referenceNumber: string;
  authenticationToken: TokenInfo;
}

export interface AuthenticationTokensResponse {
  accessToken: TokenInfo;
  refreshToken: TokenInfo;
}

export interface AuthenticationTokenRefreshResponse {
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
  authenticationMethod: AuthenticationMethod;
  status: OperationStatusInfo;
  isTokenRedeemed?: boolean | null;
  lastTokenRefreshDate?: string | null;
  refreshTokenValidUntil?: string | null;
}

/**
 * Subject identifier type for the XAdES auth XML request.
 * This is XML-specific (not in the REST OpenAPI spec).
 * Known value: 'certificateSubject' (used with qualified signatures/seals).
 */
export type XadesSubjectIdentifierType = 'certificateSubject' | (string & {});

export interface AllowedIps {
  ip4Addresses?: string[] | null;
  ip4Ranges?: string[] | null;
  ip4Masks?: string[] | null;
}

export interface AuthorizationPolicy {
  allowedIps?: AllowedIps | null;
}

export interface AuthTokenRequest {
  challenge: string;
  contextIdentifier: ContextIdentifier;
  subjectIdentifierType: XadesSubjectIdentifierType;
  authorizationPolicy?: AuthorizationPolicy;
}

export interface AuthKsefTokenRequest {
  challenge: string;
  contextIdentifier: ContextIdentifier;
  encryptedToken: string;
  /** Identifier of the public key used to encrypt the token — key-rotation selector (KSeF API v2.5.0). */
  publicKeyId?: string;
  authorizationPolicy?: AuthorizationPolicy;
}

export type AuthenticationMethod =
  | 'Token'
  | 'TrustedProfile'
  | 'InternalCertificate'
  | 'QualifiedSignature'
  | 'QualifiedSeal'
  | 'PersonalSignature'
  | 'PeppolSignature';
