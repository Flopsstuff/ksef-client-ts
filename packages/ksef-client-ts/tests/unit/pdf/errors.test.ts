import { describe, it, expect } from 'vitest';
import { KSeFPdfError } from '../../../src/pdf/errors.js';
import { KSeFError } from '../../../src/errors/ksef-error.js';

describe('KSeFPdfError', () => {
  it('is an instance of KSeFError and Error', () => {
    const err = new KSeFPdfError('boom');
    expect(err).toBeInstanceOf(KSeFPdfError);
    expect(err).toBeInstanceOf(KSeFError);
    expect(err).toBeInstanceOf(Error);
  });

  it('sets its name to KSeFPdfError', () => {
    expect(new KSeFPdfError('x').name).toBe('KSeFPdfError');
  });

  it('preserves the message', () => {
    expect(new KSeFPdfError('missing pdfmake').message).toBe('missing pdfmake');
  });
});
