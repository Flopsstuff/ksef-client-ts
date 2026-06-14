import { PermissionsService } from '../../../src/services/permissions.js';
import { Routes } from '../../../src/http/routes.js';
import { KSeFValidationError } from '../../../src/errors/ksef-validation-error.js';
import { createMockRestClient, getRequest, mockResponse } from './_helpers.js';

describe('PermissionsService', () => {
  let client: ReturnType<typeof createMockRestClient>;
  let service: PermissionsService;

  beforeEach(() => {
    client = createMockRestClient();
    service = new PermissionsService(client);
  });

  describe('grant methods', () => {
    const request = { nip: '1234567890' };
    const expected = { referenceNumber: 'op-ref-1' };

    it('grantPersonPermissions sends POST to persons grants route', async () => {
      vi.mocked(client.execute).mockResolvedValueOnce(mockResponse(expected));

      const result = await service.grantPersonPermissions(request as any);

      const req = getRequest(vi.mocked(client.execute));
      expect(req.method).toBe('POST');
      expect(req.path).toBe(Routes.Permissions.Grants.persons);
      expect(req.getBody()).toEqual(request);
      expect(result).toEqual(expected);
    });

    it('grantEntityPermissions sends POST to entities grants route', async () => {
      vi.mocked(client.execute).mockResolvedValueOnce(mockResponse(expected));

      const result = await service.grantEntityPermissions(request as any);

      const req = getRequest(vi.mocked(client.execute));
      expect(req.method).toBe('POST');
      expect(req.path).toBe(Routes.Permissions.Grants.entities);
      expect(req.getBody()).toEqual(request);
      expect(result).toEqual(expected);
    });

    it('grantAuthorizationPermissions sends POST to authorizations grants route', async () => {
      vi.mocked(client.execute).mockResolvedValueOnce(mockResponse(expected));

      const result = await service.grantAuthorizationPermissions(request as any);

      const req = getRequest(vi.mocked(client.execute));
      expect(req.method).toBe('POST');
      expect(req.path).toBe(Routes.Permissions.Grants.authorizations);
      expect(req.getBody()).toEqual(request);
      expect(result).toEqual(expected);
    });

    it('grantIndirectPermissions sends POST to indirect grants route', async () => {
      vi.mocked(client.execute).mockResolvedValueOnce(mockResponse(expected));

      const result = await service.grantIndirectPermissions(request as any);

      const req = getRequest(vi.mocked(client.execute));
      expect(req.method).toBe('POST');
      expect(req.path).toBe(Routes.Permissions.Grants.indirect);
      expect(req.getBody()).toEqual(request);
      expect(result).toEqual(expected);
    });

    it('grantSubunitPermissions sends POST to subunits grants route', async () => {
      vi.mocked(client.execute).mockResolvedValueOnce(mockResponse(expected));

      const result = await service.grantSubunitPermissions(request as any);

      const req = getRequest(vi.mocked(client.execute));
      expect(req.method).toBe('POST');
      expect(req.path).toBe(Routes.Permissions.Grants.subunits);
      expect(req.getBody()).toEqual(request);
      expect(result).toEqual(expected);
    });

    it('grantEuEntityAdminPermissions sends POST to euEntities grants route', async () => {
      vi.mocked(client.execute).mockResolvedValueOnce(mockResponse(expected));

      const result = await service.grantEuEntityAdminPermissions(request as any);

      const req = getRequest(vi.mocked(client.execute));
      expect(req.method).toBe('POST');
      expect(req.path).toBe(Routes.Permissions.Grants.euEntities);
      expect(req.getBody()).toEqual(request);
      expect(result).toEqual(expected);
    });

    it('grantEuEntityRepresentativePermissions sends POST to euEntitiesRepresentatives grants route', async () => {
      vi.mocked(client.execute).mockResolvedValueOnce(mockResponse(expected));

      const result = await service.grantEuEntityRepresentativePermissions(request as any);

      const req = getRequest(vi.mocked(client.execute));
      expect(req.method).toBe('POST');
      expect(req.path).toBe(Routes.Permissions.Grants.euEntitiesRepresentatives);
      expect(req.getBody()).toEqual(request);
      expect(result).toEqual(expected);
    });

    it('grantEuEntityPermissions (deprecated) delegates to grantEuEntityAdminPermissions', async () => {
      const spy = vi.spyOn(service, 'grantEuEntityAdminPermissions').mockResolvedValue({ referenceNumber: 'ref' });

      await service.grantEuEntityPermissions(request as any);

      expect(spy).toHaveBeenCalledWith(request);
    });
  });

  describe('revoke methods', () => {
    const expected = { referenceNumber: 'revoke-ref-1' };

    it('revokeCommonGrant sends DELETE to common grants path with grantId', async () => {
      vi.mocked(client.execute).mockResolvedValueOnce(mockResponse(expected));

      const result = await service.revokeCommonGrant('grant-abc-123');

      const req = getRequest(vi.mocked(client.execute));
      expect(req.method).toBe('DELETE');
      expect(req.path).toBe(Routes.Permissions.Common.grantById('grant-abc-123'));
      expect(result).toEqual(expected);
    });

    it('revokeAuthorizationGrant sends DELETE to authorizations grants path with grantId', async () => {
      vi.mocked(client.execute).mockResolvedValueOnce(mockResponse(expected));

      const result = await service.revokeAuthorizationGrant('auth-grant-456');

      const req = getRequest(vi.mocked(client.execute));
      expect(req.method).toBe('DELETE');
      expect(req.path).toBe(Routes.Permissions.Authorizations.grantById('auth-grant-456'));
      expect(result).toEqual(expected);
    });
  });

  describe('query methods', () => {
    it('queryPersonalGrants sends POST with options and pagination query params', async () => {
      const options = { fromDate: '2024-01-01' };
      const expected = { grants: [], hasMore: false };
      vi.mocked(client.execute).mockResolvedValueOnce(mockResponse(expected));

      const result = await service.queryPersonalGrants(options as any, 2, 50);

      const req = getRequest(vi.mocked(client.execute));
      expect(req.method).toBe('POST');
      expect(req.path).toBe(Routes.Permissions.Query.personalGrants);
      expect(req.getBody()).toEqual(options);
      expect(req.getQuery()).toEqual([
        ['pageOffset', '2'],
        ['pageSize', '50'],
      ]);
      expect(result).toEqual(expected);
    });

    it('queryPersonalGrants without options sends empty object as body', async () => {
      const expected = { grants: [], hasMore: false };
      vi.mocked(client.execute).mockResolvedValueOnce(mockResponse(expected));

      const result = await service.queryPersonalGrants();

      const req = getRequest(vi.mocked(client.execute));
      expect(req.method).toBe('POST');
      expect(req.path).toBe(Routes.Permissions.Query.personalGrants);
      expect(req.getBody()).toEqual({});
      expect(result).toEqual(expected);
    });

    it('queryPersonsGrants sends POST with required options', async () => {
      const options = { nip: '1234567890' };
      const expected = { grants: [], hasMore: false };
      vi.mocked(client.execute).mockResolvedValueOnce(mockResponse(expected));

      const result = await service.queryPersonsGrants(options as any);

      const req = getRequest(vi.mocked(client.execute));
      expect(req.method).toBe('POST');
      expect(req.path).toBe(Routes.Permissions.Query.personsGrants);
      expect(req.getBody()).toEqual(options);
      expect(result).toEqual(expected);
    });

    it('querySubunitsGrants sends POST with options', async () => {
      const options = { subunitCode: 'SUB-001' };
      const expected = { grants: [], hasMore: false };
      vi.mocked(client.execute).mockResolvedValueOnce(mockResponse(expected));

      const result = await service.querySubunitsGrants(options as any);

      const req = getRequest(vi.mocked(client.execute));
      expect(req.method).toBe('POST');
      expect(req.path).toBe(Routes.Permissions.Query.subunitsGrants);
      expect(req.getBody()).toEqual(options);
      expect(result).toEqual(expected);
    });

    it('querySubunitsGrants without options sends empty object as body', async () => {
      const expected = { grants: [], hasMore: false };
      vi.mocked(client.execute).mockResolvedValueOnce(mockResponse(expected));

      const result = await service.querySubunitsGrants();

      const req = getRequest(vi.mocked(client.execute));
      expect(req.method).toBe('POST');
      expect(req.path).toBe(Routes.Permissions.Query.subunitsGrants);
      expect(req.getBody()).toEqual({});
      expect(result).toEqual(expected);
    });

    it('queryEntitiesRoles sends GET (not POST) to entities roles route', async () => {
      const expected = { roles: [], hasMore: false };
      vi.mocked(client.execute).mockResolvedValueOnce(mockResponse(expected));

      const result = await service.queryEntitiesRoles();

      const req = getRequest(vi.mocked(client.execute));
      expect(req.method).toBe('GET');
      expect(req.path).toBe(Routes.Permissions.Query.entitiesRoles);
      expect(req.getBody()).toBeUndefined();
      expect(result).toEqual(expected);
    });

    it('queryEntitiesRoles with pagination passes pageOffset and pageSize as query params', async () => {
      const expected = { roles: [], hasMore: false };
      vi.mocked(client.execute).mockResolvedValueOnce(mockResponse(expected));

      const result = await service.queryEntitiesRoles({ pageOffset: 3, pageSize: 25 });

      const req = getRequest(vi.mocked(client.execute));
      expect(req.method).toBe('GET');
      expect(req.path).toBe(Routes.Permissions.Query.entitiesRoles);
      expect(req.getQuery()).toEqual([
        ['pageOffset', '3'],
        ['pageSize', '25'],
      ]);
      expect(result).toEqual(expected);
    });

    it('queryEntitiesGrants sends POST with body', async () => {
      const options = { entityNip: '9876543210' };
      const expected = { grants: [], hasMore: false };
      vi.mocked(client.execute).mockResolvedValueOnce(mockResponse(expected));

      const result = await service.queryEntitiesGrants(options as any);

      const req = getRequest(vi.mocked(client.execute));
      expect(req.method).toBe('POST');
      expect(req.path).toBe(Routes.Permissions.Query.entitiesGrants);
      expect(req.getBody()).toEqual(options);
      expect(result).toEqual(expected);
    });

    it('queryEntitiesGrants forwards InternalId contextIdentifier in body', async () => {
      const options = { contextIdentifier: { type: 'InternalId' as const, value: '7762811692-12345' } };
      const expected = { permissions: [], hasMore: false };
      vi.mocked(client.execute).mockResolvedValueOnce(mockResponse(expected));

      await service.queryEntitiesGrants(options);

      const req = getRequest(vi.mocked(client.execute));
      expect(req.getBody()).toEqual(options);
    });

    it('queryPersonalGrants forwards InternalId contextIdentifier in body', async () => {
      const options = { contextIdentifier: { type: 'InternalId' as const, value: '7762811692-12345' } };
      const expected = { permissions: [], hasMore: false };
      vi.mocked(client.execute).mockResolvedValueOnce(mockResponse(expected));

      await service.queryPersonalGrants(options);

      const req = getRequest(vi.mocked(client.execute));
      expect(req.getBody()).toEqual(options);
    });

    it('queryPersonalGrants throws KSeFValidationError when InternalId is shorter than 10 chars', async () => {
      const options = { contextIdentifier: { type: 'InternalId' as const, value: '123456789' } };
      await expect(service.queryPersonalGrants(options)).rejects.toThrow(KSeFValidationError);
      await expect(service.queryPersonalGrants(options)).rejects.toThrow(/InternalId must be 10-16 characters/);
      expect(client.execute).not.toHaveBeenCalled();
    });

    it('queryPersonalGrants throws KSeFValidationError when InternalId is longer than 16 chars', async () => {
      const options = { contextIdentifier: { type: 'InternalId' as const, value: '12345678901234567' } };
      await expect(service.queryPersonalGrants(options)).rejects.toThrow(KSeFValidationError);
      await expect(service.queryPersonalGrants(options)).rejects.toThrow(/InternalId must be 10-16 characters/);
      expect(client.execute).not.toHaveBeenCalled();
    });

    it('queryEntitiesGrants throws KSeFValidationError when InternalId is out of range', async () => {
      const options = { contextIdentifier: { type: 'InternalId' as const, value: 'short' } };
      await expect(service.queryEntitiesGrants(options)).rejects.toThrow(KSeFValidationError);
      await expect(service.queryEntitiesGrants(options)).rejects.toThrow(/InternalId must be 10-16 characters/);
      expect(client.execute).not.toHaveBeenCalled();
    });

    it('queryPersonalGrants accepts InternalId at the 10-char lower boundary', async () => {
      // Boundary pin: the previous tests cover 9 (rejected) and 16 (accepted)
      // — this one catches an off-by-one regression that rejects exactly 10.
      const options = { contextIdentifier: { type: 'InternalId' as const, value: '1234567890' } };
      const expected = { permissions: [], hasMore: false };
      vi.mocked(client.execute).mockResolvedValueOnce(mockResponse(expected));

      await service.queryPersonalGrants(options);

      const req = getRequest(vi.mocked(client.execute));
      expect(req.getBody()).toEqual(options);
    });

    it('queryPersonalGrants accepts Nip contextIdentifier with any length (validation scoped to InternalId)', async () => {
      const options = { contextIdentifier: { type: 'Nip' as const, value: '1' } };
      const expected = { permissions: [], hasMore: false };
      vi.mocked(client.execute).mockResolvedValueOnce(mockResponse(expected));

      await service.queryPersonalGrants(options);

      const req = getRequest(vi.mocked(client.execute));
      expect(req.getBody()).toEqual(options);
    });

    it('querySubordinateEntitiesRoles sends POST with body defaulting to empty object', async () => {
      const expected = { roles: [], hasMore: false };
      vi.mocked(client.execute).mockResolvedValueOnce(mockResponse(expected));

      const result = await service.querySubordinateEntitiesRoles();

      const req = getRequest(vi.mocked(client.execute));
      expect(req.method).toBe('POST');
      expect(req.path).toBe(Routes.Permissions.Query.subordinateEntitiesRoles);
      expect(req.getBody()).toEqual({});
      expect(result).toEqual(expected);
    });

    it('queryAuthorizationsGrants sends POST with required options', async () => {
      const options = { authorizationType: 'SelfInvoicing' };
      const expected = { grants: [], hasMore: false };
      vi.mocked(client.execute).mockResolvedValueOnce(mockResponse(expected));

      const result = await service.queryAuthorizationsGrants(options as any);

      const req = getRequest(vi.mocked(client.execute));
      expect(req.method).toBe('POST');
      expect(req.path).toBe(Routes.Permissions.Query.authorizationsGrants);
      expect(req.getBody()).toEqual(options);
      expect(result).toEqual(expected);
    });

    it('queryEuEntitiesGrants sends POST with body defaulting to empty object', async () => {
      const expected = { grants: [], hasMore: false };
      vi.mocked(client.execute).mockResolvedValueOnce(mockResponse(expected));

      const result = await service.queryEuEntitiesGrants();

      const req = getRequest(vi.mocked(client.execute));
      expect(req.method).toBe('POST');
      expect(req.path).toBe(Routes.Permissions.Query.euEntitiesGrants);
      expect(req.getBody()).toEqual({});
      expect(result).toEqual(expected);
    });

    it('queryEuEntitiesGrants with pagination passes pageOffset and pageSize as query params', async () => {
      const options = { euEntityId: 'EU-001' };
      const expected = { grants: [], hasMore: false };
      vi.mocked(client.execute).mockResolvedValueOnce(mockResponse(expected));

      const result = await service.queryEuEntitiesGrants(options as any, 1, 100);

      const req = getRequest(vi.mocked(client.execute));
      expect(req.method).toBe('POST');
      expect(req.path).toBe(Routes.Permissions.Query.euEntitiesGrants);
      expect(req.getBody()).toEqual(options);
      expect(req.getQuery()).toEqual([
        ['pageOffset', '1'],
        ['pageSize', '100'],
      ]);
      expect(result).toEqual(expected);
    });

    // Pagination pass-through for the remaining query methods: each forwards
    // pageOffset/pageSize as query params only when the args are provided.
    it.each([
      ['queryPersonsGrants', Routes.Permissions.Query.personsGrants, { nip: '1234567890' }],
      ['querySubunitsGrants', Routes.Permissions.Query.subunitsGrants, { subunitCode: 'SUB-001' }],
      ['queryEntitiesGrants', Routes.Permissions.Query.entitiesGrants, {}],
      ['querySubordinateEntitiesRoles', Routes.Permissions.Query.subordinateEntitiesRoles, {}],
      ['queryAuthorizationsGrants', Routes.Permissions.Query.authorizationsGrants, { authorizationType: 'SelfInvoicing' }],
    ] as const)(
      '%s forwards pageOffset and pageSize as query params',
      async (method, route, options) => {
        const expected = { grants: [], hasMore: false };
        vi.mocked(client.execute).mockResolvedValueOnce(mockResponse(expected));

        const result = await (service[method] as any)(options, 4, 75);

        const req = getRequest(vi.mocked(client.execute));
        expect(req.method).toBe('POST');
        expect(req.path).toBe(route);
        expect(req.getQuery()).toEqual([
          ['pageOffset', '4'],
          ['pageSize', '75'],
        ]);
        expect(result).toEqual(expected);
      },
    );
  });

  describe('status methods', () => {
    it('getOperationStatus sends GET to operations path with reference', async () => {
      const expected = { status: 'COMPLETED', referenceNumber: 'op-ref-1' };
      vi.mocked(client.execute).mockResolvedValueOnce(mockResponse(expected));

      const result = await service.getOperationStatus('op-ref-1');

      const req = getRequest(vi.mocked(client.execute));
      expect(req.method).toBe('GET');
      expect(req.path).toBe(Routes.Permissions.Operations.byReference('op-ref-1'));
      expect(result).toEqual(expected);
    });

    it('getAttachmentStatus sends GET to attachments status route', async () => {
      const expected = { attachmentAllowed: true };
      vi.mocked(client.execute).mockResolvedValueOnce(mockResponse(expected));

      const result = await service.getAttachmentStatus();

      const req = getRequest(vi.mocked(client.execute));
      expect(req.method).toBe('GET');
      expect(req.path).toBe(Routes.Permissions.Attachments.status);
      expect(result).toEqual(expected);
    });
  });
});
