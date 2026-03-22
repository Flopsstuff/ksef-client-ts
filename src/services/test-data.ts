import { RestClient } from '../http/rest-client.js';
import { RestRequest } from '../http/rest-request.js';
import { Routes } from '../http/routes.js';
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
} from '../models/test-data/types.js';
import type {
  SetSessionLimitsRequest,
  SetSubjectLimitsRequest,
  SetRateLimitsRequest,
} from '../models/limits/types.js';

export class TestDataService {
  private readonly restClient: RestClient;

  constructor(restClient: RestClient) {
    this.restClient = restClient;
  }

  // Subject management

  async createSubject(request: SubjectCreateRequest): Promise<void> {
    const req = RestRequest.post(Routes.TestData.createSubject).body(request);
    await this.restClient.executeVoid(req);
  }

  async removeSubject(request: SubjectRemoveRequest): Promise<void> {
    const req = RestRequest.post(Routes.TestData.removeSubject).body(request);
    await this.restClient.executeVoid(req);
  }

  // Person management

  async createPerson(request: PersonCreateRequest): Promise<void> {
    const req = RestRequest.post(Routes.TestData.createPerson).body(request);
    await this.restClient.executeVoid(req);
  }

  async removePerson(request: PersonRemoveRequest): Promise<void> {
    const req = RestRequest.post(Routes.TestData.removePerson).body(request);
    await this.restClient.executeVoid(req);
  }

  // Permissions

  async grantPermissions(request: TestDataPermissionsGrantRequest): Promise<void> {
    const req = RestRequest.post(Routes.TestData.grantPerms).body(request);
    await this.restClient.executeVoid(req);
  }

  async revokePermissions(request: TestDataPermissionsRevokeRequest): Promise<void> {
    const req = RestRequest.post(Routes.TestData.revokePerms).body(request);
    await this.restClient.executeVoid(req);
  }

  // Attachment permissions

  async enableAttachment(request: AttachmentPermissionGrantRequest): Promise<void> {
    const req = RestRequest.post(Routes.TestData.enableAttach).body(request);
    await this.restClient.executeVoid(req);
  }

  async disableAttachment(request: AttachmentPermissionRevokeRequest): Promise<void> {
    const req = RestRequest.post(Routes.TestData.disableAttach).body(request);
    await this.restClient.executeVoid(req);
  }

  // Session limits

  async changeSessionLimits(request: SetSessionLimitsRequest): Promise<void> {
    const req = RestRequest.post(Routes.TestData.changeSessionLimitsInCurrentContext)
      .body(request);
    await this.restClient.executeVoid(req);
  }

  async restoreDefaultSessionLimits(): Promise<void> {
    const req = RestRequest.delete(Routes.TestData.restoreDefaultSessionLimitsInCurrentContext);
    await this.restClient.executeVoid(req);
  }

  // Certificate limits

  async changeCertificatesLimit(request: SetSubjectLimitsRequest): Promise<void> {
    const req = RestRequest.post(Routes.TestData.changeCertificatesLimitInCurrentSubject)
      .body(request);
    await this.restClient.executeVoid(req);
  }

  async restoreDefaultCertificatesLimit(): Promise<void> {
    const req = RestRequest.delete(Routes.TestData.restoreDefaultCertificatesLimitInCurrentSubject);
    await this.restClient.executeVoid(req);
  }

  // Rate limits

  async setRateLimits(request: SetRateLimitsRequest): Promise<void> {
    const req = RestRequest.post(Routes.TestData.rateLimits)
      .body(request);
    await this.restClient.executeVoid(req);
  }

  async restoreDefaultRateLimits(): Promise<void> {
    const req = RestRequest.delete(Routes.TestData.rateLimits);
    await this.restClient.executeVoid(req);
  }

  async setProductionRateLimits(): Promise<void> {
    const req = RestRequest.post(Routes.TestData.productionRateLimits);
    await this.restClient.executeVoid(req);
  }

  // Context blocking

  async blockContext(request: BlockContextAuthenticationRequest): Promise<void> {
    const req = RestRequest.post(Routes.TestData.blockContext)
      .body(request);
    await this.restClient.executeVoid(req);
  }

  async unblockContext(request: UnblockContextAuthenticationRequest): Promise<void> {
    const req = RestRequest.post(Routes.TestData.unblockContext)
      .body(request);
    await this.restClient.executeVoid(req);
  }
}
