import type { FormCode } from '../../../src/models/common.js';
import {
  SystemCode,
  FORM_CODES,
  FORM_CODE_KEYS,
  INVOICE_TYPES_BY_SYSTEM_CODE,
  getFormCode,
  parseFormCode,
  validateFormCodeForSession,
} from '../../../src/models/document-structures/index.js';

// ---------------------------------------------------------------------------
// SystemCode
// ---------------------------------------------------------------------------

describe('SystemCode', () => {
  it('has exactly 5 members', () => {
    expect(Object.keys(SystemCode)).toHaveLength(5);
  });

  it.each([
    ['FA_2', 'FA (2)'],
    ['FA_3', 'FA (3)'],
    ['PEF_3', 'PEF (3)'],
    ['PEF_KOR_3', 'PEF_KOR (3)'],
    ['FA_RR_1', 'FA_RR (1)'],
  ] as const)('%s = "%s"', (key, expected) => {
    expect(SystemCode[key]).toBe(expected);
  });
});

// ---------------------------------------------------------------------------
// FORM_CODES
// ---------------------------------------------------------------------------

describe('FORM_CODES', () => {
  it('has exactly 7 entries', () => {
    expect(Object.keys(FORM_CODES)).toHaveLength(7);
  });

  it.each([
    ['FA_2',               'FA (2)',      '1-0E', 'FA'],
    ['FA_3',               'FA (3)',      '1-0E', 'FA'],
    ['PEF_3',              'PEF (3)',     '2-1',  'PEF'],
    ['PEF_KOR_3',          'PEF_KOR (3)', '2-1',  'PEF'],
    ['FA_RR_1_LEGACY',     'FA_RR (1)',   '1-0E', 'RR'],
    ['FA_RR_1_TRANSITION', 'FA_RR (1)',   '1-1E', 'RR'],
    ['FA_RR_1',            'FA_RR (1)',   '1-1E', 'FA_RR'],
  ] as const)('%s has correct field values', (key, systemCode, schemaVersion, value) => {
    const fc = FORM_CODES[key];
    expect(fc.systemCode).toBe(systemCode);
    expect(fc.schemaVersion).toBe(schemaVersion);
    expect(fc.value).toBe(value);
  });

  it('each entry satisfies the FormCode interface', () => {
    for (const fc of Object.values(FORM_CODES)) {
      const typed: FormCode = fc;
      expect(typed).toHaveProperty('systemCode');
      expect(typed).toHaveProperty('schemaVersion');
      expect(typed).toHaveProperty('value');
    }
  });
});

// ---------------------------------------------------------------------------
// getFormCode
// ---------------------------------------------------------------------------

describe('getFormCode', () => {
  it.each([
    [SystemCode.FA_2, FORM_CODES.FA_2],
    [SystemCode.FA_3, FORM_CODES.FA_3],
    [SystemCode.PEF_3, FORM_CODES.PEF_3],
    [SystemCode.PEF_KOR_3, FORM_CODES.PEF_KOR_3],
    [SystemCode.FA_RR_1, FORM_CODES.FA_RR_1],
  ] as const)('returns correct constant for %s', (code, expected) => {
    expect(getFormCode(code)).toBe(expected);
  });

  it('FA_RR_1 returns current variant (not legacy or transition)', () => {
    const fc = getFormCode(SystemCode.FA_RR_1);
    expect(fc.schemaVersion).toBe('1-1E');
    expect(fc.value).toBe('FA_RR');
  });
});

// ---------------------------------------------------------------------------
// parseFormCode
// ---------------------------------------------------------------------------

describe('parseFormCode', () => {
  it('returns typed constant for exact match', () => {
    const raw: FormCode = { systemCode: 'FA (3)', schemaVersion: '1-0E', value: 'FA' };
    expect(parseFormCode(raw)).toBe(FORM_CODES.FA_3);
  });

  it('matches FA_RR_1_TRANSITION variant', () => {
    const raw: FormCode = { systemCode: 'FA_RR (1)', schemaVersion: '1-1E', value: 'RR' };
    expect(parseFormCode(raw)).toBe(FORM_CODES.FA_RR_1_TRANSITION);
  });

  it('matches FA_RR_1_LEGACY variant', () => {
    const raw: FormCode = { systemCode: 'FA_RR (1)', schemaVersion: '1-0E', value: 'RR' };
    expect(parseFormCode(raw)).toBe(FORM_CODES.FA_RR_1_LEGACY);
  });

  it('returns raw object for unknown form code', () => {
    const raw: FormCode = { systemCode: 'UNKNOWN (9)', schemaVersion: '1-0E', value: 'X' };
    const result = parseFormCode(raw);
    expect(result).toBe(raw);
    expect(result).not.toBe(FORM_CODES.FA_2);
  });
});

