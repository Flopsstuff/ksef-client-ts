import { OnlineSessionService } from '../../../src/services/online-session.js';
import { KSEF_FEATURE_HEADER, KSeFFeature, UpoVersion } from '../../../src/http/ksef-feature.js';
import { KSeFValidationError } from '../../../src/errors/ksef-validation-error.js';
import { Routes } from '../../../src/http/routes.js';
import { createMockRestClient, getRequest, mockResponse } from './_helpers.js';

describe('OnlineSessionService', () => {
  it('openSession sends POST to sessions/online with body and no X-KSeF-Feature header', async () => {
    const client = createMockRestClient();
    const service = new OnlineSessionService(client);
    const request = { nip: '1234567890', encryptedToken: 'abc' } as any;
    const body = { sessionRef: 'ref-1', challenge: 'ch' };
    vi.mocked(client.execute).mockResolvedValueOnce(mockResponse(body));

    const result = await service.openSession(request);

    const req = getRequest(vi.mocked(client.execute));
    expect(req.method).toBe('POST');
    expect(req.path).toBe(Routes.Sessions.Online.open);
    expect(req.getBody()).toBe(request);
    expect(req.getHeaders()).not.toHaveProperty('X-KSeF-Feature');
    expect(result).toEqual(body);
  });

  it('openSession with UpoVersion.V4_3 sets X-KSeF-Feature header', async () => {
    const client = createMockRestClient();
    const service = new OnlineSessionService(client);
    const request = { nip: '1234567890' } as any;
    const body = { sessionRef: 'ref-2' };
    vi.mocked(client.execute).mockResolvedValueOnce(mockResponse(body));

    await service.openSession(request, UpoVersion.V4_3);

    const req = getRequest(vi.mocked(client.execute));
    expect(req.method).toBe('POST');
    expect(req.path).toBe(Routes.Sessions.Online.open);
    expect(req.getHeaders()).toHaveProperty(KSEF_FEATURE_HEADER, 'upo-v4-3');
  });

  it('openSession with UpoVersion.V4_2 sets X-KSeF-Feature header', async () => {
    const client = createMockRestClient();
    const service = new OnlineSessionService(client);
    const request = { nip: '1234567890' } as any;
    vi.mocked(client.execute).mockResolvedValueOnce(mockResponse({ sessionRef: 'ref-3' }));

    await service.openSession(request, UpoVersion.V4_2);

    const req = getRequest(vi.mocked(client.execute));
    expect(req.getHeaders()).toHaveProperty(KSEF_FEATURE_HEADER, 'upo-v4-2');
  });

  it('openSession with KSeFFeature.SubjectIdentifierValidation sets X-KSeF-Feature header', async () => {
    const client = createMockRestClient();
    const service = new OnlineSessionService(client);
    const request = { nip: '1234567890' } as any;
    vi.mocked(client.execute).mockResolvedValueOnce(mockResponse({ sessionRef: 'ref-3' }));

    await service.openSession(request, KSeFFeature.SubjectIdentifierValidation);

    const req = getRequest(vi.mocked(client.execute));
    expect(req.getHeaders()).toHaveProperty(KSEF_FEATURE_HEADER, 'subject-identifier-validation');
  });

  it('openSession accepts a single-value feature array and merges repeats', async () => {
    const client = createMockRestClient();
    const service = new OnlineSessionService(client);
    const request = { nip: '1234567890' } as any;
    vi.mocked(client.execute).mockResolvedValueOnce(mockResponse({ sessionRef: 'ref-3' }));

    await service.openSession(request, [KSeFFeature.SubjectIdentifierValidation, '', KSeFFeature.SubjectIdentifierValidation]);

    const req = getRequest(vi.mocked(client.execute));
    expect(req.getHeaders()).toHaveProperty(KSEF_FEATURE_HEADER, 'subject-identifier-validation');
  });

  it('openSession sends no X-KSeF-Feature header for an empty feature array', async () => {
    const client = createMockRestClient();
    const service = new OnlineSessionService(client);
    const request = { nip: '1234567890' } as any;
    vi.mocked(client.execute).mockResolvedValueOnce(mockResponse({ sessionRef: 'ref-3' }));

    await service.openSession(request, []);

    const req = getRequest(vi.mocked(client.execute));
    expect(req.getHeaders()).not.toHaveProperty(KSEF_FEATURE_HEADER);
  });

  it('openSession collapses a comma-delimited string of one repeated feature', async () => {
    const client = createMockRestClient();
    const service = new OnlineSessionService(client);
    const request = { nip: '1234567890' } as any;
    vi.mocked(client.execute).mockResolvedValueOnce(mockResponse({ sessionRef: 'ref-3' }));

    await service.openSession(request, 'subject-identifier-validation, subject-identifier-validation, ');

    const req = getRequest(vi.mocked(client.execute));
    expect(req.getHeaders()).toHaveProperty(KSEF_FEATURE_HEADER, 'subject-identifier-validation');
  });

  it('openSession rejects a comma-delimited string of distinct features without sending', async () => {
    const client = createMockRestClient();
    const service = new OnlineSessionService(client);
    const request = { nip: '1234567890' } as any;

    await expect(service.openSession(request, 'upo-v4-3,subject-identifier-validation'))
      .rejects.toBeInstanceOf(KSeFValidationError);
    expect(client.execute).not.toHaveBeenCalled();
  });

  it('openSession rejects more than one distinct feature without sending', async () => {
    const client = createMockRestClient();
    const service = new OnlineSessionService(client);
    const request = { nip: '1234567890' } as any;

    await expect(service.openSession(request, [UpoVersion.V4_3, KSeFFeature.SubjectIdentifierValidation]))
      .rejects.toBeInstanceOf(KSeFValidationError);
    expect(client.execute).not.toHaveBeenCalled();
  });

  it('sendInvoice sends POST to sessions/online/{sessionRef}/invoices with body', async () => {
    const client = createMockRestClient();
    const service = new OnlineSessionService(client);
    const request = { invoiceBody: '<xml/>' } as any;
    const body = { invoiceRef: 'inv-1' };
    vi.mocked(client.execute).mockResolvedValueOnce(mockResponse(body));

    const result = await service.sendInvoice('sess-abc', request);

    const req = getRequest(vi.mocked(client.execute));
    expect(req.method).toBe('POST');
    expect(req.path).toBe(Routes.Sessions.Online.invoices('sess-abc'));
    expect(req.getBody()).toBe(request);
    expect(result).toEqual(body);
  });

  it('closeSession sends POST to sessions/online/{sessionRef}/close', async () => {
    const client = createMockRestClient();
    const service = new OnlineSessionService(client);

    await service.closeSession('sess-xyz');

    const req = getRequest(vi.mocked(client.executeVoid));
    expect(req.method).toBe('POST');
    expect(req.path).toBe(Routes.Sessions.Online.close('sess-xyz'));
    expect(client.executeVoid).toHaveBeenCalledTimes(1);
  });
});
