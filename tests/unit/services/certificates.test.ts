import { CertificateApiService } from '../../../src/services/certificates.js';
import { Routes } from '../../../src/http/routes.js';
import { createMockRestClient, getRequest, mockResponse } from './_helpers.js';

describe('CertificateApiService', () => {
  it('getLimits sends GET to certificates/limits', async () => {
    const client = createMockRestClient();
    const service = new CertificateApiService(client);
    const expected = { maxCertificates: 10 };
    vi.mocked(client.execute).mockResolvedValueOnce(mockResponse(expected));

    const result = await service.getLimits();

    const req = getRequest(vi.mocked(client.execute));
    expect(req.method).toBe('GET');
    expect(req.path).toBe(Routes.Certificates.limits);
    expect(result).toEqual(expected);
  });

  it('getEnrollmentData sends GET to certificates/enrollments/data', async () => {
    const client = createMockRestClient();
    const service = new CertificateApiService(client);
    const expected = { enrollmentData: { csrTemplate: 'template' } };
    vi.mocked(client.execute).mockResolvedValueOnce(mockResponse(expected));

    const result = await service.getEnrollmentData();

    const req = getRequest(vi.mocked(client.execute));
    expect(req.method).toBe('GET');
    expect(req.path).toBe(Routes.Certificates.enrollmentData);
    expect(result).toEqual(expected);
  });

  it('enroll sends POST with body to certificates/enrollments', async () => {
    const client = createMockRestClient();
    const service = new CertificateApiService(client);
    const request = { csr: 'csr-data', description: 'test cert' };
    const expected = { enrollmentReference: 'enroll-ref-123' };
    vi.mocked(client.execute).mockResolvedValueOnce(mockResponse(expected));

    const result = await service.enroll(request as any);

    const req = getRequest(vi.mocked(client.execute));
    expect(req.method).toBe('POST');
    expect(req.path).toBe(Routes.Certificates.enrollments);
    expect(req.getBody()).toEqual(request);
    expect(result).toEqual(expected);
  });

  it('getEnrollmentStatus sends GET with ref in path', async () => {
    const client = createMockRestClient();
    const service = new CertificateApiService(client);
    const expected = { status: 'COMPLETED' };
    vi.mocked(client.execute).mockResolvedValueOnce(mockResponse(expected));

    const result = await service.getEnrollmentStatus('ref-abc-456');

    const req = getRequest(vi.mocked(client.execute));
    expect(req.method).toBe('GET');
    expect(req.path).toBe(Routes.Certificates.enrollmentStatus('ref-abc-456'));
    expect(result).toEqual(expected);
  });

  it('retrieve sends POST with body to certificates/retrieve', async () => {
    const client = createMockRestClient();
    const service = new CertificateApiService(client);
    const request = { certificateSerialNumbers: ['0123456789ABCDEF', 'FEDCBA9876543210'] };
    const expected = { certificates: [{ certificateSerialNumber: '0123456789ABCDEF' }] };
    vi.mocked(client.execute).mockResolvedValueOnce(mockResponse(expected));

    const result = await service.retrieve(request as any);

    const req = getRequest(vi.mocked(client.execute));
    expect(req.method).toBe('POST');
    expect(req.path).toBe(Routes.Certificates.retrieve);
    expect(req.getBody()).toEqual(request);
    expect(result).toEqual(expected);
  });

  it('retrieve rejects a malformed serial number before the HTTP call', async () => {
    const client = createMockRestClient();
    const service = new CertificateApiService(client);
    const request = { certificateSerialNumbers: ['0123456789ABCDEF', 'not-a-serial'] };

    await expect(service.retrieve(request as any)).rejects.toMatchObject({
      name: 'KSeFValidationError',
    });
    expect(client.execute).not.toHaveBeenCalled();
  });

  it('retrieve rejects lowercase hex serials', async () => {
    const client = createMockRestClient();
    const service = new CertificateApiService(client);
    const request = { certificateSerialNumbers: ['0123456789abcdef'] };

    await expect(service.retrieve(request as any)).rejects.toMatchObject({
      name: 'KSeFValidationError',
    });
    expect(client.execute).not.toHaveBeenCalled();
  });

  it('revoke sends POST with serialNumber in path and body', async () => {
    const client = createMockRestClient();
    const service = new CertificateApiService(client);
    const request = { revocationReason: 'KeyCompromise' as const };

    await service.revoke('SN-12345', request);

    const req = getRequest(vi.mocked(client.executeVoid));
    expect(req.method).toBe('POST');
    expect(req.path).toBe(Routes.Certificates.revoke('SN-12345'));
    expect(req.getBody()).toEqual(request);
  });

  it('query sends POST with body and no query params when pagination not provided', async () => {
    const client = createMockRestClient();
    const service = new CertificateApiService(client);
    const request = { status: 'ACTIVE' };
    const expected = { certificates: [], hasMore: false };
    vi.mocked(client.execute).mockResolvedValueOnce(mockResponse(expected));

    const result = await service.query(request as any);

    const req = getRequest(vi.mocked(client.execute));
    expect(req.method).toBe('POST');
    expect(req.path).toBe(Routes.Certificates.query);
    expect(req.getBody()).toEqual(request);
    expect(req.getQuery()).toEqual([]);
    expect(result).toEqual(expected);
  });

  it('query includes pageSize and pageOffset as query params when provided', async () => {
    const client = createMockRestClient();
    const service = new CertificateApiService(client);
    const request = { status: 'ACTIVE' };
    const expected = { certificates: [], hasMore: false };
    vi.mocked(client.execute).mockResolvedValueOnce(mockResponse(expected));

    const result = await service.query(request as any, 50, 2);

    const req = getRequest(vi.mocked(client.execute));
    expect(req.method).toBe('POST');
    expect(req.path).toBe(Routes.Certificates.query);
    expect(req.getBody()).toEqual(request);
    expect(req.getQuery()).toEqual([
      ['pageSize', '50'],
      ['pageOffset', '2'],
    ]);
    expect(result).toEqual(expected);
  });

  it('revoke returns void (executeVoid called once, result is undefined)', async () => {
    const client = createMockRestClient();
    const service = new CertificateApiService(client);

    const result = await service.revoke('SN-999', { revocationReason: 'Unspecified' });

    expect(client.executeVoid).toHaveBeenCalledTimes(1);
    expect(result).toBeUndefined();
  });
});
