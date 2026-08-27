import {
  CollectiveIdentifiersService,
  MAX_INVOICES_PER_COLLECTIVE_IDENTIFIER,
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
const COLLECTIVE_NUMBER = '1111111111-IZ202607-65ED02180000-E7';

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

      const result = await service.generate({ invoices: [{ ksefNumber: KSEF_NUMBER }] });

      expect(result).toEqual({ collectiveIdentifierNumber: COLLECTIVE_NUMBER });
    });

    it(`rejects more than ${MAX_INVOICES_PER_COLLECTIVE_IDENTIFIER} invoices without calling the API`, async () => {
      const invoices = Array.from(
        { length: MAX_INVOICES_PER_COLLECTIVE_IDENTIFIER + 1 },
        () => ({ ksefNumber: KSEF_NUMBER }),
      );

      await expect(service.generate({ invoices })).rejects.toBeInstanceOf(KSeFValidationError);
      expect(restClient.execute).not.toHaveBeenCalled();
    });

    it(`accepts exactly ${MAX_INVOICES_PER_COLLECTIVE_IDENTIFIER} invoices`, async () => {
      const invoices = Array.from(
        { length: MAX_INVOICES_PER_COLLECTIVE_IDENTIFIER },
        () => ({ ksefNumber: KSEF_NUMBER }),
      );

      await service.generate({ invoices });

      expect(restClient.execute).toHaveBeenCalledOnce();
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
