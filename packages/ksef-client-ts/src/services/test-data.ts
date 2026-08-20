import { RestClient } from '../http/rest-client.js';
import { RestRequest } from '../http/rest-request.js';
import { Routes } from '../http/routes.js';
import { KSeFError } from '../errors/ksef-error.js';
import type { EnvironmentName } from '../config/environments.js';
import type {
  SubjectCreateRequest,
  SubjectRemoveRequest,
  PersonCreateRequest,
  PersonRemoveRequest,
  TestDataPermissionsGrantRequest,
  TestDataPermissionsRevokeRequest,
  AttachmentPermissionGrantRequest,
  AttachmentPermissionRevokeRequest,
  BlockContextAuthenticationRequest,
  UnblockContextAuthenticationRequest,
  TestDataUpdateCertificateRequest,
} from '../models/test-data/types.js';
import type {
  SetSessionLimitsRequest,
  SetSubjectLimitsRequest,
  SetRateLimitsRequest,
} from '../models/limits/types.js';

export class TestDataService {
  private readonly restClient: RestClient;
  private readonly environmentName?: EnvironmentName;

  constructor(restClient: RestClient, environmentName?: EnvironmentName) {
    this.restClient = restClient;
    this.environmentName = environmentName;
  }

  private ensureTestEnvironment(): void {
    if (this.environmentName && this.environmentName !== 'TEST') {
      throw new KSeFError(
        `Test data APIs are only available on the TEST environment (current: ${this.environmentName})`,
      );
    }
  }

  // Subject management

  async createSubject(request: SubjectCreateRequest): Promise<void> {
    this.ensureTestEnvironment();
    const req = RestRequest.post(Routes.TestData.createSubject).body(request);
    await this.restClient.executeVoid(req);
  }

  async removeSubject(request: SubjectRemoveRequest): Promise<void> {
    this.ensureTestEnvironment();
    const req = RestRequest.post(Routes.TestData.removeSubject).body(request);
    await this.restClient.executeVoid(req);
  }

  // Person management

  async createPerson(request: PersonCreateRequest): Promise<void> {
    this.ensureTestEnvironment();
    const req = RestRequest.post(Routes.TestData.createPerson).body(request);
    await this.restClient.executeVoid(req);
  }

  async removePerson(request: PersonRemoveRequest): Promise<void> {
    this.ensureTestEnvironment();
    const req = RestRequest.post(Routes.TestData.removePerson).body(request);
    await this.restClient.executeVoid(req);
  }

  // Permissions

  async grantPermissions(request: TestDataPermissionsGrantRequest): Promise<void> {
    this.ensureTestEnvironment();
    const req = RestRequest.post(Routes.TestData.grantPerms).body(request);
    await this.restClient.executeVoid(req);
  }

  async revokePermissions(request: TestDataPermissionsRevokeRequest): Promise<void> {
    this.ensureTestEnvironment();
    const req = RestRequest.post(Routes.TestData.revokePerms).body(request);
    await this.restClient.executeVoid(req);
  }

  // Attachment permissions

  async enableAttachment(request: AttachmentPermissionGrantRequest): Promise<void> {
    this.ensureTestEnvironment();
    const req = RestRequest.post(Routes.TestData.enableAttach).body(request);
    await this.restClient.executeVoid(req);
  }

  async disableAttachment(request: AttachmentPermissionRevokeRequest): Promise<void> {
    this.ensureTestEnvironment();
    const req = RestRequest.post(Routes.TestData.disableAttach).body(request);
    await this.restClient.executeVoid(req);
  }

  // Session limits

  async changeSessionLimits(request: SetSessionLimitsRequest): Promise<void> {
    this.ensureTestEnvironment();
    const req = RestRequest.post(Routes.TestData.changeSessionLimitsInCurrentContext)
      .body(request);
    await this.restClient.executeVoid(req);
  }

  async restoreDefaultSessionLimits(): Promise<void> {
    this.ensureTestEnvironment();
    const req = RestRequest.delete(Routes.TestData.restoreDefaultSessionLimitsInCurrentContext);
    await this.restClient.executeVoid(req);
  }

  // Certificate limits

  async changeCertificatesLimit(request: SetSubjectLimitsRequest): Promise<void> {
    this.ensureTestEnvironment();
    const req = RestRequest.post(Routes.TestData.changeCertificatesLimitInCurrentSubject)
      .body(request);
    await this.restClient.executeVoid(req);
  }

  async restoreDefaultCertificatesLimit(): Promise<void> {
    this.ensureTestEnvironment();
    const req = RestRequest.delete(Routes.TestData.restoreDefaultCertificatesLimitInCurrentSubject);
    await this.restClient.executeVoid(req);
  }

  // Rate limits

  async setRateLimits(request: SetRateLimitsRequest): Promise<void> {
    this.ensureTestEnvironment();
    const req = RestRequest.post(Routes.TestData.rateLimits)
      .body(request);
    await this.restClient.executeVoid(req);
  }

  async restoreDefaultRateLimits(): Promise<void> {
    this.ensureTestEnvironment();
    const req = RestRequest.delete(Routes.TestData.rateLimits);
    await this.restClient.executeVoid(req);
  }

  async setProductionRateLimits(): Promise<void> {
    this.ensureTestEnvironment();
    const req = RestRequest.post(Routes.TestData.productionRateLimits);
    await this.restClient.executeVoid(req);
  }

  // Context blocking

  async blockContext(request: BlockContextAuthenticationRequest): Promise<void> {
    this.ensureTestEnvironment();
    const req = RestRequest.post(Routes.TestData.blockContext)
      .body(request);
    await this.restClient.executeVoid(req);
  }

  async unblockContext(request: UnblockContextAuthenticationRequest): Promise<void> {
    this.ensureTestEnvironment();
    const req = RestRequest.post(Routes.TestData.unblockContext)
      .body(request);
    await this.restClient.executeVoid(req);
  }

  async updateCertificate(
    serialNumber: string,
    request: TestDataUpdateCertificateRequest,
  ): Promise<void> {
    this.ensureTestEnvironment();
    const req = RestRequest.put(Routes.TestData.updateCertificate(serialNumber))
      .body(request);
    await this.restClient.executeVoid(req);
  }
}
