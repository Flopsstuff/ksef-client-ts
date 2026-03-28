import { XMLParser } from 'fast-xml-parser';
import { KSeFValidationError } from '../errors/ksef-validation-error.js';

// ── Discriminated union types ──────────────────────────────────────────

export type UpoContextId =
  | { kind: 'Nip'; nip: string }
  | { kind: 'IdWewnetrzny'; idWewnetrzny: string }
  | { kind: 'IdZlozonyVatUE'; idZlozonyVatUE: string }
  | { kind: 'IdDostawcyUslugPeppol'; idDostawcyUslugPeppol: string };

export type UpoAuthProof =
  | { kind: 'NumerReferencyjnyTokenaKSeF'; numerReferencyjnyTokenaKSeF: string }
  | { kind: 'SkrotDokumentuUwierzytelniajacego'; skrotDokumentuUwierzytelniajacego: string };

// ── Interfaces ─────────────────────────────────────────────────────────

export interface UpoUwierzytelnienie {
  idKontekstu: UpoContextId;
  proof: UpoAuthProof;
}

export interface UpoOpisPotwierdzenia {
  strona: number;
  liczbaStron: number;
  zakresDokumentowOd: number;
  zakresDokumentowDo: number;
  calkowitaLiczbaDokumentow: number;
}

export interface UpoDokument {
  nipSprzedawcy: string;
  numerKSeFDokumentu: string;
  numerFaktury: string;
  dataWystawieniaFaktury: string;
  dataPrzeslaniaDokumentu: string;
  dataNadaniaNumeruKSeF: string;
  skrotDokumentu: string;
  trybWysylki: string;
}

export interface UpoPotwierdzenie {
  nazwaPodmiotuPrzyjmujacego: string;
  numerReferencyjnySesji: string;
  uwierzytelnienie: UpoUwierzytelnienie;
  opisPotwierdzenia?: UpoOpisPotwierdzenia;
  nazwaStrukturyLogicznej: string;
  kodFormularza: string;
  dokumenty: UpoDokument[];
}

// ── Validation helpers ─────────────────────────────────────────────────

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireRecord(value: unknown, at: string): UnknownRecord {
  if (!isRecord(value)) {
    throw KSeFValidationError.fromField(at, `Expected object at ${at}`);
  }
  return value;
}

function requireString(value: unknown, at: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw KSeFValidationError.fromField(at, `Expected non-empty string at ${at}`);
  }
  return value;
}

function optionalRecord(value: unknown): UnknownRecord | undefined {
  return isRecord(value) ? value : undefined;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function requireNumberFromString(value: unknown, at: string): number {
  const raw = requireString(value, at);
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) {
    throw KSeFValidationError.fromField(at, `Expected integer at ${at}, got "${raw}"`);
  }
  return parsed;
}

