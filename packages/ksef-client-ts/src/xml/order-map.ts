import type { XmlObject, XmlValue } from './types.js';

/**
 * ORDER_MAP declares element ordering for every known parent element in the
 * KSeF FA2/FA3 XSDs (docs/schemas/FA/schemat_FA(2|3)_v1-0E.xsd).
 *
 * Inside `Fa` the VAT amount fields P_13_N / P_14_N / P_14_NW must interleave
 * per tax group (P_13_1, P_14_1, P_14_1W, P_13_2, P_14_2, P_14_2W, ...) rather
 * than listing every P_13_* before every P_14_*. smekcio TS 0.5.0 (commit
 * d1ec8fe, 2026-04-14) corrected this bug; the dedicated regression test lives
 * in tests/unit/xml/faktura-builder.test.ts ("multi-rate interleave").
 *
 * `Fa` is intentionally a union of FA2 and FA3 child keys (e.g. P_14_NW and
 * P_13_6_N are FA3-only). Ordering is permissive by design: keys absent from
 * the input are silently skipped, and shape enforcement is the job of
 * `isFakturaInput` + XSD validation in the test harness, not this table.
 */
export const ORDER_MAP: Record<string, string[]> = {
  Faktura: ['Naglowek', 'Podmiot1', 'Podmiot2', 'Podmiot3', 'Fa', 'Stopka'],
  Naglowek: ['KodFormularza', 'WariantFormularza', 'DataWytworzeniaFa', 'SystemInfo'],
  Podmiot1: [
    'PrefiksPodatnika',
    'NrEORI',
    'DaneIdentyfikacyjne',
    'Adres',
    'AdresKoresp',
    'DaneKontaktowe',
    'StatusInfoPodatnika',
  ],
  Podmiot2: [
    'NrEORI',
    'DaneIdentyfikacyjne',
    'Adres',
    'AdresKoresp',
    'DaneKontaktowe',
    'NrKlienta',
    'IDNabywcy',
    'JST',
    'GV',
  ],
  Podmiot3: [
    'IDNabywcy',
    'NrEORI',
    'DaneIdentyfikacyjne',
    'Adres',
    'AdresKoresp',
    'DaneKontaktowe',
    'Rola',
    'Udzial',
  ],
  DaneIdentyfikacyjne: [
    'NIP',
    'IDWew',
    'KodUE',
    'NrVatUE',
    'KodKraju',
    'NrID',
    'BrakID',
    'Nazwa',
    'Identyfikator',
    'KRS',
  ],
  Adres: ['KodKraju', 'AdresL1', 'AdresL2', 'AdresL3'],
  DaneKontaktowe: ['Email', 'Telefon'],
  Fa: [
    'KodWaluty',
    'P_1',
    'P_1M',
    'P_2',
    'WZ',
    'P_6',
    'OkresFa',
    // Multi-rate interleave per VAT group — DO NOT flatten into P_13_* block then P_14_* block.
    // See smekcio TS d1ec8fe and the "multi-rate interleave" regression test.
    'P_13_1',
    'P_14_1',
    'P_14_1W',
    'P_13_2',
    'P_14_2',
    'P_14_2W',
    'P_13_3',
    'P_14_3',
    'P_14_3W',
    'P_13_4',
    'P_14_4',
    'P_14_4W',
    'P_13_5',
    'P_14_5',
    'P_13_6_1',
    'P_13_6_2',
    'P_13_6_3',
    'P_13_7',
    'P_13_8',
    'P_13_9',
    'P_13_10',
    'P_13_11',
    'P_15',
    'KursWalutyZ',
    'Adnotacje',
    'RodzajFaktury',
    'PrzyczynaKorekty',
    'TypKorekty',
    'DaneFaKorygowanej',
    'OkresFaKorygowanej',
    'NrFaKorygowany',
    'Podmiot1K',
    'Podmiot2K',
    'Podmiot3K',
    'ZaliczkaCzesciowa',
    'FP',
    'TP',
    'DodatkowyOpis',
    'FakturaZaliczkowa',
    'ZwrotAkcyzy',
    'FaWiersz',
    'FaWiersze',
    'Rozliczenie',
    'Platnosc',
  ],
  Adnotacje: ['P_16', 'P_17', 'P_18', 'P_18A', 'Zwolnienie', 'NoweSrodkiTransportu', 'P_23', 'PMarzy'],
  OkresFa: ['P_6_Od', 'P_6_Do'],
  FaWiersz: [
    'NrWierszaFa',
    'UU_ID',
    'P_6A',
    'P_7',
    'Indeks',
    'GTIN',
    'PKWiU',
    'CN',
    'PKOB',
    'P_8A',
    'P_8B',
    'P_9A',
    'P_9B',
    'P_10',
    'P_11',
    'P_11A',
    'P_11Vat',
    'P_12',
    'P_12_XII',
    'P_12_Zal_15',
    'KwotaAkcyzy',
    'GTU',
    'Procedura',
    'KursWaluty',
    'StanPrzed',
  ],
};

