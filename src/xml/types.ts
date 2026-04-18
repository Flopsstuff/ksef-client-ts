export type XmlValue = string | number | boolean | null | XmlObject | XmlValue[];

export type XmlObject = { [key: string]: XmlValue };

export type XmlDocument = Array<Record<string, unknown>>;

export type FakturaSchema = 'FA2' | 'FA3';

export type PefSchema = 'PEF' | 'PEF_KOR';

export type InvoiceSchema = FakturaSchema | PefSchema;

export interface FakturaInput {
  Naglowek: XmlObject;
  Podmiot1?: XmlObject;
  Podmiot2?: XmlObject;
  Podmiot3?: XmlObject;
  Fa: XmlObject;
  Stopka?: XmlObject;
  [key: string]: XmlValue | undefined;
}

export interface PefUblInvoiceInput {
  schema?: 'PEF';
  Invoice: XmlObject;
}

export interface PefUblCreditNoteInput {
  schema?: 'PEF_KOR';
  CreditNote: XmlObject;
}

export type PefUblDocumentInput = PefUblInvoiceInput | PefUblCreditNoteInput;

export interface SerializeInvoiceOptions {
  schema?: InvoiceSchema;
  fakturaNamespace?: string;
  etdNamespace?: string;
  pretty?: boolean;
}

export type InvoiceSerializerInput =
  | string
  | Buffer
  | XmlDocument
  | XmlObject
  | FakturaInput
  | PefUblDocumentInput;
