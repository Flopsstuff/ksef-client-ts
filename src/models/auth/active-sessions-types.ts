import type { OperationStatusInfo } from '../common.js';
import type { AuthenticationMethodInfo } from './types.js';

export interface AuthSessionInfo {
  startDate: string;
  authenticationMethodInfo: AuthenticationMethodInfo;
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
