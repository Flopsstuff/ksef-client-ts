import type { OperationStatusInfo } from '../common.js';
import type { AuthenticationMethodInfo } from './types.js';

export interface AuthSessionInfo {
  startDate: string;
  authenticationMethodInfo: AuthenticationMethodInfo;
  /** @deprecated Required by spec but deprecated. */
  authenticationMethod?: string;
  status: OperationStatusInfo;
  isTokenRedeemed?: boolean;
  lastTokenRefreshDate?: string;
  refreshTokenValidUntil?: string;
  referenceNumber: string;
  isCurrent: boolean;
}

export interface AuthenticationListResponse {
  continuationToken?: string;
  items: AuthSessionInfo[];
}
