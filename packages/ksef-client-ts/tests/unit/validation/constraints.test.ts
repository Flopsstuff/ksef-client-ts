import { describe, it, expect } from 'vitest';
import {
  REQUIRED_CHALLENGE_LENGTH,
  CERTIFICATE_NAME_MIN_LENGTH,
  CERTIFICATE_NAME_MAX_LENGTH,
  SUBUNIT_NAME_MIN_LENGTH,
  SUBUNIT_NAME_MAX_LENGTH,
  PERMISSION_DESCRIPTION_MIN_LENGTH,
  PERMISSION_DESCRIPTION_MAX_LENGTH,
} from '../../../src/validation/index.js';

describe('Validation constraints', () => {
  it('REQUIRED_CHALLENGE_LENGTH is 36', () => {
    expect(REQUIRED_CHALLENGE_LENGTH).toBe(36);
  });

  it('CERTIFICATE_NAME_MIN_LENGTH is 5', () => {
    expect(CERTIFICATE_NAME_MIN_LENGTH).toBe(5);
  });

  it('CERTIFICATE_NAME_MAX_LENGTH is 100', () => {
    expect(CERTIFICATE_NAME_MAX_LENGTH).toBe(100);
  });

  it('SUBUNIT_NAME_MIN_LENGTH is 5', () => {
    expect(SUBUNIT_NAME_MIN_LENGTH).toBe(5);
  });

  it('SUBUNIT_NAME_MAX_LENGTH is 256', () => {
    expect(SUBUNIT_NAME_MAX_LENGTH).toBe(256);
  });

  it('PERMISSION_DESCRIPTION_MIN_LENGTH is 5', () => {
    expect(PERMISSION_DESCRIPTION_MIN_LENGTH).toBe(5);
  });

  it('PERMISSION_DESCRIPTION_MAX_LENGTH is 256', () => {
    expect(PERMISSION_DESCRIPTION_MAX_LENGTH).toBe(256);
  });
});
