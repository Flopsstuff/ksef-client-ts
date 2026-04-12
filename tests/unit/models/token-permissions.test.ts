import { TokenService } from '../../../src/services/tokens.js';
import type { KsefTokenPermissionType, KsefTokenRequest } from '../../../src/models/tokens/types.js';
import { createMockRestClient, getRequest, mockResponse } from '../services/_helpers.js';

describe('KsefTokenPermissionType', () => {
  // Compile-time drift guard: if a new value is added to KsefTokenPermissionType
  // without extending this switch, the `_never: never` assignment fails tsc.
  // This forces the literal array in the test below to be kept in sync with
  // the type, so the length/contains assertions remain meaningful.
  function assertExhaustive(p: KsefTokenPermissionType): void {
    switch (p) {
      case 'InvoiceRead':
      case 'InvoiceWrite':
      case 'CredentialsRead':
      case 'CredentialsManage':
      case 'EnforcementOperations':
      case 'SubunitManage':
      case 'Introspection':
        return;
      default: {
        const _never: never = p;
        return _never;
      }
    }
  }

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
    for (const p of all) assertExhaustive(p);
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

    await service.generateToken(request);

    const req = getRequest(vi.mocked(client.execute));
    expect(req.getBody()).toEqual(request);
  });
});
