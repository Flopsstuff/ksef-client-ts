import { TestDataService } from '../../../src/services/test-data.js';
import { Routes } from '../../../src/http/routes.js';
import { createMockRestClient, getRequest } from './_helpers.js';

describe('TestDataService', () => {
  let restClient: ReturnType<typeof createMockRestClient>;
  let service: TestDataService;

  beforeEach(() => {
    restClient = createMockRestClient();
    service = new TestDataService(restClient as any);
  });

  const postMethods: [string, string][] = [
    ['createSubject', Routes.TestData.createSubject],
    ['removeSubject', Routes.TestData.removeSubject],
    ['createPerson', Routes.TestData.createPerson],
    ['removePerson', Routes.TestData.removePerson],
    ['grantPermissions', Routes.TestData.grantPerms],
    ['revokePermissions', Routes.TestData.revokePerms],
    ['enableAttachment', Routes.TestData.enableAttach],
    ['disableAttachment', Routes.TestData.disableAttach],
    ['changeSessionLimits', Routes.TestData.changeSessionLimitsInCurrentContext],
    ['changeCertificatesLimit', Routes.TestData.changeCertificatesLimitInCurrentSubject],
    ['setRateLimits', Routes.TestData.rateLimits],
    ['blockContext', Routes.TestData.blockContext],
    ['unblockContext', Routes.TestData.unblockContext],
  ];

  it.each(postMethods)('%s sends POST with body', async (methodName, expectedRoute) => {
    const body = { nip: '1234567890' };

    await (service as any)[methodName](body);

    const req = getRequest(restClient.execute as any);
    expect(req.method).toBe('POST');
    expect(req.path).toBe(expectedRoute);
    expect(req.getBody()).toEqual(body);
  });

  const deleteMethods: [string, string][] = [
    ['restoreDefaultSessionLimits', Routes.TestData.restoreDefaultSessionLimitsInCurrentContext],
    ['restoreDefaultCertificatesLimit', Routes.TestData.restoreDefaultCertificatesLimitInCurrentSubject],
    ['restoreDefaultRateLimits', Routes.TestData.rateLimits],
  ];

  it('setProductionRateLimits sends POST without body', async () => {
    await service.setProductionRateLimits();

    const req = getRequest(restClient.execute as any);
    expect(req.method).toBe('POST');
    expect(req.path).toBe(Routes.TestData.productionRateLimits);
    expect(req.getBody()).toBeUndefined();
  });

  it.each(deleteMethods)('%s sends DELETE', async (methodName, expectedRoute) => {
    await (service as any)[methodName]();

    const req = getRequest(restClient.execute as any);
    expect(req.method).toBe('DELETE');
    expect(req.path).toBe(expectedRoute);
    expect(req.getBody()).toBeUndefined();
  });
});
