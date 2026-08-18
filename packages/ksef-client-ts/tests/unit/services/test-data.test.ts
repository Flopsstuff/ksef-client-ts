import { TestDataService } from '../../../src/services/test-data.js';
import { KSeFError } from '../../../src/errors/ksef-error.js';
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

    const req = getRequest(restClient.executeVoid as any);
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

    const req = getRequest(restClient.executeVoid as any);
    expect(req.method).toBe('POST');
    expect(req.path).toBe(Routes.TestData.productionRateLimits);
    expect(req.getBody()).toBeUndefined();
  });

  it.each(deleteMethods)('%s sends DELETE', async (methodName, expectedRoute) => {
    await (service as any)[methodName]();

    const req = getRequest(restClient.executeVoid as any);
    expect(req.method).toBe('DELETE');
    expect(req.path).toBe(expectedRoute);
    expect(req.getBody()).toBeUndefined();
  });

  it('updateCertificate sends PUT with serial number path and body', async () => {
    const serialNumber = '0123456789ABCDEF';
    const body = { validTo: '2026-12-31T23:59:59Z' };

    await service.updateCertificate(serialNumber, body);

    const req = getRequest(restClient.executeVoid as any);
    expect(req.method).toBe('PUT');
    expect(req.path).toBe(Routes.TestData.updateCertificate(serialNumber));
    expect(req.getBody()).toEqual(body);
  });

  describe('environment guard', () => {
    const allMethods = [
      ...postMethods.map(([name]) => name),
      'setProductionRateLimits',
      ...deleteMethods.map(([name]) => name),
      'updateCertificate',
    ];

    it.each(['PROD', 'DEMO'] as const)('throws KSeFError on %s environment', async (env) => {
      const svc = new TestDataService(restClient as any, env);

      for (const method of allMethods) {
        const args = method === 'updateCertificate'
          ? ['0123456789ABCDEF', { validTo: '2026-12-31T23:59:59Z' }]
          : [{ nip: '1234567890' }];
        await expect((svc as any)[method](...args)).rejects.toThrow(KSeFError);
        await expect((svc as any)[method](...args)).rejects.toThrow(
          `Test data APIs are only available on the TEST environment (current: ${env})`,
        );
      }
    });

    it('allows TEST environment', async () => {
      const svc = new TestDataService(restClient as any, 'TEST');
      await svc.createSubject({ nip: '1234567890' } as any);

      const req = getRequest(restClient.executeVoid as any);
      expect(req.path).toBe(Routes.TestData.createSubject);
    });

    it('allows undefined environment (custom URL)', async () => {
      const svc = new TestDataService(restClient as any, undefined);
      await svc.createSubject({ nip: '1234567890' } as any);

      const req = getRequest(restClient.executeVoid as any);
      expect(req.path).toBe(Routes.TestData.createSubject);
    });
  });
});
