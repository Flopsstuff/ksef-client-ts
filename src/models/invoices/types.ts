import type { EncryptionInfo, FormCode, InvoicingMode, OperationStatusInfo } from '../common.js';

export type { InvoicingMode } from '../common.js';

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

/**
 * Invoice subject type — defines the taxpayer's role in the invoice.
 * - `Subject1` — seller (invoices issued by us)
 * - `Subject2` — buyer (invoices received by us)
 * - `Subject3` — third party (e.g. intermediary)
 * - `SubjectAuthorized` — authorized subject acting on behalf of seller/buyer
 */
export type InvoiceSubjectType = 'Subject1' | 'Subject2' | 'Subject3' | 'SubjectAuthorized';

export type InvoiceQueryDateType = 'Issue' | 'Invoicing' | 'PermanentStorage';

export type AmountType = 'Brutto' | 'Netto' | 'Vat';

export type BuyerIdentifierType = 'Nip' | 'VatUe' | 'Other' | 'None';

export type ThirdSubjectIdentifierType = 'Nip' | 'InternalId' | 'VatUe' | 'Other' | 'None';

export type FormType = 'FA' | 'PEF' | 'RR' | 'FA_RR';

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

export interface InvoiceMetadataThirdSubjectIdentifier {
  type: ThirdSubjectIdentifierType;
  value?: string | null;
}

export interface InvoiceMetadataThirdSubject {
  identifier: InvoiceMetadataThirdSubjectIdentifier;
  name?: string | null;
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

export interface QueryInvoicesMetadataResponse {
  hasMore: boolean;
  isTruncated: boolean;
  invoices: InvoiceMetadata[];
  permanentStorageHwmDate?: string;
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export interface InvoiceExportRequest {
  encryption: EncryptionInfo;
  filters: InvoiceQueryFilters;
  onlyMetadata?: boolean;
}

export interface InvoiceExportPackagePart {
  ordinalNumber: number;
  partName: string;
  method: string;
  url: string;
  partSize: number;
  partHash: string;
  encryptedPartSize: number;
  encryptedPartHash: string;
  expirationDate: string;
}

export interface InvoiceExportPackage {
  invoiceCount: number;
  size: number;
  parts: InvoiceExportPackagePart[];
  isTruncated: boolean;
  lastIssueDate?: string;
  lastInvoicingDate?: string;
  lastPermanentStorageDate?: string;
  permanentStorageHwmDate?: string;
}

export interface InvoiceExportStatusResponse {
  status: OperationStatusInfo;
  completedDate?: string;
  packageExpirationDate?: string;
  package?: InvoiceExportPackage;
}