// ---------------------------------------------------------------------------
// validateFormCodeForSession
// ---------------------------------------------------------------------------

describe('validateFormCodeForSession', () => {
  it('all form codes are valid for online sessions', () => {
    for (const fc of Object.values(FORM_CODES)) {
      expect(validateFormCodeForSession(fc, 'online')).toBe(true);
    }
  });

  it('FA form codes are valid for batch sessions', () => {
    expect(validateFormCodeForSession(FORM_CODES.FA_2, 'batch')).toBe(true);
    expect(validateFormCodeForSession(FORM_CODES.FA_3, 'batch')).toBe(true);
  });

  it('FA_RR form codes are valid for batch sessions', () => {
    expect(validateFormCodeForSession(FORM_CODES.FA_RR_1, 'batch')).toBe(true);
    expect(validateFormCodeForSession(FORM_CODES.FA_RR_1_LEGACY, 'batch')).toBe(true);
    expect(validateFormCodeForSession(FORM_CODES.FA_RR_1_TRANSITION, 'batch')).toBe(true);
  });

  it('PEF is invalid for batch sessions', () => {
    expect(validateFormCodeForSession(FORM_CODES.PEF_3, 'batch')).toBe(false);
  });

  it('PEF_KOR is invalid for batch sessions', () => {
    expect(validateFormCodeForSession(FORM_CODES.PEF_KOR_3, 'batch')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// INVOICE_TYPES_BY_SYSTEM_CODE
// ---------------------------------------------------------------------------

describe('INVOICE_TYPES_BY_SYSTEM_CODE', () => {
  it('FA_2 maps to standard invoice types', () => {
    expect(INVOICE_TYPES_BY_SYSTEM_CODE[SystemCode.FA_2]).toEqual(
      ['Vat', 'Zal', 'Kor', 'Roz', 'Upr', 'KorZal', 'KorRoz'],
    );
  });

  it('FA_3 maps to same types as FA_2', () => {
    expect(INVOICE_TYPES_BY_SYSTEM_CODE[SystemCode.FA_3]).toEqual(
      INVOICE_TYPES_BY_SYSTEM_CODE[SystemCode.FA_2],
    );
  });

  it('PEF_3 maps to PEF invoice types', () => {
    expect(INVOICE_TYPES_BY_SYSTEM_CODE[SystemCode.PEF_3]).toEqual(
      ['VatPef', 'VatPefSp', 'KorPef'],
    );
  });

  it('PEF_KOR_3 maps to KorPef only', () => {
    expect(INVOICE_TYPES_BY_SYSTEM_CODE[SystemCode.PEF_KOR_3]).toEqual(['KorPef']);
  });

  it('FA_RR_1 maps to RR invoice types', () => {
    expect(INVOICE_TYPES_BY_SYSTEM_CODE[SystemCode.FA_RR_1]).toEqual(['VatRr', 'KorVatRr']);
  });
});

// ---------------------------------------------------------------------------
// FORM_CODE_KEYS
// ---------------------------------------------------------------------------

describe('FORM_CODE_KEYS', () => {
  it('has exactly 5 keys', () => {
    expect(Object.keys(FORM_CODE_KEYS)).toHaveLength(5);
  });

  it.each([
    ['FA2', FORM_CODES.FA_2],
    ['FA3', FORM_CODES.FA_3],
    ['PEF3', FORM_CODES.PEF_3],
    ['PEFKOR3', FORM_CODES.PEF_KOR_3],
    ['FARR1', FORM_CODES.FA_RR_1],
  ] as const)('"%s" resolves to correct constant', (key, expected) => {
    expect(FORM_CODE_KEYS[key]).toBe(expected);
  });

  it('keys are case-sensitive', () => {
    expect(FORM_CODE_KEYS['fa3']).toBeUndefined();
    expect(FORM_CODE_KEYS['Fa3']).toBeUndefined();
  });
});
