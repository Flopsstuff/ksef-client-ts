import type { FormCode } from '../common.js';
import type { InvoiceType } from '../invoices/types.js';

// ---------------------------------------------------------------------------
// SystemCode — all KSeF document types
// ---------------------------------------------------------------------------

export const SystemCode = {
  FA_2: 'FA (2)',
  FA_3: 'FA (3)',
  PEF_3: 'PEF (3)',
  PEF_KOR_3: 'PEF_KOR (3)',
  FA_RR_1: 'FA_RR (1)',
} as const;

export type SystemCode = (typeof SystemCode)[keyof typeof SystemCode];

// ---------------------------------------------------------------------------
// FORM_CODES — typed constants for all 7 form code variants
// ---------------------------------------------------------------------------

export const FORM_CODES = {
  FA_2:               { systemCode: 'FA (2)',      schemaVersion: '1-0E', value: 'FA'    },
  FA_3:               { systemCode: 'FA (3)',      schemaVersion: '1-0E', value: 'FA'    },
  PEF_3:              { systemCode: 'PEF (3)',     schemaVersion: '2-1',  value: 'PEF'   },
  PEF_KOR_3:          { systemCode: 'PEF_KOR (3)', schemaVersion: '2-1',  value: 'PEF'   },
  FA_RR_1_LEGACY:     { systemCode: 'FA_RR (1)',   schemaVersion: '1-0E', value: 'RR'    },
  FA_RR_1_TRANSITION: { systemCode: 'FA_RR (1)',   schemaVersion: '1-1E', value: 'RR'    },
  FA_RR_1:            { systemCode: 'FA_RR (1)',   schemaVersion: '1-1E', value: 'FA_RR' },
} as const satisfies Record<string, FormCode>;

/** Default form code for sessions and CLI commands (FA(3) since 2026-02-01). */
export const DEFAULT_FORM_CODE = FORM_CODES.FA_3;

// ---------------------------------------------------------------------------
// Session-type constrained unions
// ---------------------------------------------------------------------------

export type OnlineSessionFormCode = (typeof FORM_CODES)[keyof typeof FORM_CODES];

export type BatchSessionFormCode =
  | typeof FORM_CODES.FA_2
  | typeof FORM_CODES.FA_3
  | typeof FORM_CODES.FA_RR_1_LEGACY
  | typeof FORM_CODES.FA_RR_1_TRANSITION
  | typeof FORM_CODES.FA_RR_1;

// ---------------------------------------------------------------------------
// InvoiceType mapping per document structure
// ---------------------------------------------------------------------------

export const INVOICE_TYPES_BY_SYSTEM_CODE: Record<SystemCode, readonly InvoiceType[]> = {
  [SystemCode.FA_2]:      ['Vat', 'Zal', 'Kor', 'Roz', 'Upr', 'KorZal', 'KorRoz'],
  [SystemCode.FA_3]:      ['Vat', 'Zal', 'Kor', 'Roz', 'Upr', 'KorZal', 'KorRoz'],
  [SystemCode.PEF_3]:     ['VatPef', 'VatPefSp', 'KorPef'],
  [SystemCode.PEF_KOR_3]: ['KorPef'],
  [SystemCode.FA_RR_1]:   ['VatRr', 'KorVatRr'],
};

// ---------------------------------------------------------------------------
// CLI-friendly form code keys
// ---------------------------------------------------------------------------

export const FORM_CODE_KEYS: Record<string, FormCode> = {
  FA2:     FORM_CODES.FA_2,
  FA3:     FORM_CODES.FA_3,
  PEF3:    FORM_CODES.PEF_3,
  PEFKOR3: FORM_CODES.PEF_KOR_3,
  FARR1:   FORM_CODES.FA_RR_1,
};
