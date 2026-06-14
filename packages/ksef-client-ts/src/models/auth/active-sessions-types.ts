import type { OperationStatusInfo } from '../common.js';
import type { AuthenticationMethod, AuthenticationMethodInfo } from './types.js';

export interface AuthSessionInfo {
  startDate: string;
  authenticationMethodInfo: AuthenticationMethodInfo;
  /** @deprecated Required by spec but deprecated. */
  authenticationMethod: AuthenticationMethod;
  status: OperationStatusInfo;
  isTokenRedeemed?: boolean | null;
  lastTokenRefreshDate?: string | null;
  refreshTokenValidUntil?: string | null;
  referenceNumber: string;
  isCurrent: boolean;
}

export interface AuthenticationListResponse {
  continuationToken?: string | null;
  items: AuthSessionInfo[];
}