/**
 * Natural-order sort for KSeF `P_*` keys.
 *
 * Splits on `_` after stripping the `P_` prefix, coerces numeric parts to
 * numbers, and compares numerically first, then lexicographically for any
 * trailing alphabetic parts (e.g. `P_20_A`, `P_20_B`).
 *
 * Examples:
 *   P_13_1 < P_13_2 < P_13_10 < P_20_A < P_20_B
 */
export function comparePKey(a: string, b: string): number {
  const normalize = (value: string) =>
    value
      .replace(/^P_/, '')
      .split('_')
      .map((part) => (Number.isNaN(Number(part)) ? part : Number(part)));
  const aParts = normalize(a);
  const bParts = normalize(b);
  const max = Math.max(aParts.length, bParts.length);
  for (let i = 0; i < max; i += 1) {
    const left = aParts[i];
    const right = bParts[i];
    if (left === undefined) return -1;
    if (right === undefined) return 1;
    if (typeof left === 'number' && typeof right === 'number') {
      if (left !== right) return left - right;
      continue;
    }
    const leftStr = String(left);
    const rightStr = String(right);
    // Locale-independent, code-point order — keeps sort stable across CI
    // matrix entries where the default ICU locale may differ.
    if (leftStr !== rightStr) return leftStr < rightStr ? -1 : 1;
  }
  return 0;
}

function isObject(value: unknown): value is XmlObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeValueForKey(key: string, value: XmlValue): XmlValue {
  if (Array.isArray(value)) {
    return value.map((item) =>
      isObject(item) ? orderXmlObject(item as XmlObject, key) : normalizeValue(item),
    );
  }
  if (isObject(value)) return orderXmlObject(value as XmlObject, key);
  return value;
}

function normalizeValue(value: XmlValue): XmlValue {
  if (Array.isArray(value)) return value.map((item) => normalizeValue(item));
  if (isObject(value)) return orderXmlObject(value as XmlObject);
  return value;
}

/**
 * Recursively orders an XML-shaped object according to ORDER_MAP + P_* natural
 * sort + input-insertion for unknown keys.
 *
 * Algorithm:
 *   1. Apply ORDER_MAP[contextKey] keys in declared order.
 *   2. Append remaining P_* keys via comparePKey.
 *   3. Append all other unknown keys in input insertion order.
 *   4. `undefined` values are omitted.
 */
export function orderXmlObject(value: XmlObject, contextKey?: string): XmlObject {
  const order = contextKey ? ORDER_MAP[contextKey] : undefined;
  const keys = Object.keys(value);
  const used = new Set<string>();
  const ordered: XmlObject = {};

  if (order) {
    for (const key of order) {
      if (Object.prototype.hasOwnProperty.call(value, key)) {
        const item = value[key];
        if (item !== undefined) ordered[key] = normalizeValueForKey(key, item);
        used.add(key);
      }
    }
  }

  const pKeys = keys.filter((key) => !used.has(key) && key.startsWith('P_')).sort(comparePKey);
  for (const key of pKeys) {
    const item = value[key];
    if (item !== undefined) ordered[key] = normalizeValueForKey(key, item);
    used.add(key);
  }

  for (const key of keys) {
    if (used.has(key)) continue;
    const item = value[key];
    if (item !== undefined) ordered[key] = normalizeValueForKey(key, item);
  }

  return ordered;
}
