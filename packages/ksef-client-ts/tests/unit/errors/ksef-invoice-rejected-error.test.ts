import { describe, it, expect } from 'vitest';
import {
  KSeFApiError,
  KSeFError,
  KSeFInvoiceRejectedError,
  KSeFSessionFailedError,
} from '../../../src/errors/index.js';
import type { SessionInvoiceStatusResponse } from '../../../src/models/sessions/status-types.js';

function invoiceStatus(status: SessionInvoiceStatusResponse['status'], extra?: Partial<SessionInvoiceStatusResponse>): SessionInvoiceStatusResponse {
  return {
    ordinalNumber: 2,
    referenceNumber: 'inv-ref-2',
    invoiceHash: 'hash',
    invoicingDate: '2026-10-03T10:00:00Z',
    status,
    ...extra,
  };
}

describe('KSeFInvoiceRejectedError', () => {
  const duplicate = invoiceStatus(
    {
      code: 440,
      description: 'Duplikat faktury',
      extensions: {
        originalSessionReferenceNumber: '20250626-SO-2F14610000-242991F8C9-B4',
        originalKsefNumber: '5265877635-20250626-010080DD2B5E-26',
      },
    },
    { invoiceNumber: 'FV/1/2026' },
  );

  it('extends KSeFError and Error, not KSeFApiError', () => {
    const err = new KSeFInvoiceRejectedError('sess-ref', duplicate);

    expect(err).toBeInstanceOf(KSeFError);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(KSeFApiError);
    expect(err.name).toBe('KSeFInvoiceRejectedError');
  });

  it('carries the invoice status fields', () => {
    const err = new KSeFInvoiceRejectedError('sess-ref', duplicate);

    expect(err.sessionReferenceNumber).toBe('sess-ref');
    expect(err.referenceNumber).toBe('inv-ref-2');
    expect(err.ordinalNumber).toBe(2);
    expect(err.invoiceNumber).toBe('FV/1/2026');
    expect(err.code).toBe(440);
    expect(err.description).toBe('Duplikat faktury');
    expect(err.details).toEqual([]);
    expect(err.invoiceStatus).toBe(duplicate);
  });

  it('exposes the original KSeF number and session of a duplicate', () => {
    const err = new KSeFInvoiceRejectedError('sess-ref', duplicate);

    expect(err.isDuplicate).toBe(true);
    expect(err.originalKsefNumber).toBe('5265877635-20250626-010080DD2B5E-26');
    expect(err.originalSessionReferenceNumber).toBe('20250626-SO-2F14610000-242991F8C9-B4');
    expect(err.message).toBe(
      'Invoice inv-ref-2 rejected by KSeF: 440 — Duplikat faktury; original KSeF number: 5265877635-20250626-010080DD2B5E-26',
    );
  });

  it('puts the details of a semantic rejection into the message', () => {
    const err = new KSeFInvoiceRejectedError(
      'sess-ref',
      invoiceStatus({ code: 450, description: 'Błąd weryfikacji semantyki', details: ['P_13_1 missing', 'P_15 mismatch'] }),
    );

    expect(err.isDuplicate).toBe(false);
    expect(err.details).toEqual(['P_13_1 missing', 'P_15 mismatch']);
    expect(err.extensions).toEqual({});
    expect(err.originalKsefNumber).toBeUndefined();
    expect(err.invoiceNumber).toBeUndefined();
    expect(err.message).toBe('Invoice inv-ref-2 rejected by KSeF: 450 — Błąd weryfikacji semantyki (P_13_1 missing; P_15 mismatch)');
  });

  it('treats null extensions and a null original number as absent', () => {
    const err = new KSeFInvoiceRejectedError(
      'sess-ref',
      invoiceStatus({ code: 440, description: 'Duplikat faktury', extensions: { originalKsefNumber: null } }),
    );

    expect(err.originalKsefNumber).toBeUndefined();
    expect(err.message).toBe('Invoice inv-ref-2 rejected by KSeF: 440 — Duplikat faktury');
  });
});

describe('KSeFSessionFailedError', () => {
  it('extends KSeFError and Error and carries the session status', () => {
    const status = {
      status: { code: 445, description: 'Błąd weryfikacji, brak poprawnych faktur', details: ['all failed'] },
      failedInvoiceCount: 2,
      dateCreated: '2026-10-03T10:00:00Z',
      dateUpdated: '2026-10-03T10:01:00Z',
    };
    const err = new KSeFSessionFailedError('Session failed: 445 — Błąd weryfikacji, brak poprawnych faktur', 'sess-ref', status);

    expect(err).toBeInstanceOf(KSeFError);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('KSeFSessionFailedError');
    expect(err.referenceNumber).toBe('sess-ref');
    expect(err.code).toBe(445);
    expect(err.description).toBe('Błąd weryfikacji, brak poprawnych faktur');
    expect(err.details).toEqual(['all failed']);
    expect(err.sessionStatus.failedInvoiceCount).toBe(2);
    expect(err.message).toBe('Session failed: 445 — Błąd weryfikacji, brak poprawnych faktur (all failed)');
  });
});
