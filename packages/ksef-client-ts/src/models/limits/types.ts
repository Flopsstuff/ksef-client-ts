/**
 * Value KSeF reports for a rate-limit window that has no limit
 * (e.g. the `perMinute`/`perHour` windows of `anonymous`, or every window of `global`).
 */
export const RATE_LIMIT_UNLIMITED = -1;

/**
 * Request budget of one rate-limit group, per time window.
 *
 * A window set to {@link RATE_LIMIT_UNLIMITED} (`-1`) is not limited — compare
 * against the constant before using the value as a count.
 */
export interface EffectiveApiRateLimitValues {
  perSecond: number;
  perMinute: number;
  perHour: number;
}

export interface EffectiveApiRateLimits {
  /** Opening online (interactive) sessions. */
  onlineSession: EffectiveApiRateLimitValues;
  /** Closing online (interactive) sessions (KSeF API v2.8.0). */
  onlineSessionClose: EffectiveApiRateLimitValues;
  /** Opening batch sessions. */
  batchSession: EffectiveApiRateLimitValues;
  /** Closing batch sessions (KSeF API v2.8.0). */
  batchSessionClose: EffectiveApiRateLimitValues;
  invoiceSend: EffectiveApiRateLimitValues;
  invoiceStatus: EffectiveApiRateLimitValues;
  sessionList: EffectiveApiRateLimitValues;
  sessionInvoiceList: EffectiveApiRateLimitValues;
  sessionMisc: EffectiveApiRateLimitValues;
  invoiceMetadata: EffectiveApiRateLimitValues;
  invoiceExport: EffectiveApiRateLimitValues;
  invoiceExportStatus: EffectiveApiRateLimitValues;
  invoiceDownload: EffectiveApiRateLimitValues;
  collectiveIdentifier: EffectiveApiRateLimitValues;
  other: EffectiveApiRateLimitValues;
  /** Unauthenticated API operations (KSeF API v2.8.0). Some windows may be {@link RATE_LIMIT_UNLIMITED}. */
  anonymous: EffectiveApiRateLimitValues;
  /**
   * Global per-IP limits across all API operations (KSeF API v2.8.0).
   *
   * Reserved for future use: the mechanism is currently disabled and KSeF reports
   * every window as {@link RATE_LIMIT_UNLIMITED}. Do not build logic on these values.
   */
  global: EffectiveApiRateLimitValues;
}

export interface OnlineSessionEffectiveContextLimits {
  maxInvoiceSizeInMB: number;
  maxInvoiceWithAttachmentSizeInMB: number;
  maxInvoices: number;
}

export interface BatchSessionEffectiveContextLimits {
  maxInvoiceSizeInMB: number;
  maxInvoiceWithAttachmentSizeInMB: number;
  maxInvoices: number;
}

export interface CollectiveIdentifierEffectiveContextLimits {
  maxInvoices: number;
}

export interface EffectiveContextLimits {
  onlineSession: OnlineSessionEffectiveContextLimits;
  batchSession: BatchSessionEffectiveContextLimits;
  collectiveIdentifier: CollectiveIdentifierEffectiveContextLimits;
}

export interface EnrollmentEffectiveSubjectLimits {
  maxEnrollments?: number;
}

export interface CertificateEffectiveSubjectLimits {
  maxCertificates?: number;
}

export interface EffectiveSubjectLimits {
  enrollment?: EnrollmentEffectiveSubjectLimits | null;
  certificate?: CertificateEffectiveSubjectLimits | null;
}

// --- Request types (test-data limit overrides) ---

import type { PermissionSubjectIdentifierType } from '../common.js';

export interface ApiRateLimitValuesOverride {
  perSecond: number;
  perMinute: number;
  perHour: number;
}

export interface ApiRateLimitsOverride {
  onlineSession: ApiRateLimitValuesOverride;
  batchSession: ApiRateLimitValuesOverride;
  invoiceSend: ApiRateLimitValuesOverride;
  invoiceStatus: ApiRateLimitValuesOverride;
  sessionList: ApiRateLimitValuesOverride;
  sessionInvoiceList: ApiRateLimitValuesOverride;
  sessionMisc: ApiRateLimitValuesOverride;
  invoiceMetadata: ApiRateLimitValuesOverride;
  invoiceExport: ApiRateLimitValuesOverride;
  invoiceExportStatus: ApiRateLimitValuesOverride;
  invoiceDownload: ApiRateLimitValuesOverride;
  collectiveIdentifier: ApiRateLimitValuesOverride;
  other: ApiRateLimitValuesOverride;
}

export interface OnlineSessionContextLimitsOverride {
  maxInvoiceSizeInMB: number;
  maxInvoiceWithAttachmentSizeInMB: number;
  maxInvoices: number;
}

export interface BatchSessionContextLimitsOverride {
  maxInvoiceSizeInMB: number;
  maxInvoiceWithAttachmentSizeInMB: number;
  maxInvoices: number;
}

export interface CollectiveIdentifierContextLimitsOverride {
  maxInvoices: number;
}

export interface SetSessionLimitsRequest {
  onlineSession: OnlineSessionContextLimitsOverride;
  batchSession: BatchSessionContextLimitsOverride;
  collectiveIdentifier: CollectiveIdentifierContextLimitsOverride;
}

export interface EnrollmentSubjectLimitsOverride {
  maxEnrollments?: number | null;
}

export interface CertificateSubjectLimitsOverride {
  maxCertificates?: number | null;
}

export interface SetSubjectLimitsRequest {
  subjectIdentifierType?: PermissionSubjectIdentifierType;
  enrollment?: EnrollmentSubjectLimitsOverride | null;
  certificate?: CertificateSubjectLimitsOverride | null;
}

export interface SetRateLimitsRequest {
  rateLimits: ApiRateLimitsOverride;
}
