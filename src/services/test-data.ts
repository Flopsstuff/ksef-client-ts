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
  ChangeSessionLimitsInCurrentContextRequest,
  ChangeCertificatesLimitInCurrentSubjectRequest,
  EffectiveApiRateLimitsRequest,
  ContextBlockRequest,
  ContextUnblockRequest,
  TestDataStatusResponse,
} from '../models/test-data/types.js';

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
    const req = RestRequest.delete(Routes.TestData.removeSubject).body(request);
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
    const req = RestRequest.delete(Routes.TestData.removePerson).body(request);
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
    const req = RestRequest.delete(Routes.TestData.revokePerms).body(request);
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
    const req = RestRequest.delete(Routes.TestData.disableAttach).body(request);
    const response = await this.restClient.execute<TestDataStatusResponse>(req);
    return response.body;
  }

  // Session limits

  async changeSessionLimits(request: ChangeSessionLimitsInCurrentContextRequest, accessToken: string): Promise<TestDataStatusResponse> {
    const req = RestRequest.post(Routes.TestData.changeSessionLimitsInCurrentContext)
      .accessToken(accessToken)
      .body(request);
    const response = await this.restClient.execute<TestDataStatusResponse>(req);
    return response.body;
  }

  async restoreDefaultSessionLimits(accessToken: string): Promise<TestDataStatusResponse> {
    const req = RestRequest.delete(Routes.TestData.restoreDefaultSessionLimitsInCurrentContext)
      .accessToken(accessToken);
    const response = await this.restClient.execute<TestDataStatusResponse>(req);
    return response.body;
  }

  // Certificate limits

  async changeCertificatesLimit(request: ChangeCertificatesLimitInCurrentSubjectRequest, accessToken: string): Promise<TestDataStatusResponse> {
    const req = RestRequest.post(Routes.TestData.changeCertificatesLimitInCurrentSubject)
      .accessToken(accessToken)
      .body(request);
    const response = await this.restClient.execute<TestDataStatusResponse>(req);
    return response.body;
  }

  async restoreDefaultCertificatesLimit(accessToken: string): Promise<TestDataStatusResponse> {
    const req = RestRequest.delete(Routes.TestData.restoreDefaultCertificatesLimitInCurrentSubject)
      .accessToken(accessToken);
    const response = await this.restClient.execute<TestDataStatusResponse>(req);
    return response.body;
  }

  // Rate limits

  async setRateLimits(request: EffectiveApiRateLimitsRequest, accessToken: string): Promise<TestDataStatusResponse> {
    const req = RestRequest.post(Routes.TestData.rateLimits)
      .accessToken(accessToken)
      .body(request);
    const response = await this.restClient.execute<TestDataStatusResponse>(req);
    return response.body;
  }

  async restoreDefaultRateLimits(accessToken: string): Promise<TestDataStatusResponse> {
    const req = RestRequest.delete(Routes.TestData.rateLimits)
      .accessToken(accessToken);
    const response = await this.restClient.execute<TestDataStatusResponse>(req);
    return response.body;
  }

  async setProductionRateLimits(request: EffectiveApiRateLimitsRequest, accessToken: string): Promise<TestDataStatusResponse> {
    const req = RestRequest.post(Routes.TestData.productionRateLimits)
      .accessToken(accessToken)
      .body(request);
    const response = await this.restClient.execute<TestDataStatusResponse>(req);
    return response.body;
  }

  async restoreDefaultProductionRateLimits(accessToken: string): Promise<TestDataStatusResponse> {
    const req = RestRequest.delete(Routes.TestData.productionRateLimits)
      .accessToken(accessToken);
    const response = await this.restClient.execute<TestDataStatusResponse>(req);
    return response.body;
  }

  // Context blocking

  async blockContext(request: ContextBlockRequest, accessToken: string): Promise<TestDataStatusResponse> {
    const req = RestRequest.post(Routes.TestData.blockContext)
      .accessToken(accessToken)
      .body(request);
    const response = await this.restClient.execute<TestDataStatusResponse>(req);
    return response.body;
  }

  async unblockContext(request: ContextUnblockRequest, accessToken: string): Promise<TestDataStatusResponse> {
    const req = RestRequest.delete(Routes.TestData.unblockContext)
      .accessToken(accessToken)
      .body(request);
    const response = await this.restClient.execute<TestDataStatusResponse>(req);
    return response.body;
  }
}
