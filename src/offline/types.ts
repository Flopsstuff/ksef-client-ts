import type { ContextIdentifier } from '../models/common.js';

/** Offline invoice modes per KSeF docs (art. 106nda/106nh/106nf) */
export type OfflineMode = 'offline24' | 'offline' | 'awaryjny' | 'awaria_calkowita';

/** Why this invoice was issued offline */
export type OfflineReason = 'PLANNED' | 'SYSTEM_UNAVAILABLE' | 'EMERGENCY' | 'TOTAL_FAILURE';

/**
 * Offline invoice lifecycle state machine:
 * GENERATED → QUEUED → SUBMITTED → ACCEPTED | REJECTED
 * Any non-terminal → EXPIRED
 */
export type OfflineInvoiceStatus =
  | 'GENERATED'
  | 'QUEUED'
  | 'SUBMITTED'
  | 'ACCEPTED'
  | 'REJECTED'
  | 'CORRECTED'
  | 'EXPIRED';

export interface OfflineInvoiceInputData {
  invoiceNumber: string;
  invoiceDate: string;
  invoiceXml: string;
  sellerNip: string;
  sellerIdentifier: ContextIdentifier;
  buyerIdentifier?: ContextIdentifier;
  totalAmount?: number;
  currency?: string;
}

export interface OfflineCertificate {
  privateKeyPem: string;
  certificateSerial: string;
  password?: string;
}

export interface MaintenanceWindow {
  id: string;
  startTime: string;
  endTime?: string;
  active: boolean;
  planned: boolean;
  reason?: string;
}

export interface OfflineInvoiceMetadata {
  id: string;
  mode: OfflineMode;
  reason: OfflineReason;
  status: OfflineInvoiceStatus;

  invoiceNumber: string;
  invoiceDate: string;
  // TODO(perf): invoiceXml stored inline means list() loads all XML into memory.
  // For large-scale use, consider lazy-loading XML from separate files.
  invoiceXml: string;
  sellerNip: string;
  sellerIdentifier: ContextIdentifier;
  buyerIdentifier?: ContextIdentifier;
  totalAmount?: number;
  currency?: string;

  kod1Url: string;
  kod2Url?: string;

  generatedAt: string;
  submitBy: string;
  submittedAt?: string;
  acceptedAt?: string;

  ksefReferenceNumber?: string;
  error?: { code: number; message: string; details?: string[] };

  maintenanceWindowId?: string;
  correctedInvoiceId?: string;
  correctedBy?: string;
}

export interface OfflineInvoiceOptions {
  mode?: OfflineMode;
  certificate?: OfflineCertificate;
  maintenanceWindow?: MaintenanceWindow;
  customDeadline?: Date | string;
  storage?: import('./storage.js').OfflineInvoiceStorage;
}

export interface OfflineBatchResult {
  total: number;
  submitted: number;
  accepted: number;
  rejected: number;
  failed: number;
  expired: number;
  results: OfflineSubmissionResult[];
}

export interface OfflineSubmissionResult {
  invoiceId: string;
  invoiceNumber: string;
  status: OfflineInvoiceStatus;
  ksefReferenceNumber?: string;
  error?: { code: number; message: string; details?: string[] };
}
