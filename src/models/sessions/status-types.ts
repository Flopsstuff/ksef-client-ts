import type { OperationStatusInfo, SessionStatus } from '../common.js';

export interface SessionsFilter {
  referenceNumber?: string;
  dateCreatedFrom?: string;
  dateCreatedTo?: string;
  dateClosedFrom?: string;
  dateClosedTo?: string;
  dateModifiedFrom?: string;
  dateModifiedTo?: string;
  statuses?: SessionStatus[];
}

export interface Session {
  referenceNumber: string;
  status: OperationStatusInfo;
  dateCreated: string;
  dateUpdated: string;
  validUntil: string;
  totalInvoiceCount: number;
  successfulInvoiceCount: number;
  failedInvoiceCount: number;
}

export interface SessionsListResponse {
  continuationToken?: string;
  sessions: Session[];
}

export interface UpoPage {
  referenceNumber: string;
  downloadUrl: string;
  downloadUrlExpirationDate: string;
}

export interface UpoResponse {
  pages: UpoPage[];
}

export interface SessionStatusResponse {
  status: OperationStatusInfo;
  upo?: UpoResponse;
  invoiceCount?: number;
  successfulInvoiceCount?: number;
  failedInvoiceCount?: number;
  validUntil?: string;
  dateCreated: string;
  dateUpdated: string;
}

export type InvoicingMode = 'Online' | 'Offline';

export interface InvoiceStatusInfo {
  code: number;
  description: string;
  details?: string[];
  extensions?: Record<string, string>;
}

export interface SessionInvoice {
  ordinalNumber: number;
  invoiceNumber?: string;
  ksefNumber?: string;
  referenceNumber?: string;
  invoiceHash?: string;
  invoiceFileName?: string;
  acquisitionDate?: string;
  invoicingDate: string;
  permanentStorageDate?: string;
  upoDownloadUrl?: string;
  status: InvoiceStatusInfo;
  invoicingMode: InvoicingMode;
  upoDownloadUrlExpirationDate?: string;
}

export interface SessionInvoicesResponse {
  continuationToken?: string;
  invoices: SessionInvoice[];
}
