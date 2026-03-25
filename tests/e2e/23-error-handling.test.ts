import { describe, it, expect } from 'vitest';
import { createTestClient, authenticateWithCert } from './helpers/auth.js';
import { KSeFUnauthorizedError } from '../../src/errors/ksef-unauthorized-error.js';
import { KSeFApiError } from '../../src/errors/ksef-api-error.js';
import { KSeFValidationError } from '../../src/errors/ksef-validation-error.js';
import { EntityPermissionGrantBuilder } from '../../src/builders/permissions/entity-permission.js';

describe('23 - Error Handling E2E', { timeout: 60_000 }, () => {
  it('should throw KSeFUnauthorizedError for unauthenticated request', async () => {
    const client = createTestClient();

    try {
      await client.invoices.getInvoice('0000000000000-00000-000000000000');
      expect.fail('Should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(KSeFUnauthorizedError);
      const err = e as KSeFUnauthorizedError;
      expect(err.statusCode).toBe(401);
      expect(err.detail).toBeTruthy();
    }
  });

  it('should throw KSeFApiError for non-existent invoice', async () => {
    const { client } = await authenticateWithCert();

    try {
      await client.invoices.getInvoice('0000000000000-00000-000000000000');
      expect.fail('Should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(KSeFApiError);
      expect(e).not.toBeInstanceOf(KSeFUnauthorizedError);
      const apiErr = e as KSeFApiError;
      expect(apiErr.statusCode).toBeGreaterThanOrEqual(400);
      expect(apiErr.statusCode).toBeLessThan(500);
    }
  });

  it('should throw KSeFValidationError for invalid builder input', () => {
    const builder = new EntityPermissionGrantBuilder();

    expect(() => builder.build()).toThrow(KSeFValidationError);

    try {
      builder.build();
    } catch (e) {
      expect(e).toBeInstanceOf(KSeFValidationError);
      const valErr = e as KSeFValidationError;
      expect(valErr.details.length).toBeGreaterThan(0);
      expect(valErr.details[0]!.field).toBe('nip');
      expect(valErr.details[0]!.message).toContain('required');
    }
  });
});
