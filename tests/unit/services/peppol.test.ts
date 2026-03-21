import { PeppolService } from '../../../src/services/peppol.js';
import { createMockRestClient, getRequest, mockResponse } from './_helpers.js';
import type { RestClient } from '../../../src/http/rest-client.js';
import type { QueryPeppolProvidersResponse } from '../../../src/models/peppol/types.js';

describe('PeppolService', () => {
  let restClient: RestClient;
  let service: PeppolService;

  beforeEach(() => {
    restClient = createMockRestClient();
    service = new PeppolService(restClient);
  });

  describe('queryProviders', () => {
    it('sends GET to peppol/query with no query params when called without arguments', async () => {
      await service.queryProviders();
      const req = getRequest(vi.mocked(restClient.execute));
      expect(req.method).toBe('GET');
      expect(req.path).toBe('peppol/query');
      expect(req.getQuery()).toEqual([]);
    });

    it('includes pageOffset and pageSize as query params when provided', async () => {
      await service.queryProviders(0, 25);
      const req = getRequest(vi.mocked(restClient.execute));
      expect(req.getQuery()).toEqual([
        ['pageOffset', '0'],
        ['pageSize', '25'],
      ]);
    });

    it('returns the response body', async () => {
      const body: QueryPeppolProvidersResponse = {
        peppolProviders: [{ id: '1234567890', name: 'Test', dateCreated: '2025-01-01T00:00:00Z' }],
        hasMore: false,
      };
      vi.mocked(restClient.execute).mockResolvedValueOnce(mockResponse(body));

      const result = await service.queryProviders();
      expect(result).toEqual(body);
    });
  });
});
