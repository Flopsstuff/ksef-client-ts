import { TokenService } from '../../../src/services/tokens.js';
import type { KsefTokenPermissionType, KsefTokenRequest } from '../../../src/models/tokens/types.js';
import { createMockRestClient, getRequest, mockResponse } from '../services/_helpers.js';

describe('KsefTokenPermissionType', () => {
  it('accepts all seven permission values including Introspection', () => {
    const all: KsefTokenPermissionType[] = [
      'InvoiceRead',
      'InvoiceWrite',
      'CredentialsRead',
      'CredentialsManage',
      'EnforcementOperations',
      'SubunitManage',
      'Introspection',
    ];
    expect(all).toHaveLength(7);
    expect(all).toContain('Introspection');
  });

  it('passes Introspection permission through generateToken body', async () => {
    const client = createMockRestClient();
    vi.mocked(client.execute).mockResolvedValueOnce(mockResponse({ tokenReference: 'ref' }));
    const service = new TokenService(client);
    const request: KsefTokenRequest = {
      description: 'introspection-only token',
      permissions: ['Introspection'],
    };

    await service.generateToken(request as any);

    const req = getRequest(vi.mocked(client.execute));
    expect(req.getBody()).toEqual(request);
  });
});
