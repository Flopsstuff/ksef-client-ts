import { OnlineSessionService } from '../../../src/services/online-session.js';
import { KSEF_FEATURE_HEADER, UpoVersion } from '../../../src/http/ksef-feature.js';
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
