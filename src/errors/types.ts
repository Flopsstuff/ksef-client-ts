export interface ExceptionDetails {
  exceptionCode?: number;
  exceptionDescription?: string | null;
  details?: string[] | null;
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

export interface TooManyRequestsStatus {
  code: number;
  description: string;
  details: string[];
}

export interface TooManyRequestsResponse {
  status: TooManyRequestsStatus;
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
  | 'security-service-blocked'
  | 'context-type-not-allowed'
  | (string & {});

export interface ForbiddenProblemDetails {
  title: string;
  status: number;
  detail: string;
  instance?: string;
  reasonCode: ForbiddenReasonCode;
  security?: Record<string, unknown>;
  traceId?: string;
}

export interface GoneProblemDetails {
  title: string;
  status: number;
  detail: string;
  instance?: string;
  traceId?: string;
  timestamp?: string;
}
