export {
  parseUpoXml,
  type UpoPotwierdzenie,
  type UpoContextId,
  type UpoAuthProof,
  type UpoUwierzytelnienie,
  type UpoOpisPotwierdzenia,
  type UpoDokument,
} from './upo-parser.js';

export { extractInvoiceFields, type InvoiceFields } from './invoice-field-extractor.js';

// ── Invoice XML serialization ──────────────────────────────────────────

export type {
  XmlValue,
  XmlObject,
  XmlDocument,
  FakturaSchema,
  PefSchema,
  InvoiceSchema,
  FakturaInput,
  PefUblInvoiceInput,
  PefUblCreditNoteInput,
  PefUblDocumentInput,
  SerializeInvoiceOptions,
  InvoiceSerializerInput,
} from './types.js';

export { parseXml, buildXml, buildXmlFromObject, stripBom } from './xml-engine.js';

export { ORDER_MAP, comparePKey, orderXmlObject } from './order-map.js';

export {
  buildFakturaXml,
  isFakturaInput,
  isFormCodeShape,
  toKodFormularza,
  FAKTURA_NAMESPACE,
  ETD_NAMESPACE,
  type BuildFakturaOptions,
} from './faktura-builder.js';

export {
  buildPefXml,
  isPefUblDocumentInput,
  PEF_NAMESPACE,
  type BuildPefOptions,
} from './pef-builder.js';

export { serializeInvoiceXml, buildRawXmlObject } from './invoice-serializer.js';
