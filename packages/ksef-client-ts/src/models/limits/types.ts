export interface EffectiveApiRateLimitValues {
  perSecond: number;
  perMinute: number;
  perHour: number;
}

export interface EffectiveApiRateLimits {
  onlineSession: EffectiveApiRateLimitValues;
  batchSession: EffectiveApiRateLimitValues;
  invoiceSend: EffectiveApiRateLimitValues;
  invoiceStatus: EffectiveApiRateLimitValues;
  sessionList: EffectiveApiRateLimitValues;
  sessionInvoiceList: EffectiveApiRateLimitValues;
  sessionMisc: EffectiveApiRateLimitValues;
  invoiceMetadata: EffectiveApiRateLimitValues;
  invoiceExport: EffectiveApiRateLimitValues;
  invoiceExportStatus: EffectiveApiRateLimitValues;
  invoiceDownload: EffectiveApiRateLimitValues;
  other: EffectiveApiRateLimitValues;
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

export interface EffectiveContextLimits {
  onlineSession: OnlineSessionEffectiveContextLimits;
  batchSession: BatchSessionEffectiveContextLimits;
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

export interface SetSessionLimitsRequest {
  onlineSession: OnlineSessionContextLimitsOverride;
  batchSession: BatchSessionContextLimitsOverride;
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
