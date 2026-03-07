import type { InvoiceQueryFilters, InvoiceSubjectType, InvoiceFilterInvoicingMode, FormType, InvoiceType } from '../models/invoices/types.js';

export class InvoiceQueryFilterBuilder {
  private subjectType?: InvoiceSubjectType;
  private dateFrom?: string;
  private dateTo?: string;
  private ksefNumber?: string;
  private invoiceNumber?: string;
  private amountFrom?: number;
  private amountTo?: number;
  private sellerNip?: string;
  private buyerIdentifier?: string;
  private currencyCodes?: string[];
  private invoicingMode?: InvoiceFilterInvoicingMode;
  private isSelfInvoicing?: boolean;
  private formType?: FormType;
  private invoiceTypes?: InvoiceType[];
  private hasAttachment?: boolean;

  withSubjectType(type: InvoiceSubjectType): this {
    this.subjectType = type;
    return this;
  }

  withDateRange(from: string, to: string): this {
    this.dateFrom = from;
    this.dateTo = to;
    return this;
  }

  withKsefNumber(ksefNumber: string): this {
    this.ksefNumber = ksefNumber;
    return this;
  }

  withInvoiceNumber(invoiceNumber: string): this {
    this.invoiceNumber = invoiceNumber;
    return this;
  }

  withAmountRange(from: number, to: number): this {
    this.amountFrom = from;
    this.amountTo = to;
    return this;
  }

  withSellerNip(nip: string): this {
    this.sellerNip = nip;
    return this;
  }

  withBuyerIdentifier(identifier: string): this {
    this.buyerIdentifier = identifier;
    return this;
  }

  withCurrencyCodes(codes: string[]): this {
    this.currencyCodes = codes;
    return this;
  }

  withInvoiceFilterInvoicingMode(mode: InvoiceFilterInvoicingMode): this {
    this.invoicingMode = mode;
    return this;
  }

  withSelfInvoicing(value: boolean): this {
    this.isSelfInvoicing = value;
    return this;
  }

  withFormType(type: FormType): this {
    this.formType = type;
    return this;
  }

  withInvoiceTypes(types: InvoiceType[]): this {
    this.invoiceTypes = types;
    return this;
  }

  withHasAttachment(value: boolean): this {
    this.hasAttachment = value;
    return this;
  }

  build(): InvoiceQueryFilters {
    if (!this.subjectType) {
      throw new Error('Subject type is required');
    }
    if (!this.dateFrom || !this.dateTo) {
      throw new Error('Date range is required');
    }

    return {
      subjectType: this.subjectType,
      dateFrom: this.dateFrom,
      dateTo: this.dateTo,
      ...(this.ksefNumber !== undefined && { ksefNumber: this.ksefNumber }),
      ...(this.invoiceNumber !== undefined && { invoiceNumber: this.invoiceNumber }),
      ...(this.amountFrom !== undefined && { amountFrom: this.amountFrom }),
      ...(this.amountTo !== undefined && { amountTo: this.amountTo }),
      ...(this.sellerNip !== undefined && { sellerNip: this.sellerNip }),
      ...(this.buyerIdentifier !== undefined && { buyerIdentifier: this.buyerIdentifier }),
      ...(this.currencyCodes !== undefined && { currencyCodes: this.currencyCodes }),
      ...(this.invoicingMode !== undefined && { invoicingMode: this.invoicingMode }),
      ...(this.isSelfInvoicing !== undefined && { isSelfInvoicing: this.isSelfInvoicing }),
      ...(this.formType !== undefined && { formType: this.formType }),
      ...(this.invoiceTypes !== undefined && { invoiceTypes: this.invoiceTypes }),
      ...(this.hasAttachment !== undefined && { hasAttachment: this.hasAttachment }),
    };
  }
}
