import { describe, it, expect } from 'vitest';
import { InvoiceQueryFilterBuilder } from '../../../src/builders/invoice-query-filter.js';
import { KSeFValidationError } from '../../../src/errors/index.js';

describe('InvoiceQueryFilterBuilder', () => {
  const validBuilder = () =>
    new InvoiceQueryFilterBuilder()
      .withSubjectType('Subject1')
      .withDateRange('InvoicingDate', '2025-01-01', '2025-12-31');

  it('should build minimal valid filter', () => {
    const filter = validBuilder().build();
    expect(filter).toEqual({
      subjectType: 'Subject1',
      dateRange: { dateType: 'InvoicingDate', from: '2025-01-01', to: '2025-12-31' },
    });
  });

  it('should build date range without to', () => {
    const filter = new InvoiceQueryFilterBuilder()
      .withSubjectType('Subject1')
      .withDateRange('InvoicingDate', '2025-01-01')
      .build();
    expect(filter.dateRange).toEqual({ dateType: 'InvoicingDate', from: '2025-01-01' });
  });

  it('should build restricted date range without to', () => {
    const filter = new InvoiceQueryFilterBuilder()
      .withSubjectType('Subject1')
      .withDateRangeRestricted('InvoicingDate', '2025-01-01')
      .build();
    expect(filter.dateRange).toEqual({
      dateType: 'InvoicingDate',
      from: '2025-01-01',
      restrictToPermanentStorageHwmDate: true,
    });
  });

  it('should build restricted date range with to', () => {
    const filter = new InvoiceQueryFilterBuilder()
      .withSubjectType('Subject1')
      .withDateRangeRestricted('InvoicingDate', '2025-01-01', '2025-12-31')
      .build();
    expect(filter.dateRange).toEqual({
      dateType: 'InvoicingDate',
      from: '2025-01-01',
      to: '2025-12-31',
      restrictToPermanentStorageHwmDate: true,
    });
  });

  it('should include all optional fields', () => {
    const filter = validBuilder()
      .withKsefNumber('1234567890-20250101-ABC123-45')
      .withInvoiceNumber('FV/2025/001')
      .withAmount('Gross', 100, 500)
      .withSellerNip('1234567890')
      .withBuyerIdentifier('Nip', '0987654321')
      .withCurrencyCodes(['PLN', 'EUR'])
      .withInvoicingMode('Online')
      .withSelfInvoicing(true)
      .withFormType('FA')
      .withInvoiceTypes(['Invoice', 'CorrectionInvoice'])
      .withHasAttachment(false)
      .build();

    expect(filter.ksefNumber).toBe('1234567890-20250101-ABC123-45');
    expect(filter.invoiceNumber).toBe('FV/2025/001');
    expect(filter.amount).toEqual({ type: 'Gross', from: 100, to: 500 });
    expect(filter.sellerNip).toBe('1234567890');
    expect(filter.buyerIdentifier).toEqual({ type: 'Nip', value: '0987654321' });
    expect(filter.currencyCodes).toEqual(['PLN', 'EUR']);
    expect(filter.invoicingMode).toBe('Online');
    expect(filter.isSelfInvoicing).toBe(true);
    expect(filter.formType).toBe('FA');
    expect(filter.invoiceTypes).toEqual(['Invoice', 'CorrectionInvoice']);
    expect(filter.hasAttachment).toBe(false);
  });

  it('accepts negative amounts in withAmount (KSeF API v2.3.0)', () => {
    const bothNegative = validBuilder().withAmount('Brutto', -500, -100).build();
    expect(bothNegative.amount).toEqual({ type: 'Brutto', from: -500, to: -100 });

    const straddling = validBuilder().withAmount('Netto', -100, 500).build();
    expect(straddling.amount).toEqual({ type: 'Netto', from: -100, to: 500 });

    const onlyNegativeTo = validBuilder().withAmount('Vat', undefined, -1).build();
    expect(onlyNegativeTo.amount).toEqual({ type: 'Vat', to: -1 });
  });

  it('should throw KSeFValidationError when subject type missing', () => {
    const builder = new InvoiceQueryFilterBuilder()
      .withDateRange('InvoicingDate', '2025-01-01');
    expect(() => builder.build()).toThrow(KSeFValidationError);
    expect(() => builder.build()).toThrow('Subject type is required');
  });

  it('should throw KSeFValidationError when date range missing', () => {
    const builder = new InvoiceQueryFilterBuilder()
      .withSubjectType('Subject1');
    expect(() => builder.build()).toThrow(KSeFValidationError);
    expect(() => builder.build()).toThrow('Date range is required');
  });
});
