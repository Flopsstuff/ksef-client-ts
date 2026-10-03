import {
  CollectiveIdentifiersService,
  MIN_INVOICES_PER_COLLECTIVE_IDENTIFIER,
  MAX_INVOICES_PER_COLLECTIVE_IDENTIFIER,
  MAX_COLLECTIVE_IDENTIFIER_INVOICE_DESCRIPTION_LENGTH,
} from '../../../src/services/collective-identifiers.js';
import { KSeFValidationError } from '../../../src/errors/ksef-validation-error.js';
import { createMockRestClient, getRequest, mockResponse } from './_helpers.js';
import type { RestClient } from '../../../src/http/rest-client.js';
import type {
  CollectiveIdentifiersQueryRequest,
  CollectiveIdentifiersQueryResponse,
  CollectiveIdentifiersByKsefNumberQueryResponse,
  CollectiveIdentifierInvoicesQueryResponse,
} from '../../../src/models/collective-identifiers/types.js';

const KSEF_NUMBER = '1111111111-20260701-0189AB-CD1234-EF';
const KSEF_NUMBER_2 = '1111111111-20260701-0189AB-CD1235-F0';
const COLLECTIVE_NUMBER = '1111111111-IZ202607-65ED02180000-E7';

/** Distinct, well-formed KSeF numbers of one seller, for lists of any length. */
const invoiceList = (length: number) =>
  Array.from({ length }, (_, i) => ({
    ksefNumber: `1111111111-20260701-${i.toString(16).toUpperCase().padStart(12, '0')}-00`,
  }));

