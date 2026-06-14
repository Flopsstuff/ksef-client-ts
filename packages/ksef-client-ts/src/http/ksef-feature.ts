/** Header name for KSeF feature negotiation. */
export const KSEF_FEATURE_HEADER = 'X-KSeF-Feature' as const;

/** Known UPO format versions. */
export const UpoVersion = {
  /** UPO v4-2 format (default before 2026-01-05). */
  V4_2: 'upo-v4-2',
  /** UPO v4-3 format (default from 2026-01-05, adds InvoicingMode field). */
  V4_3: 'upo-v4-3',
} as const;

export type UpoVersion = (typeof UpoVersion)[keyof typeof UpoVersion];

/** XAdES compliance enforcement value for X-KSeF-Feature header. */
export const ENFORCE_XADES_COMPLIANCE = 'enforce-xades-compliance' as const;
