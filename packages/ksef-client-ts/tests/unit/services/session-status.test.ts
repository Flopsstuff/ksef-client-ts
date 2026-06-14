import { SessionStatusService } from '../../../src/services/session-status.js';
import { Routes } from '../../../src/http/routes.js';
import { createMockRestClient, getRequest, mockResponse, mockRawResponse } from './_helpers.js';

describe('SessionStatusService', () => {
  it('getSessions sends GET with sessionType query and returns items with metadata dates', async () => {
    const client = createMockRestClient();
    const service = new SessionStatusService(client);
    const body = {
      sessions: [
        {
          referenceNumber: 'sess-1',
          status: { code: 100, description: 'Open' },
          dateCreated: '2026-04-12T10:00:00Z',
          dateUpdated: '2026-04-12T10:15:30Z',
          validUntil: '2026-04-13T10:00:00Z',
          totalInvoiceCount: 0,
          successfulInvoiceCount: 0,
          failedInvoiceCount: 0,
        },
      ],
    };
    vi.mocked(client.execute).mockResolvedValueOnce(mockResponse(body));

    const result = await service.getSessions('online');

    const req = getRequest(vi.mocked(client.execute));
    expect(req.method).toBe('GET');
    expect(req.path).toBe(Routes.Sessions.root);
    expect(req.getQuery()).toEqual([['sessionType', 'online']]);
    expect(result).toEqual(body);
    expect(result.sessions[0].dateCreated).toBe('2026-04-12T10:00:00Z');
    expect(result.sessions[0].dateUpdated).toBe('2026-04-12T10:15:30Z');
  });

  it('getSessions with pagination sets pageSize query and x-continuation-token header', async () => {
    const client = createMockRestClient();
    const service = new SessionStatusService(client);
    vi.mocked(client.execute).mockResolvedValueOnce(mockResponse({ sessions: [] }));

    await service.getSessions('batch', 50, 'tok-abc');

    const req = getRequest(vi.mocked(client.execute));
    expect(req.getQuery()).toEqual([
      ['sessionType', 'batch'],
      ['pageSize', '50'],
    ]);
    expect(req.getHeaders()).toHaveProperty('x-continuation-token', 'tok-abc');
  });

  it('getSessions with all filters sets date ranges and multiple sessionStatus entries', async () => {
    const client = createMockRestClient();
    const service = new SessionStatusService(client);
    vi.mocked(client.execute).mockResolvedValueOnce(mockResponse({ sessions: [] }));

    await service.getSessions('online', undefined, undefined, {
      referenceNumber: 'ref-123',
      dateCreatedFrom: '2025-01-01',
      dateCreatedTo: '2025-12-31',
      dateClosedFrom: '2025-02-01',
      dateClosedTo: '2025-11-30',
      dateModifiedFrom: '2025-03-01',
      dateModifiedTo: '2025-10-31',
      statuses: ['Open', 'Closed'],
    });

    const req = getRequest(vi.mocked(client.execute));
    expect(req.getQuery()).toEqual([
      ['sessionType', 'online'],
      ['referenceNumber', 'ref-123'],
      ['dateCreatedFrom', '2025-01-01'],
      ['dateCreatedTo', '2025-12-31'],
      ['dateClosedFrom', '2025-02-01'],
      ['dateClosedTo', '2025-11-30'],
      ['dateModifiedFrom', '2025-03-01'],
      ['dateModifiedTo', '2025-10-31'],
      ['statuses', 'Open'],
      ['statuses', 'Closed'],
    ]);
  });

  it('getSessionStatus sends GET to sessions/{ref} and returns metadata dates', async () => {
    const client = createMockRestClient();
    const service = new SessionStatusService(client);
    const body = {
      status: { code: 100, description: 'Open' },
      dateCreated: '2026-04-12T10:00:00Z',
      dateUpdated: '2026-04-12T10:15:30Z',
      validUntil: '2026-04-13T10:00:00Z',
      invoiceCount: 2,
      successfulInvoiceCount: 2,
      failedInvoiceCount: 0,
    };
    vi.mocked(client.execute).mockResolvedValueOnce(mockResponse(body));

    const result = await service.getSessionStatus('sess-1');

    const req = getRequest(vi.mocked(client.execute));
    expect(req.method).toBe('GET');
    expect(req.path).toBe(Routes.Sessions.byReference('sess-1'));
    expect(result).toEqual(body);
    expect(result.dateCreated).toBe('2026-04-12T10:00:00Z');
    expect(result.dateUpdated).toBe('2026-04-12T10:15:30Z');
  });

  it('getSessionInvoices sends GET without pagination params when not provided', async () => {
    const client = createMockRestClient();
    const service = new SessionStatusService(client);
    const body = { invoices: [] };
    vi.mocked(client.execute).mockResolvedValueOnce(mockResponse(body));

    const result = await service.getSessionInvoices('sess-2');

    const req = getRequest(vi.mocked(client.execute));
    expect(req.method).toBe('GET');
    expect(req.path).toBe(Routes.Sessions.invoices('sess-2'));
    expect(req.getQuery()).toEqual([]);
    expect(result).toEqual(body);
  });

  it('getSessionInvoices with pagination sets pageSize query and x-continuation-token header', async () => {
    const client = createMockRestClient();
    const service = new SessionStatusService(client);
    vi.mocked(client.execute).mockResolvedValueOnce(mockResponse({ invoices: [] }));

    await service.getSessionInvoices('sess-3', 25, 'cont-tok');

    const req = getRequest(vi.mocked(client.execute));
    expect(req.getQuery()).toEqual([
      ['pageSize', '25'],
    ]);
    expect(req.getHeaders()).toHaveProperty('x-continuation-token', 'cont-tok');
  });

  it('getSessionInvoice sends GET to sessions/{ref}/invoices/{invoiceRef}', async () => {
    const client = createMockRestClient();
    const service = new SessionStatusService(client);
    const body = { invoiceRef: 'inv-1', status: 'Accepted' };
    vi.mocked(client.execute).mockResolvedValueOnce(mockResponse(body));

    const result = await service.getSessionInvoice('sess-4', 'inv-1');

    const req = getRequest(vi.mocked(client.execute));
    expect(req.method).toBe('GET');
    expect(req.path).toBe(Routes.Sessions.invoice('sess-4', 'inv-1'));
    expect(result).toEqual(body);
  });

  it('getSessionFailedInvoices sends GET to sessions/{ref}/invoices/failed', async () => {
    const client = createMockRestClient();
    const service = new SessionStatusService(client);
    const body = { invoices: [] };
    vi.mocked(client.execute).mockResolvedValueOnce(mockResponse(body));

    const result = await service.getSessionFailedInvoices('sess-5', 10, 'cont-2');

    const req = getRequest(vi.mocked(client.execute));
    expect(req.method).toBe('GET');
    expect(req.path).toBe(Routes.Sessions.failedInvoices('sess-5'));
    expect(req.getQuery()).toEqual([
      ['pageSize', '10'],
    ]);
    expect(req.getHeaders()).toHaveProperty('x-continuation-token', 'cont-2');
    expect(result).toEqual(body);
  });

  it('getInvoiceUpoByKsefNumber returns upo and hash from response headers', async () => {
    const client = createMockRestClient();
    const service = new SessionStatusService(client);
    vi.mocked(client.executeRaw).mockResolvedValueOnce(
      mockRawResponse('<upo/>', { 'x-ms-meta-hash': 'abc123' }),
    );

    const result = await service.getInvoiceUpoByKsefNumber('sess-6', 'KSEF-001');

    const req = getRequest(vi.mocked(client.executeRaw));
    expect(req.method).toBe('GET');
    expect(req.path).toBe(Routes.Sessions.upoByKsefNumber('sess-6', 'KSEF-001'));
    expect(result.upo).toBe('<upo/>');
    expect(result.hash).toBe('abc123');
  });

  it('getInvoiceUpoByKsefNumber returns undefined hash when header is missing', async () => {
    const client = createMockRestClient();
    const service = new SessionStatusService(client);
    vi.mocked(client.executeRaw).mockResolvedValueOnce(
      mockRawResponse('<upo-no-hash/>'),
    );

    const result = await service.getInvoiceUpoByKsefNumber('sess-7', 'KSEF-002');

    expect(result.upo).toBe('<upo-no-hash/>');
    expect(result.hash).toBeUndefined();
  });

  it('getInvoiceUpoByReference returns upo and hash', async () => {
    const client = createMockRestClient();
    const service = new SessionStatusService(client);
    vi.mocked(client.executeRaw).mockResolvedValueOnce(
      mockRawResponse('<upo-by-ref/>', { 'x-ms-meta-hash': 'hash-xyz' }),
    );

    const result = await service.getInvoiceUpoByReference('sess-8', 'inv-ref-1');

    const req = getRequest(vi.mocked(client.executeRaw));
    expect(req.method).toBe('GET');
    expect(req.path).toBe(Routes.Sessions.upoByInvoiceReference('sess-8', 'inv-ref-1'));
    expect(result.upo).toBe('<upo-by-ref/>');
    expect(result.hash).toBe('hash-xyz');
  });

  it('getSessionUpo returns upo and hash', async () => {
    const client = createMockRestClient();
    const service = new SessionStatusService(client);
    vi.mocked(client.executeRaw).mockResolvedValueOnce(
      mockRawResponse('<session-upo/>', { 'x-ms-meta-hash': 'hash-sess' }),
    );

    const result = await service.getSessionUpo('sess-9', 'upo-ref-1');

    const req = getRequest(vi.mocked(client.executeRaw));
    expect(req.method).toBe('GET');
    expect(req.path).toBe(Routes.Sessions.upo('sess-9', 'upo-ref-1'));
    expect(result.upo).toBe('<session-upo/>');
    expect(result.hash).toBe('hash-sess');
  });
});
