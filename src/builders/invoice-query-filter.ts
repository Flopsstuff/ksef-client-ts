import { KSeFValidationError } from '../errors/ksef-validation-error.js';
import type {
  InvoiceQueryFilters,
  InvoiceSubjectType,
  InvoiceQueryDateRange,
  InvoiceQueryDateType,
  InvoiceQueryAmount,
  AmountType,
  InvoiceQueryBuyerIdentifier,
  BuyerIdentifierType,
  InvoicingMode,
  FormType,
  InvoiceType,
} from '../models/invoices/types.js';

export class InvoiceQueryFilterBuilder {
  private subjectType?: InvoiceSubjectType;
  private dateRange?: InvoiceQueryDateRange;
  private ksefNumber?: string;
  private invoiceNumber?: string;
  private amount?: InvoiceQueryAmount;
  private sellerNip?: string;
  private buyerIdentifier?: InvoiceQueryBuyerIdentifier;
  private currencyCodes?: string[];
  private invoicingMode?: InvoicingMode;
  private isSelfInvoicing?: boolean;
  private formType?: FormType;
  private invoiceTypes?: InvoiceType[];
  private hasAttachment?: boolean;

  withSubjectType(type: InvoiceSubjectType): this {
    this.subjectType = type;
    return this;
  }

  withDateRange(dateType: InvoiceQueryDateType, from: string, to?: string): this {
    this.dateRange = { dateType, from, ...(to !== undefined && { to }) };
    return this;
  }

  withDateRangeRestricted(dateType: InvoiceQueryDateType, from: string, to?: string): this {
    this.dateRange = { dateType, from, ...(to !== undefined && { to }), restrictToPermanentStorageHwmDate: true };
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

  withAmount(type: AmountType, from?: number, to?: number): this {
    this.amount = { type, ...(from !== undefined && { from }), ...(to !== undefined && { to }) };
    return this;
  }

  withSellerNip(nip: string): this {
    this.sellerNip = nip;
    return this;
  }

  withBuyerIdentifier(type: BuyerIdentifierType, value?: string): this {
    this.buyerIdentifier = { type, ...(value !== undefined && { value }) };
    return this;
  }

  withCurrencyCodes(codes: string[]): this {
    this.currencyCodes = codes;
    return this;
  }

  withInvoicingMode(mode: InvoicingMode): this {
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
      throw KSeFValidationError.fromField('subjectType', 'Subject type is required');
    }
    if (!this.dateRange) {
      throw KSeFValidationError.fromField('dateRange', 'Date range is required');
    }

    return {
      subjectType: this.subjectType,
      dateRange: this.dateRange,
      ...(this.ksefNumber !== undefined && { ksefNumber: this.ksefNumber }),
      ...(this.invoiceNumber !== undefined && { invoiceNumber: this.invoiceNumber }),
      ...(this.amount !== undefined && { amount: this.amount }),
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
