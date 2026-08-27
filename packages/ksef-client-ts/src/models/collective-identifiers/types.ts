export interface CollectiveIdentifierInvoicePayment {
  amount: number;
  currency: string;
}

export interface CollectiveIdentifierInvoice {
  ksefNumber: string;
  payment?: CollectiveIdentifierInvoicePayment | null;
  description?: string | null;
}

export interface GenerateCollectiveIdentifierRequest {
  invoices: CollectiveIdentifierInvoice[];
}

export interface GenerateCollectiveIdentifierResponse {
  collectiveIdentifierNumber: string;
}

export interface CollectiveIdentifiersQueryRequest {
  collectiveIdentifierNumber?: string | null;
  /** Maximum span between `dateCreatedFrom` and `dateCreatedTo` is 100 days. */
  dateCreatedFrom: string;
  dateCreatedTo: string;
  invoiceCountFrom?: number | null;
  invoiceCountTo?: number | null;
  createdInCurrentContext?: boolean | null;
}

export interface CollectiveIdentifiersQueryResponseItem {
  collectiveIdentifierNumber: string;
  dateCreated: string;
  invoiceCount: number;
  createdInCurrentContext: boolean;
}

export interface CollectiveIdentifiersQueryResponse {
  continuationToken?: string | null;
  collectiveIdentifiers: CollectiveIdentifiersQueryResponseItem[];
}

export interface CollectiveIdentifiersByKsefNumberQueryResponseItem {
  collectiveIdentifierNumber: string;
  createdInCurrentContext: boolean;
  dateCreated: string;
}

export interface CollectiveIdentifiersByKsefNumberQueryResponse {
  continuationToken?: string | null;
  collectiveIdentifiers: CollectiveIdentifiersByKsefNumberQueryResponseItem[];
}

export interface CollectiveIdentifierInvoicesQueryRequest {
  /** Up to 10 identifiers per request. */
  collectiveIdentifierNumbers: string[];
}

export interface CollectiveIdentifierInvoicesQueryResponseItemPayment {
  amount: number;
  currency: string;
}

export interface CollectiveIdentifierInvoicesQueryResponseItem {
  ksefNumber: string;
  /** The identifier this invoice belongs to — a single query may span several. */
  collectiveIdentifierNumber: string;
  /** Omitted when the caller may not see the payment details — see `detailsHidden`. */
  payment?: CollectiveIdentifierInvoicesQueryResponseItemPayment | null;
  description?: string | null;
  /**
   * `true` when payment details exist but are withheld because the caller neither
   * created the identifier nor appears on the invoice. `false` both when the caller
   * may see them and when none were supplied at generation time, so it does not by
   * itself tell you whether `payment` was ever set.
   */
  detailsHidden: boolean;
}

export interface CollectiveIdentifierInvoicesQueryResponse {
  continuationToken?: string | null;
  invoices: CollectiveIdentifierInvoicesQueryResponseItem[];
}
