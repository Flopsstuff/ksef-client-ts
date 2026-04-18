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
  timestamp?: string;
}

export type ForbiddenReasonCode =
  | 'missing-permissions'
  | 'ip-not-allowed'
  | 'insufficient-resource-access'
  | 'auth-method-not-allowed'
  | 'security-service-blocked'
  | 'context-type-not-allowed'
  | (string & {});

export interface ForbiddenSecurityInfo {
  requiredAnyOfPermissions?: string[];
  presentPermissions?: string[];
}

export interface ForbiddenProblemDetails {
  title: string;
  status: number;
  detail: string;
  instance?: string;
  reasonCode: ForbiddenReasonCode;
  security?: ForbiddenSecurityInfo & Record<string, unknown>;
  traceId?: string;
  timestamp?: string;
}

export interface GoneProblemDetails {
  title: string;
  status: number;
  detail: string;
  instance?: string;
  traceId?: string;
  timestamp?: string;
}

export interface BadRequestErrorDetail {
  code: number;
  description: string;
  details: string[];
}

export interface BadRequestProblemDetails {
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  errors: BadRequestErrorDetail[];
  timestamp?: string;
  traceId?: string;
}

export interface TooManyRequestsProblemDetails {
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  timestamp?: string;
  traceId?: string;
}
