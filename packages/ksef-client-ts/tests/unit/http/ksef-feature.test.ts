import {
  KSEF_FEATURE_HEADER,
  UpoVersion,
  KSeFFeature,
  ENFORCE_XADES_COMPLIANCE,
  resolveSessionFeature,
} from '../../../src/http/ksef-feature.js';
import { KSeFValidationError } from '../../../src/errors/ksef-validation-error.js';

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

  it('KSeFFeature.SubjectIdentifierValidation is subject-identifier-validation', () => {
    expect(KSeFFeature.SubjectIdentifierValidation).toBe('subject-identifier-validation');
  });
});

describe('resolveSessionFeature', () => {
  it('returns undefined when nothing is given', () => {
    expect(resolveSessionFeature()).toBeUndefined();
    expect(resolveSessionFeature(undefined, undefined)).toBeUndefined();
    expect(resolveSessionFeature([])).toBeUndefined();
    expect(resolveSessionFeature('')).toBeUndefined();
  });

  it('passes a single string through verbatim', () => {
    expect(resolveSessionFeature('upo-v4-3')).toBe('upo-v4-3');
    expect(resolveSessionFeature('custom-feature')).toBe('custom-feature');
  });

  it('accepts a single-value array', () => {
    expect(resolveSessionFeature([KSeFFeature.SubjectIdentifierValidation])).toBe('subject-identifier-validation');
  });

  it('merges the deprecated alias with features and drops repeats and empty values', () => {
    expect(resolveSessionFeature(UpoVersion.V4_3, [UpoVersion.V4_3, ''])).toBe('upo-v4-3');
    expect(resolveSessionFeature(undefined, KSeFFeature.SubjectIdentifierValidation)).toBe('subject-identifier-validation');
  });

  it('throws KSeFValidationError for more than one distinct value', () => {
    let caught: unknown;
    try {
      resolveSessionFeature(UpoVersion.V4_3, [KSeFFeature.SubjectIdentifierValidation]);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(KSeFValidationError);
    expect((caught as KSeFValidationError).message).toBe(
      'KSeF applies only one X-KSeF-Feature value per session, got 2: upo-v4-3, subject-identifier-validation',
    );
    expect((caught as KSeFValidationError).details).toEqual([
      { field: 'features', message: (caught as KSeFValidationError).message },
    ]);
  });
});