describe('CollectiveIdentifiersService', () => {
  let restClient: RestClient;
  let service: CollectiveIdentifiersService;

  beforeEach(() => {
    restClient = createMockRestClient();
    service = new CollectiveIdentifiersService(restClient);
  });

  describe('generate', () => {
    it('sends POST to collective-identifiers with the invoice list as body', async () => {
      const request = {
        invoices: [
          { ksefNumber: KSEF_NUMBER, payment: { amount: 1230.45, currency: 'PLN' }, description: 'Q3' },
          { ksefNumber: KSEF_NUMBER_2 },
        ],
      };

      await service.generate(request);

      const req = getRequest(vi.mocked(restClient.execute));
      expect(req.method).toBe('POST');
      expect(req.path).toBe('collective-identifiers');
      expect(req.getBody()).toEqual(request);
    });

    it('returns the generated collective identifier number', async () => {
      vi.mocked(restClient.execute).mockResolvedValueOnce(
        mockResponse({ collectiveIdentifierNumber: COLLECTIVE_NUMBER }),
      );

      const result = await service.generate({
        invoices: [{ ksefNumber: KSEF_NUMBER }, { ksefNumber: KSEF_NUMBER_2 }],
      });

      expect(result).toEqual({ collectiveIdentifierNumber: COLLECTIVE_NUMBER });
    });

    it.each([0, 1])(
      `rejects %i invoices, below the minimum of ${MIN_INVOICES_PER_COLLECTIVE_IDENTIFIER}, without calling the API`,
      async (length) => {
        const invoices = invoiceList(length);

        await expect(service.generate({ invoices })).rejects.toBeInstanceOf(KSeFValidationError);
        expect(restClient.execute).not.toHaveBeenCalled();
      },
    );

    it(`accepts exactly ${MIN_INVOICES_PER_COLLECTIVE_IDENTIFIER} invoices`, async () => {
      const invoices = invoiceList(MIN_INVOICES_PER_COLLECTIVE_IDENTIFIER);

      await service.generate({ invoices });

      expect(restClient.execute).toHaveBeenCalled();
    });

    it('sends a list longer than the default limit, which a context may have raised', async () => {
      const invoices = invoiceList(501);

      await service.generate({ invoices });

      expect(restClient.execute).toHaveBeenCalled();
    });

    it(`rejects more than ${MAX_INVOICES_PER_COLLECTIVE_IDENTIFIER} invoices without calling the API`, async () => {
      const invoices = invoiceList(MAX_INVOICES_PER_COLLECTIVE_IDENTIFIER + 1);

      await expect(service.generate({ invoices })).rejects.toBeInstanceOf(KSeFValidationError);
      expect(restClient.execute).not.toHaveBeenCalled();
    });

    it(`accepts exactly ${MAX_INVOICES_PER_COLLECTIVE_IDENTIFIER} invoices`, async () => {
      const invoices = invoiceList(MAX_INVOICES_PER_COLLECTIVE_IDENTIFIER);

      await service.generate({ invoices });

      expect(restClient.execute).toHaveBeenCalledOnce();
    });

    describe('pre-flight checks', () => {
      /** The detail a rejected request carries, asserting nothing was sent. */
      async function rejection(invoices: Parameters<typeof service.generate>[0]['invoices']) {
        const err = await service.generate({ invoices }).catch((e: unknown) => e);
        expect(err).toBeInstanceOf(KSeFValidationError);
        expect(restClient.execute).not.toHaveBeenCalled();
        return (err as KSeFValidationError).details[0]!;
      }

      it('rejects a KSeF number repeated in the list (KSeF 71005)', async () => {
        const detail = await rejection([
          { ksefNumber: KSEF_NUMBER },
          { ksefNumber: KSEF_NUMBER_2 },
          { ksefNumber: KSEF_NUMBER },
        ]);

        expect(detail.field).toBe('invoices[2].ksefNumber');
        expect(detail.message).toContain(KSEF_NUMBER);
      });

      it('sends the 35- and 36-character forms of one number, which KSeF resolves separately', async () => {
        const v36 = '1111111111-20260701-0189AB-CD1234-EF';
        const v35 = '1111111111-20260701-0189ABCD1234-EF';

        await service.generate({ invoices: [{ ksefNumber: v35 }, { ksefNumber: v36 }] });

        expect(restClient.execute).toHaveBeenCalledOnce();
      });

      it('rejects invoices of different sellers (KSeF 71004)', async () => {
        const detail = await rejection([
          { ksefNumber: KSEF_NUMBER },
          { ksefNumber: '5265877635-20250826-0100001AF629-AF' },
        ]);

        expect(detail.field).toBe('invoices[1].ksefNumber');
        expect(detail.message).toContain('5265877635');
        expect(detail.message).toContain('1111111111');
      });

      it.each([
        ['lowercase hex', '1111111111-20260701-0189abcd1234-ef'],
        ['a prefix that is not a NIP', '0111111111-20260701-0189ABCD1234-EF'],
        ['a missing checksum', '1111111111-20260701-0189ABCD1234'],
        ['an empty string', ''],
      ])('rejects a malformed KSeF number (%s)', async (_label, ksefNumber) => {
        const detail = await rejection([{ ksefNumber: KSEF_NUMBER }, { ksefNumber }]);

        expect(detail.field).toBe('invoices[1].ksefNumber');
      });

      it('rejects an invoice without a KSeF number', async () => {
        const detail = await rejection([
          { ksefNumber: KSEF_NUMBER },
          {} as { ksefNumber: string },
        ]);

        expect(detail.field).toBe('invoices[1].ksefNumber');
      });

      it(`rejects a description longer than ${MAX_COLLECTIVE_IDENTIFIER_INVOICE_DESCRIPTION_LENGTH} characters`, async () => {
        const detail = await rejection([
          { ksefNumber: KSEF_NUMBER },
          {
            ksefNumber: KSEF_NUMBER_2,
            description: 'x'.repeat(MAX_COLLECTIVE_IDENTIFIER_INVOICE_DESCRIPTION_LENGTH + 1),
          },
        ]);

        expect(detail.field).toBe('invoices[1].description');
      });

      it(`accepts a description of exactly ${MAX_COLLECTIVE_IDENTIFIER_INVOICE_DESCRIPTION_LENGTH} characters`, async () => {
        await service.generate({
          invoices: [
            { ksefNumber: KSEF_NUMBER, description: 'x'.repeat(MAX_COLLECTIVE_IDENTIFIER_INVOICE_DESCRIPTION_LENGTH) },
            { ksefNumber: KSEF_NUMBER_2, description: null },
          ],
        });

        expect(restClient.execute).toHaveBeenCalledOnce();
      });

      it.each([
        ['no currency', { amount: 100 }, 'invoices[0].payment.currency'],
        ['an empty currency', { amount: 100, currency: '' }, 'invoices[0].payment.currency'],
        ['no amount', { currency: 'PLN' }, 'invoices[0].payment.amount'],
        ['a null amount', { amount: null, currency: 'PLN' }, 'invoices[0].payment.amount'],
        ['a non-finite amount', { amount: Number.NaN, currency: 'PLN' }, 'invoices[0].payment.amount'],
      ])('rejects a payment with %s', async (_label, payment, field) => {
        const detail = await rejection([
          { ksefNumber: KSEF_NUMBER, payment: payment as { amount: number; currency: string } },
          { ksefNumber: KSEF_NUMBER_2 },
        ]);

        expect(detail.field).toBe(field);
      });

      it('accepts an invoice whose payment is null', async () => {
        await service.generate({
          invoices: [{ ksefNumber: KSEF_NUMBER, payment: null }, { ksefNumber: KSEF_NUMBER_2 }],
        });

        expect(restClient.execute).toHaveBeenCalledOnce();
      });
    });
  });

  describe('query', () => {
    const request: CollectiveIdentifiersQueryRequest = {
      dateCreatedFrom: '2026-07-01T00:00:00+00:00',
      dateCreatedTo: '2026-07-31T23:59:59+00:00',
      invoiceCountFrom: 1,
      createdInCurrentContext: true,
    };

    it('sends POST to collective-identifiers/query with the filter as body', async () => {
      await service.query(request);

      const req = getRequest(vi.mocked(restClient.execute));
      expect(req.method).toBe('POST');
      expect(req.path).toBe('collective-identifiers/query');
      expect(req.getBody()).toEqual(request);
      expect(req.getQuery()).toEqual([]);
      expect(req.getHeaders()).toEqual({});
    });

    it('passes pageSize as a query param and the continuation token as a header', async () => {
      await service.query(request, 50, 'token-abc');

      const req = getRequest(vi.mocked(restClient.execute));
      expect(req.getQuery()).toEqual([['pageSize', '50']]);
      expect(req.getHeaders()).toEqual({ 'x-continuation-token': 'token-abc' });
    });

    it('returns the response body', async () => {
      const body: CollectiveIdentifiersQueryResponse = {
        continuationToken: 'next-page',
        collectiveIdentifiers: [
          {
            collectiveIdentifierNumber: COLLECTIVE_NUMBER,
            dateCreated: '2026-07-15T09:12:00Z',
            invoiceCount: 3,
            createdInCurrentContext: true,
          },
        ],
      };
      vi.mocked(restClient.execute).mockResolvedValueOnce(mockResponse(body));

      const result = await service.query(request);

      expect(result).toEqual(body);
    });
  });

  describe('getByKsefNumber', () => {
    it('sends GET to collective-identifiers/ksef/{ksefNumber}', async () => {
      await service.getByKsefNumber(KSEF_NUMBER);

      const req = getRequest(vi.mocked(restClient.execute));
      expect(req.method).toBe('GET');
      expect(req.path).toBe(`collective-identifiers/ksef/${KSEF_NUMBER}`);
      expect(req.getQuery()).toEqual([]);
      expect(req.getHeaders()).toEqual({});
    });

    it('passes pageSize as a query param and the continuation token as a header', async () => {
      await service.getByKsefNumber(KSEF_NUMBER, 25, 'token-xyz');

      const req = getRequest(vi.mocked(restClient.execute));
      expect(req.getQuery()).toEqual([['pageSize', '25']]);
      expect(req.getHeaders()).toEqual({ 'x-continuation-token': 'token-xyz' });
    });

    it('returns the response body', async () => {
      const body: CollectiveIdentifiersByKsefNumberQueryResponse = {
        continuationToken: null,
        collectiveIdentifiers: [
          {
            collectiveIdentifierNumber: COLLECTIVE_NUMBER,
            createdInCurrentContext: false,
            dateCreated: '2026-07-15T09:12:00Z',
          },
        ],
      };
      vi.mocked(restClient.execute).mockResolvedValueOnce(mockResponse(body));

      const result = await service.getByKsefNumber(KSEF_NUMBER);

      expect(result).toEqual(body);
    });
  });

  describe('queryInvoices', () => {
    it('sends POST to collective-identifiers/invoices with the identifiers in the body', async () => {
      await service.queryInvoices({ collectiveIdentifierNumbers: [COLLECTIVE_NUMBER] });

      const req = getRequest(vi.mocked(restClient.execute));
      expect(req.method).toBe('POST');
      expect(req.path).toBe('collective-identifiers/invoices');
      expect(req.getBody()).toEqual({ collectiveIdentifierNumbers: [COLLECTIVE_NUMBER] });
      expect(req.getQuery()).toEqual([]);
      expect(req.getHeaders()).toEqual({});
    });

    it('passes pageSize as a query param and the continuation token as a header', async () => {
      await service.queryInvoices({ collectiveIdentifierNumbers: [COLLECTIVE_NUMBER] }, 200, 'token-123');

      const req = getRequest(vi.mocked(restClient.execute));
      expect(req.getQuery()).toEqual([['pageSize', '200']]);
      expect(req.getHeaders()).toEqual({ 'x-continuation-token': 'token-123' });
    });

    it('rejects more than 10 identifiers before reaching the API', async () => {
      const numbers = Array.from({ length: 11 }, (_, i) => `${COLLECTIVE_NUMBER}-${i}`);

      await expect(service.queryInvoices({ collectiveIdentifierNumbers: numbers }))
        .rejects.toThrow(/at most 10 collective identifiers, got 11/);
      expect(restClient.execute).not.toHaveBeenCalled();
    });

    it('maps disclosed payment details', async () => {
      const body: CollectiveIdentifierInvoicesQueryResponse = {
        continuationToken: null,
        invoices: [
          {
            ksefNumber: KSEF_NUMBER,
            collectiveIdentifierNumber: COLLECTIVE_NUMBER,
            payment: { amount: 1230.45, currency: 'PLN' },
            description: 'Q3 settlement',
            detailsHidden: false,
          },
        ],
      };
      vi.mocked(restClient.execute).mockResolvedValueOnce(mockResponse(body));

      const result = await service.queryInvoices({ collectiveIdentifierNumbers: [COLLECTIVE_NUMBER] });

      expect(result.invoices[0].payment).toEqual({ amount: 1230.45, currency: 'PLN' });
      expect(result.invoices[0].detailsHidden).toBe(false);
    });

    it('maps a withheld item where detailsHidden is true and the amount fields are absent', async () => {
      vi.mocked(restClient.execute).mockResolvedValueOnce(
        mockResponse({
          invoices: [{ ksefNumber: KSEF_NUMBER, collectiveIdentifierNumber: COLLECTIVE_NUMBER, detailsHidden: true }],
        } satisfies CollectiveIdentifierInvoicesQueryResponse),
      );

      const result = await service.queryInvoices({ collectiveIdentifierNumbers: [COLLECTIVE_NUMBER] });

      expect(result.invoices[0].detailsHidden).toBe(true);
      expect(result.invoices[0].payment).toBeUndefined();
      expect(result.invoices[0].description).toBeUndefined();
    });
  });
});
