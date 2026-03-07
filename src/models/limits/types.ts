export interface EffectiveApiRateLimitValues {
  maxCallsPerInterval: number;
  intervalMs: number;
}

export interface EffectiveApiRateLimits {
  authChallenge: EffectiveApiRateLimitValues;
  authToken: EffectiveApiRateLimitValues;
  sessionOpen: EffectiveApiRateLimitValues;
  sessionClose: EffectiveApiRateLimitValues;
  invoiceSend: EffectiveApiRateLimitValues;
  invoiceQuery: EffectiveApiRateLimitValues;
  invoiceExport: EffectiveApiRateLimitValues;
  permissionsGrant: EffectiveApiRateLimitValues;
  permissionsQuery: EffectiveApiRateLimitValues;
  tokensGenerate: EffectiveApiRateLimitValues;
  certificatesEnroll: EffectiveApiRateLimitValues;
  other: EffectiveApiRateLimitValues;
}

export interface SessionLimits {
  maxInvoicesPerSession: number;
  maxSessionDurationMinutes: number;
}

export interface SessionLimitsInCurrentContextResponse {
  sessionLimits: SessionLimits;
}

export interface CertificatesLimitInCurrentSubjectResponse {
  limit: number;
  used: number;
  available: number;
}
