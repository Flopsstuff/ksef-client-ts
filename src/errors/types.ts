export interface ExceptionDetails {
  exceptionCode: number;
  exceptionDescription: string;
  details?: string[];
}

export interface ApiErrorResponse {
  exception?: {
    serviceCtx?: string;
    serviceCode?: string;
    serviceName?: string;
    timestamp?: string;
    referenceNumber?: string;
    exceptionDetailList?: ExceptionDetails[];
  };
}

export interface UnauthorizedProblemDetails {
  title: string;
  status: number;
  detail: string;
  instance?: string;
  traceId?: string;
}

export type ForbiddenReasonCode =
  | 'missing-permissions'
  | 'ip-not-allowed'
  | 'insufficient-resource-access'
  | 'auth-method-not-allowed'
  | 'security-service-blocked';

export interface ForbiddenProblemDetails {
  title: string;
  status: number;
  detail: string;
  instance?: string;
  reasonCode: ForbiddenReasonCode;
  security?: Record<string, unknown>;
  traceId?: string;
}
