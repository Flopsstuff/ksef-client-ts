// @ts-nocheck
// Generated from KSeF XSD schema — do not edit manually
// Run: yarn generate-schemas
import { z } from 'zod';

const CreditNoteType = z.object({
  "UBLExtensions": z.any().optional(),
  "UBLVersionID": z.any().optional(),
  "CustomizationID": z.any().optional(),
  "ProfileID": z.any().optional(),
  "ProfileExecutionID": z.any().optional(),
  "ID": z.any(),
  "CopyIndicator": z.any().optional(),
  "UUID": z.any().optional(),
  "IssueDate": z.any(),
  "IssueTime": z.any().optional(),
  "TaxPointDate": z.any().optional(),
  "CreditNoteTypeCode": z.any().optional(),
  "Note": z.preprocess(v => Array.isArray(v) ? v : v == null ? [] : [v], z.array(z.any()).min(0)).optional(),
  "DocumentCurrencyCode": z.any().optional(),
  "TaxCurrencyCode": z.any().optional(),
  "PricingCurrencyCode": z.any().optional(),
  "PaymentCurrencyCode": z.any().optional(),
  "PaymentAlternativeCurrencyCode": z.any().optional(),
  "AccountingCostCode": z.any().optional(),
  "AccountingCost": z.any().optional(),
  "LineCountNumeric": z.any().optional(),
  "BuyerReference": z.any().optional(),
  "InvoicePeriod": z.preprocess(v => Array.isArray(v) ? v : v == null ? [] : [v], z.array(z.any()).min(0)).optional(),
  "DiscrepancyResponse": z.preprocess(v => Array.isArray(v) ? v : v == null ? [] : [v], z.array(z.any()).min(0)).optional(),
  "OrderReference": z.any().optional(),
  "BillingReference": z.preprocess(v => Array.isArray(v) ? v : v == null ? [] : [v], z.array(z.any()).min(0)).optional(),
  "DespatchDocumentReference": z.preprocess(v => Array.isArray(v) ? v : v == null ? [] : [v], z.array(z.any()).min(0)).optional(),
  "ReceiptDocumentReference": z.preprocess(v => Array.isArray(v) ? v : v == null ? [] : [v], z.array(z.any()).min(0)).optional(),
  "ContractDocumentReference": z.preprocess(v => Array.isArray(v) ? v : v == null ? [] : [v], z.array(z.any()).min(0)).optional(),
  "AdditionalDocumentReference": z.preprocess(v => Array.isArray(v) ? v : v == null ? [] : [v], z.array(z.any()).min(0)).optional(),
  "StatementDocumentReference": z.preprocess(v => Array.isArray(v) ? v : v == null ? [] : [v], z.array(z.any()).min(0)).optional(),
  "OriginatorDocumentReference": z.preprocess(v => Array.isArray(v) ? v : v == null ? [] : [v], z.array(z.any()).min(0)).optional(),
  "Signature": z.preprocess(v => Array.isArray(v) ? v : v == null ? [] : [v], z.array(z.any()).min(0)).optional(),
  "AccountingSupplierParty": z.any(),
  "AccountingCustomerParty": z.any(),
  "PayeeParty": z.any().optional(),
  "BuyerCustomerParty": z.any().optional(),
  "SellerSupplierParty": z.any().optional(),
  "TaxRepresentativeParty": z.any().optional(),
  "Delivery": z.preprocess(v => Array.isArray(v) ? v : v == null ? [] : [v], z.array(z.any()).min(0)).optional(),
  "DeliveryTerms": z.preprocess(v => Array.isArray(v) ? v : v == null ? [] : [v], z.array(z.any()).min(0)).optional(),
  "PaymentMeans": z.preprocess(v => Array.isArray(v) ? v : v == null ? [] : [v], z.array(z.any()).min(0)).optional(),
  "PaymentTerms": z.preprocess(v => Array.isArray(v) ? v : v == null ? [] : [v], z.array(z.any()).min(0)).optional(),
  "TaxExchangeRate": z.any().optional(),
  "PricingExchangeRate": z.any().optional(),
  "PaymentExchangeRate": z.any().optional(),
  "PaymentAlternativeExchangeRate": z.any().optional(),
  "AllowanceCharge": z.preprocess(v => Array.isArray(v) ? v : v == null ? [] : [v], z.array(z.any()).min(0)).optional(),
  "TaxTotal": z.preprocess(v => Array.isArray(v) ? v : v == null ? [] : [v], z.array(z.any()).min(0)).optional(),
  "LegalMonetaryTotal": z.any(),
  "CreditNoteLine": z.preprocess(v => Array.isArray(v) ? v : v == null ? [] : [v], z.array(z.any()).min(1))
});


export const PEF_KOR3Schema = CreditNoteType;

export type PEF_KOR3 = z.infer<typeof PEF_KOR3Schema>;
