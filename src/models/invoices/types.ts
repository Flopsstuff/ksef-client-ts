import type { EncryptionInfo } from '../common.js';

export type InvoiceSubjectType = 'Subject1' | 'Subject2' | 'Subject3' | 'SubjectAuthorized';

export type InvoiceFilterInvoicingMode = 'Standalone' | 'SelfInvoicing' | 'DomesticReverse' | 'Triangular';

export type FormType = 'FA' | 'PEF' | 'RR';

export type InvoiceType =
  | 'VAT' | 'COR' | 'ZAL' | 'ROZ' | 'UPR' | 'KOR'
  | 'KOR_ZAL' | 'KOR_ROZ';

export interface InvoiceQueryFilters {
  subjectType: InvoiceSubjectType;
  dateFrom: string;
  dateTo: string;
  ksefNumber?: string;
  invoiceNumber?: string;
  amountFrom?: number;
  amountTo?: number;
  sellerNip?: string;
  buyerIdentifier?: string;
  currencyCodes?: string[];
  invoicingMode?: InvoiceFilterInvoicingMode;
  isSelfInvoicing?: boolean;
  formType?: FormType;
  invoiceTypes?: InvoiceType[];
  hasAttachment?: boolean;
}

export interface InvoiceSummary {
  ksefNumber: string;
  invoiceNumber: string;
  invoiceReferenceNumber: string;
  formCode: string;
  schemaVersion: string;
  sellerNip: string;
  buyerIdentifier?: string;
  totalAmount: number;
  currencyCode: string;
  invoicingDate: string;
  acquisitionTimestamp: string;
  hasAttachment: boolean;
}

export interface PagedInvoiceResponse {
  hasMore: boolean;
  isTruncated: boolean;
  invoices: InvoiceSummary[];
  permanentStorageHwmDate?: string;
}

export interface InvoiceExportRequest {
  encryptionInfo: EncryptionInfo;
  filters: InvoiceQueryFilters;
}

export interface InvoiceExportPackage {
  partNumber: number;
  totalParts: number;
  url: string;
}

export interface InvoiceExportStatusResponse {
  processingCode: number;
  processingDescription: string;
  packages?: InvoiceExportPackage[];
}
