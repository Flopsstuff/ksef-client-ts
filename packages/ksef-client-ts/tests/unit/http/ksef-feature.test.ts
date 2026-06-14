import { KSEF_FEATURE_HEADER, UpoVersion, ENFORCE_XADES_COMPLIANCE } from '../../../src/http/ksef-feature.js';

describe('KSeF Feature constants', () => {
  it('KSEF_FEATURE_HEADER is X-KSeF-Feature', () => {
    expect(KSEF_FEATURE_HEADER).toBe('X-KSeF-Feature');
  });

  it('UpoVersion.V4_2 is upo-v4-2', () => {
    expect(UpoVersion.V4_2).toBe('upo-v4-2');
  });

  it('UpoVersion.V4_3 is upo-v4-3', () => {
    expect(UpoVersion.V4_3).toBe('upo-v4-3');
  });

  it('ENFORCE_XADES_COMPLIANCE is enforce-xades-compliance', () => {
    expect(ENFORCE_XADES_COMPLIANCE).toBe('enforce-xades-compliance');
  });
});