function ensureArray<T>(value: T | T[] | undefined): T[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

// ── Internal parsers ───────────────────────────────────────────────────

function parseIdKontekstu(obj: UnknownRecord): UpoContextId {
  const nip = optionalString(obj.Nip);
  if (nip) return { kind: 'Nip', nip };

  const idWewnetrzny = optionalString(obj.IdWewnetrzny);
  if (idWewnetrzny) return { kind: 'IdWewnetrzny', idWewnetrzny };

  const idZlozonyVatUE = optionalString(obj.IdZlozonyVatUE);
  if (idZlozonyVatUE) return { kind: 'IdZlozonyVatUE', idZlozonyVatUE };

  const idDostawcyUslugPeppol = optionalString(obj.IdDostawcyUslugPeppol);
  if (idDostawcyUslugPeppol) return { kind: 'IdDostawcyUslugPeppol', idDostawcyUslugPeppol };

  throw KSeFValidationError.fromField(
    'Uwierzytelnienie.IdKontekstu',
    'Unsupported context identifier. Expected Nip | IdWewnetrzny | IdZlozonyVatUE | IdDostawcyUslugPeppol',
  );
}

function parseProof(obj: UnknownRecord): UpoAuthProof {
  const tokenRef = optionalString(obj.NumerReferencyjnyTokenaKSeF);
  if (tokenRef) return { kind: 'NumerReferencyjnyTokenaKSeF', numerReferencyjnyTokenaKSeF: tokenRef };

  const docHash = optionalString(obj.SkrotDokumentuUwierzytelniajacego);
  if (docHash) return { kind: 'SkrotDokumentuUwierzytelniajacego', skrotDokumentuUwierzytelniajacego: docHash };

  throw KSeFValidationError.fromField(
    'Uwierzytelnienie',
    'Unsupported auth proof. Expected NumerReferencyjnyTokenaKSeF | SkrotDokumentuUwierzytelniajacego',
  );
}

function parseUwierzytelnienie(obj: UnknownRecord): UpoUwierzytelnienie {
  const idKontekstu = parseIdKontekstu(
    requireRecord(obj.IdKontekstu, 'Uwierzytelnienie.IdKontekstu'),
  );
  const proof = parseProof(obj);
  return { idKontekstu, proof };
}

function parseOpisPotwierdzenia(obj: UnknownRecord): UpoOpisPotwierdzenia {
  return {
    strona: requireNumberFromString(obj.Strona, 'OpisPotwierdzenia.Strona'),
    liczbaStron: requireNumberFromString(obj.LiczbaStron, 'OpisPotwierdzenia.LiczbaStron'),
    zakresDokumentowOd: requireNumberFromString(obj.ZakresDokumentowOd, 'OpisPotwierdzenia.ZakresDokumentowOd'),
    zakresDokumentowDo: requireNumberFromString(obj.ZakresDokumentowDo, 'OpisPotwierdzenia.ZakresDokumentowDo'),
    calkowitaLiczbaDokumentow: requireNumberFromString(obj.CalkowitaLiczbaDokumentow, 'OpisPotwierdzenia.CalkowitaLiczbaDokumentow'),
  };
}

function parseDokument(obj: UnknownRecord): UpoDokument {
  return {
    nipSprzedawcy: requireString(obj.NipSprzedawcy, 'Dokument.NipSprzedawcy'),
    numerKSeFDokumentu: requireString(obj.NumerKSeFDokumentu, 'Dokument.NumerKSeFDokumentu'),
    numerFaktury: requireString(obj.NumerFaktury, 'Dokument.NumerFaktury'),
    dataWystawieniaFaktury: requireString(obj.DataWystawieniaFaktury, 'Dokument.DataWystawieniaFaktury'),
    dataPrzeslaniaDokumentu: requireString(obj.DataPrzeslaniaDokumentu, 'Dokument.DataPrzeslaniaDokumentu'),
    dataNadaniaNumeruKSeF: requireString(obj.DataNadaniaNumeruKSeF, 'Dokument.DataNadaniaNumeruKSeF'),
    skrotDokumentu: requireString(obj.SkrotDokumentu, 'Dokument.SkrotDokumentu'),
    trybWysylki: requireString(obj.TrybWysylki, 'Dokument.TrybWysylki'),
  };
}

// ── XMLParser instance ─────────────────────────────────────────────────

const upoParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseTagValue: false,
  parseAttributeValue: false,
  removeNSPrefix: true,
  trimValues: false,
});

// ── Public API ─────────────────────────────────────────────────────────

export function parseUpoXml(xml: string | Buffer): UpoPotwierdzenie {
  const text = Buffer.isBuffer(xml) ? xml.toString('utf8') : xml;
  const parsed = upoParser.parse(text);
  const potwierdzenie = requireRecord(parsed?.Potwierdzenie, 'Potwierdzenie');

  const opisPotwierdzenia = optionalRecord(potwierdzenie.OpisPotwierdzenia);
  const dokumenty = ensureArray(potwierdzenie.Dokument).map((doc, i) =>
    parseDokument(requireRecord(doc, `Dokument[${i}]`)),
  );
  if (dokumenty.length === 0) {
    throw KSeFValidationError.fromField('Dokument', 'Expected at least one Dokument in UPO');
  }

  return {
    nazwaPodmiotuPrzyjmujacego: requireString(potwierdzenie.NazwaPodmiotuPrzyjmujacego, 'NazwaPodmiotuPrzyjmujacego'),
    numerReferencyjnySesji: requireString(potwierdzenie.NumerReferencyjnySesji, 'NumerReferencyjnySesji'),
    uwierzytelnienie: parseUwierzytelnienie(requireRecord(potwierdzenie.Uwierzytelnienie, 'Uwierzytelnienie')),
    ...(opisPotwierdzenia && { opisPotwierdzenia: parseOpisPotwierdzenia(opisPotwierdzenia) }),
    nazwaStrukturyLogicznej: requireString(potwierdzenie.NazwaStrukturyLogicznej, 'NazwaStrukturyLogicznej'),
    kodFormularza: requireString(potwierdzenie.KodFormularza, 'KodFormularza'),
    dokumenty,
  };
}
