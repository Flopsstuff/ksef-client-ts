import { InvoiceDownloadService } from '../../../src/services/invoice-download.js';
import { Routes } from '../../../src/http/routes.js';
import { createMockRestClient, getRequest, mockResponse, mockRawResponse } from './_helpers.js';

describe('InvoiceDownloadService', () => {
  it('getInvoice returns xml and hash from response headers', async () => {
    const client = createMockRestClient();
    const service = new InvoiceDownloadService(client);
    (client.executeRaw as any).mockResolvedValueOnce(
      mockRawResponse('<invoice-xml/>', { 'x-ms-meta-hash': 'abc123hash' }),
    );

    const result = await service.getInvoice('KSeF-123');

    expect(result.xml).toBe('<invoice-xml/>');
    expect(result.hash).toBe('abc123hash');
  });

  it('getInvoice returns undefined hash when header is missing', async () => {
    const client = createMockRestClient();
    const service = new InvoiceDownloadService(client);
    (client.executeRaw as any).mockResolvedValueOnce(mockRawResponse('<invoice-xml/>'));

    const result = await service.getInvoice('KSeF-123');

    expect(result.xml).toBe('<invoice-xml/>');
    expect(result.hash).toBeUndefined();
  });

  it('queryInvoiceMetadata sends POST with filters body and no query params', async () => {
    const client = createMockRestClient();
    const service = new InvoiceDownloadService(client);
    const filters = { subjectType: 'subject1', type: 'incremental' };
    const body = { invoices: [], numberOfElements: 0, pageOffset: 0, pageSize: 10 };
    vi.mocked(client.execute).mockResolvedValueOnce(mockResponse(body));

    const result = await service.queryInvoiceMetadata(filters as any);

    const req = getRequest(vi.mocked(client.execute));
    expect(req.method).toBe('POST');
    expect(req.path).toBe(Routes.Invoices.queryMetadata);
    expect(req.getBody()).toEqual(filters);
    expect(req.getQuery()).toEqual([]);
    expect(result).toEqual(body);
  });

  it('queryInvoiceMetadata with pagination sends pageOffset, pageSize, sortOrder as query params', async () => {
    const client = createMockRestClient();
    const service = new InvoiceDownloadService(client);
    const filters = { subjectType: 'subject1' };
    const body = { invoices: [], numberOfElements: 0, pageOffset: 2, pageSize: 50 };
    vi.mocked(client.execute).mockResolvedValueOnce(mockResponse(body));

    await service.queryInvoiceMetadata(filters as any, 2, 50, 'Asc');

    const req = getRequest(vi.mocked(client.execute));
    expect(req.method).toBe('POST');
    expect(req.path).toBe(Routes.Invoices.queryMetadata);
    expect(req.getBody()).toEqual(filters);
    expect(req.getQuery()).toEqual([
      ['pageOffset', '2'],
      ['pageSize', '50'],
      ['sortOrder', 'Asc'],
    ]);
  });

  it('exportInvoices sends POST with request body', async () => {
    const client = createMockRestClient();
    const service = new InvoiceDownloadService(client);
    const exportRequest = { subjectType: 'subject1', type: 'full' };
    const body = { referenceNumber: 'ref-42', timestamp: '2025-01-01T00:00:00Z' };
    vi.mocked(client.execute).mockResolvedValueOnce(mockResponse(body));

    const result = await service.exportInvoices(exportRequest as any);

    const req = getRequest(vi.mocked(client.execute));
    expect(req.method).toBe('POST');
    expect(req.path).toBe(Routes.Invoices.exports);
    expect(req.getBody()).toEqual(exportRequest);
    expect(result).toEqual(body);
  });

  it('getInvoiceExportStatus sends GET with ref in path', async () => {
    const client = createMockRestClient();
    const service = new InvoiceDownloadService(client);
    const body = { processingCode: 200, referenceNumber: 'export-ref-99' };
    vi.mocked(client.execute).mockResolvedValueOnce(mockResponse(body));

    const result = await service.getInvoiceExportStatus('export-ref-99');

    const req = getRequest(vi.mocked(client.execute));
    expect(req.method).toBe('GET');
    expect(req.path).toBe(Routes.Invoices.exportByReference('export-ref-99'));
    expect(result).toEqual(body);
  });

  it('getInvoice uses executeRaw not execute', async () => {
    const client = createMockRestClient();
    const service = new InvoiceDownloadService(client);
    (client.executeRaw as any).mockResolvedValueOnce(mockRawResponse('<xml/>'));

    await service.getInvoice('KSeF-456');

    expect(client.executeRaw).toHaveBeenCalledTimes(1);
    expect(client.execute).not.toHaveBeenCalled();
  });
});
