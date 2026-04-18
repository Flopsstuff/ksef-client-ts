import { describe, it, expect } from 'vitest';
import { createTestClient, authenticateWithCert } from './helpers/auth.js';
import { KSeFUnauthorizedError } from '../../src/errors/ksef-unauthorized-error.js';
import { KSeFApiError } from '../../src/errors/ksef-api-error.js';
import { KSeFBadRequestError } from '../../src/errors/ksef-bad-request-error.js';
import { KSeFValidationError } from '../../src/errors/ksef-validation-error.js';
import { InvoiceQueryFilterBuilder } from '../../src/builders/invoice-query-filter.js';
import { EntityPermissionGrantBuilder } from '../../src/builders/permissions/entity-permission.js';

describe('25 - Error Handling E2E', { timeout: 60_000 }, () => {
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

  it('should surface structured 400 Problem Details on invalid query filter', async () => {
    const { client } = await authenticateWithCert();

    // dateFrom after dateTo — server-side validation rejects with 400
    const filters = new InvoiceQueryFilterBuilder()
      .withSubjectType('Subject1')
      .withDateRange('Invoicing', '2030-01-02', '2030-01-01')
      .build();

    try {
      await client.invoices.queryInvoiceMetadata(filters);
      expect.fail('Should have thrown 400');
    } catch (e) {
      expect(e).toBeInstanceOf(KSeFApiError);
      const apiErr = e as KSeFApiError;
      expect(apiErr.statusCode).toBe(400);

      if (!process.env.ALLOW_LEGACY_400) {
        expect(e).toBeInstanceOf(KSeFBadRequestError);
      }
      if (e instanceof KSeFBadRequestError) {
        expect(e.errors.length).toBeGreaterThan(0);
        expect(e.errors[0]!.code).toBeTypeOf('number');
        expect(e.errors[0]!.description).toBeTypeOf('string');
      } else {
        // eslint-disable-next-line no-console
        console.warn('ALLOW_LEGACY_400 set: server returned legacy 400 body; skipping Problem Details assertions');
      }
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
