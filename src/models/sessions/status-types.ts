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

export interface SessionsQueryResponseItem {
  referenceNumber: string;
  status: OperationStatusInfo;
  dateCreated: string;
  dateUpdated: string;
  validUntil: string;
  totalInvoiceCount: number;
  successfulInvoiceCount: number;
  failedInvoiceCount: number;
}

export interface SessionsQueryResponse {
  continuationToken?: string;
  sessions: SessionsQueryResponseItem[];
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

export type { InvoicingMode } from '../common.js';
import type { InvoicingMode } from '../common.js';

export interface InvoiceStatusInfo {
  code: number;
  description: string;
  details?: string[];
  extensions?: Record<string, string>;
}

export interface SessionInvoiceStatusResponse {
  ordinalNumber: number;
  invoiceNumber?: string;
  ksefNumber?: string;
  referenceNumber: string;
  invoiceHash: string;
  invoiceFileName?: string;
  acquisitionDate?: string;
  invoicingDate: string;
  permanentStorageDate?: string;
  upoDownloadUrl?: string;
  status: InvoiceStatusInfo;
  invoicingMode?: InvoicingMode | null;
  upoDownloadUrlExpirationDate?: string;
}

export interface SessionInvoicesResponse {
  continuationToken?: string;
  invoices: SessionInvoiceStatusResponse[];
}

export interface UpoResult {
  upo: string;
  hash?: string;
}
