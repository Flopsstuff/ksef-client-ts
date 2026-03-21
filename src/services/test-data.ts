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
  TestDataStatusResponse,
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

  async createSubject(request: SubjectCreateRequest): Promise<TestDataStatusResponse> {
    const req = RestRequest.post(Routes.TestData.createSubject).body(request);
    const response = await this.restClient.execute<TestDataStatusResponse>(req);
    return response.body;
  }

  async removeSubject(request: SubjectRemoveRequest): Promise<TestDataStatusResponse> {
    const req = RestRequest.post(Routes.TestData.removeSubject).body(request);
    const response = await this.restClient.execute<TestDataStatusResponse>(req);
    return response.body;
  }

  // Person management

  async createPerson(request: PersonCreateRequest): Promise<TestDataStatusResponse> {
    const req = RestRequest.post(Routes.TestData.createPerson).body(request);
    const response = await this.restClient.execute<TestDataStatusResponse>(req);
    return response.body;
  }

  async removePerson(request: PersonRemoveRequest): Promise<TestDataStatusResponse> {
    const req = RestRequest.post(Routes.TestData.removePerson).body(request);
    const response = await this.restClient.execute<TestDataStatusResponse>(req);
    return response.body;
  }

  // Permissions

  async grantPermissions(request: TestDataPermissionsGrantRequest): Promise<TestDataStatusResponse> {
    const req = RestRequest.post(Routes.TestData.grantPerms).body(request);
    const response = await this.restClient.execute<TestDataStatusResponse>(req);
    return response.body;
  }

  async revokePermissions(request: TestDataPermissionsRevokeRequest): Promise<TestDataStatusResponse> {
    const req = RestRequest.post(Routes.TestData.revokePerms).body(request);
    const response = await this.restClient.execute<TestDataStatusResponse>(req);
    return response.body;
  }

  // Attachment permissions

  async enableAttachment(request: AttachmentPermissionGrantRequest): Promise<TestDataStatusResponse> {
    const req = RestRequest.post(Routes.TestData.enableAttach).body(request);
    const response = await this.restClient.execute<TestDataStatusResponse>(req);
    return response.body;
  }

  async disableAttachment(request: AttachmentPermissionRevokeRequest): Promise<TestDataStatusResponse> {
    const req = RestRequest.post(Routes.TestData.disableAttach).body(request);
    const response = await this.restClient.execute<TestDataStatusResponse>(req);
    return response.body;
  }

  // Session limits

  async changeSessionLimits(request: SetSessionLimitsRequest): Promise<TestDataStatusResponse> {
    const req = RestRequest.post(Routes.TestData.changeSessionLimitsInCurrentContext)
      .body(request);
    const response = await this.restClient.execute<TestDataStatusResponse>(req);
    return response.body;
  }

  async restoreDefaultSessionLimits(): Promise<TestDataStatusResponse> {
    const req = RestRequest.delete(Routes.TestData.restoreDefaultSessionLimitsInCurrentContext);
    const response = await this.restClient.execute<TestDataStatusResponse>(req);
    return response.body;
  }

  // Certificate limits

  async changeCertificatesLimit(request: SetSubjectLimitsRequest): Promise<TestDataStatusResponse> {
    const req = RestRequest.post(Routes.TestData.changeCertificatesLimitInCurrentSubject)
      .body(request);
    const response = await this.restClient.execute<TestDataStatusResponse>(req);
    return response.body;
  }

  async restoreDefaultCertificatesLimit(): Promise<TestDataStatusResponse> {
    const req = RestRequest.delete(Routes.TestData.restoreDefaultCertificatesLimitInCurrentSubject);
    const response = await this.restClient.execute<TestDataStatusResponse>(req);
    return response.body;
  }

  // Rate limits

  async setRateLimits(request: SetRateLimitsRequest): Promise<TestDataStatusResponse> {
    const req = RestRequest.post(Routes.TestData.rateLimits)
      .body(request);
    const response = await this.restClient.execute<TestDataStatusResponse>(req);
    return response.body;
  }

  async restoreDefaultRateLimits(): Promise<TestDataStatusResponse> {
    const req = RestRequest.delete(Routes.TestData.rateLimits);
    const response = await this.restClient.execute<TestDataStatusResponse>(req);
    return response.body;
  }

  async setProductionRateLimits(): Promise<TestDataStatusResponse> {
    const req = RestRequest.post(Routes.TestData.productionRateLimits);
    const response = await this.restClient.execute<TestDataStatusResponse>(req);
    return response.body;
  }

  // Context blocking

  async blockContext(request: BlockContextAuthenticationRequest): Promise<TestDataStatusResponse> {
    const req = RestRequest.post(Routes.TestData.blockContext)
      .body(request);
    const response = await this.restClient.execute<TestDataStatusResponse>(req);
    return response.body;
  }

  async unblockContext(request: UnblockContextAuthenticationRequest): Promise<TestDataStatusResponse> {
    const req = RestRequest.post(Routes.TestData.unblockContext)
      .body(request);
    const response = await this.restClient.execute<TestDataStatusResponse>(req);
    return response.body;
  }
}
