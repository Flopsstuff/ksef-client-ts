import type { EncryptionInfo, FormCode, InvoicingMode } from '../common.js';

export type { InvoicingMode } from '../common.js';

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export type InvoiceSubjectType = 'Subject1' | 'Subject2' | 'Subject3' | 'SubjectAuthorized';

export type InvoiceQueryDateType = 'Issue' | 'Invoicing' | 'PermanentStorage';

export type AmountType = 'Brutto' | 'Netto' | 'Vat';

export type BuyerIdentifierType = 'Nip' | 'VatUe' | 'Other' | 'None';

export type FormType = 'FA' | 'PEF' | 'RR';

export type InvoiceType =
  | 'Vat' | 'Zal' | 'Kor' | 'Roz' | 'Upr' | 'KorZal' | 'KorRoz'
  | 'VatPef' | 'VatPefSp' | 'KorPef'
  | 'VatRr' | 'KorVatRr';

// ---------------------------------------------------------------------------
// Query filter sub-objects
// ---------------------------------------------------------------------------

export interface InvoiceQueryDateRange {
  dateType: InvoiceQueryDateType;
  from: string;
  to?: string;
  restrictToPermanentStorageHwmDate?: boolean;
}

export interface InvoiceQueryAmount {
  type: AmountType;
  from?: number;
  to?: number;
}

export interface InvoiceQueryBuyerIdentifier {
  type: BuyerIdentifierType;
  value?: string;
}

// ---------------------------------------------------------------------------
// Query filters (request body for POST /invoices/query/metadata)
// ---------------------------------------------------------------------------

export interface InvoiceQueryFilters {
  subjectType: InvoiceSubjectType;
  dateRange: InvoiceQueryDateRange;
  ksefNumber?: string;
  invoiceNumber?: string;
  amount?: InvoiceQueryAmount;
  sellerNip?: string;
  buyerIdentifier?: InvoiceQueryBuyerIdentifier;
  currencyCodes?: string[];
  invoicingMode?: InvoicingMode;
  isSelfInvoicing?: boolean;
  formType?: FormType;
  invoiceTypes?: InvoiceType[];
  hasAttachment?: boolean;
}

// ---------------------------------------------------------------------------
// Invoice metadata (response item from query/metadata and exports)
// ---------------------------------------------------------------------------

export interface InvoiceMetadataSeller {
  nip: string;
  name?: string;
}

export interface InvoiceMetadataBuyerIdentifier {
  type: BuyerIdentifierType;
  value?: string;
}

export interface InvoiceMetadataBuyer {
  identifier: InvoiceMetadataBuyerIdentifier;
  name?: string;
}

export interface InvoiceMetadataThirdSubject {
  identifier: InvoiceMetadataBuyerIdentifier;
  name?: string;
  role: number;
}

export interface InvoiceMetadataAuthorizedSubject {
  nip: string;
  name?: string;
  role: number;
}

export interface InvoiceMetadata {
  ksefNumber: string;
  invoiceNumber: string;
  issueDate: string;
  invoicingDate: string;
  acquisitionDate: string;
  permanentStorageDate: string;
  seller: InvoiceMetadataSeller;
  buyer: InvoiceMetadataBuyer;
  netAmount: number;
  grossAmount: number;
  vatAmount: number;
  currency: string;
  invoicingMode: InvoicingMode;
  invoiceType: InvoiceType;
  formCode: FormCode;
  isSelfInvoicing: boolean;
  hasAttachment: boolean;
  invoiceHash: string;
  hashOfCorrectedInvoice?: string;
  thirdSubjects?: InvoiceMetadataThirdSubject[];
  authorizedSubject?: InvoiceMetadataAuthorizedSubject;
}

// ---------------------------------------------------------------------------
// Query response
// ---------------------------------------------------------------------------

export interface PagedInvoiceResponse {
  hasMore: boolean;
  isTruncated: boolean;
  invoices: InvoiceMetadata[];
  permanentStorageHwmDate?: string;
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

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
