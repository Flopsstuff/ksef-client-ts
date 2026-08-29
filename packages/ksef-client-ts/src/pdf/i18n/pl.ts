import type { LabelBundle } from './types.js';

/** Polish label bundle (canonical key set). */
export const pl: LabelBundle = {
  invoice: 'Faktura',
  duplicate: 'Duplikat',
  seller: 'Sprzedawca',
  buyer: 'Nabywca',
  address: 'Adres',
  contact: 'Dane kontaktowe',
  issueDate: 'Data wystawienia',
  invoiceNumber: 'Numer faktury',
  ksefNumber: 'Numer KSeF',
  offline: 'OFFLINE',
  // line-item columns
  lp: 'Lp.',
  name: 'Nazwa',
  unit: 'j.m.',
  qty: 'Ilość',
  unitPrice: 'Cena netto',
  vatRate: 'Stawka VAT',
  net: 'Wartość netto',
  vat: 'Kwota VAT',
  gross: 'Wartość brutto',
  // totals
  totalNet: 'Razem netto',
  totalVat: 'Razem VAT',
  totalDue: 'Do zapłaty',
  // payment
  payment: 'Płatność',
  paid: 'Zapłacono',
  paymentDate: 'Termin płatności',
  paymentMethod: 'Forma płatności',
  bankAccounts: 'Rachunek bankowy',
  bankAccount: 'Numer rachunku',
  swift: 'Kod SWIFT',
  bankName: 'Nazwa banku',
  // annotations
  annotations: 'Adnotacje',
  // upo
  upoTitle: 'Urzędowe Poświadczenie Odbioru (UPO)',
  ksefDocNumber: 'Numer KSeF dokumentu',
  sessionRef: 'Numer referencyjny sesji',
  receiptDate: 'Data nadania numeru KSeF',
  documentHash: 'Skrót dokumentu',
  documents: 'Dokumenty',
  // footer
  page: 'Strona',
  of: 'z',
};
