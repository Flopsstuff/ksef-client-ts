export interface ExceptionDetail {
  exceptionDetailCode: number;
  exceptionDescription: string;
}

export interface ApiErrorResponse {
  exception?: {
    serviceCtx?: string;
    serviceCode?: string;
    serviceName?: string;
    timestamp?: string;
    referenceNumber?: string;
    exceptionDetailList?: ExceptionDetail[];
  };
}
