import { LimitsService } from '../../../src/services/limits.js';
import { createMockRestClient, getRequest, mockResponse } from './_helpers.js';

describe('LimitsService', () => {
  it('getContextLimits sends GET to limits/context', async () => {
    const restClient = createMockRestClient();
    const service = new LimitsService(restClient);
    const expected = { contextLimits: { maxInvoiceSize: 1024 } };
    vi.mocked(restClient.execute).mockResolvedValue(mockResponse(expected));

    const result = await service.getContextLimits();

    expect(result).toEqual(expected);
    const req = getRequest(restClient.execute);
    expect(req.method).toBe('GET');
    expect(req.path).toBe('limits/context');
  });

  it('getSubjectLimits sends GET to limits/subject', async () => {
    const restClient = createMockRestClient();
    const service = new LimitsService(restClient);
    const expected = { subjectLimits: { maxCertificates: 5 } };
    vi.mocked(restClient.execute).mockResolvedValue(mockResponse(expected));

    const result = await service.getSubjectLimits();

    expect(result).toEqual(expected);
    const req = getRequest(restClient.execute);
    expect(req.method).toBe('GET');
    expect(req.path).toBe('limits/subject');
  });

  it('getRateLimits sends GET to rate-limits', async () => {
    const restClient = createMockRestClient();
    const service = new LimitsService(restClient);
    const expected = { rateLimits: { requestsPerMinute: 100 } };
    vi.mocked(restClient.execute).mockResolvedValue(mockResponse(expected));

    const result = await service.getRateLimits();

    expect(result).toEqual(expected);
    const req = getRequest(restClient.execute);
    expect(req.method).toBe('GET');
    expect(req.path).toBe('rate-limits');
  });
});
