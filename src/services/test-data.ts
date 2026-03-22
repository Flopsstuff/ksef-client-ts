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
import type { OperationStatusInfo } from '../models/common.js';
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

  async createSubject(request: SubjectCreateRequest): Promise<OperationStatusInfo> {
    const req = RestRequest.post(Routes.TestData.createSubject).body(request);
    const response = await this.restClient.execute<OperationStatusInfo>(req);
    return response.body;
  }

  async removeSubject(request: SubjectRemoveRequest): Promise<OperationStatusInfo> {
    const req = RestRequest.post(Routes.TestData.removeSubject).body(request);
    const response = await this.restClient.execute<OperationStatusInfo>(req);
    return response.body;
  }

  // Person management

  async createPerson(request: PersonCreateRequest): Promise<OperationStatusInfo> {
    const req = RestRequest.post(Routes.TestData.createPerson).body(request);
    const response = await this.restClient.execute<OperationStatusInfo>(req);
    return response.body;
  }

  async removePerson(request: PersonRemoveRequest): Promise<OperationStatusInfo> {
    const req = RestRequest.post(Routes.TestData.removePerson).body(request);
    const response = await this.restClient.execute<OperationStatusInfo>(req);
    return response.body;
  }

  // Permissions

  async grantPermissions(request: TestDataPermissionsGrantRequest): Promise<OperationStatusInfo> {
    const req = RestRequest.post(Routes.TestData.grantPerms).body(request);
    const response = await this.restClient.execute<OperationStatusInfo>(req);
    return response.body;
  }

  async revokePermissions(request: TestDataPermissionsRevokeRequest): Promise<OperationStatusInfo> {
    const req = RestRequest.post(Routes.TestData.revokePerms).body(request);
    const response = await this.restClient.execute<OperationStatusInfo>(req);
    return response.body;
  }

  // Attachment permissions

  async enableAttachment(request: AttachmentPermissionGrantRequest): Promise<OperationStatusInfo> {
    const req = RestRequest.post(Routes.TestData.enableAttach).body(request);
    const response = await this.restClient.execute<OperationStatusInfo>(req);
    return response.body;
  }

  async disableAttachment(request: AttachmentPermissionRevokeRequest): Promise<OperationStatusInfo> {
    const req = RestRequest.post(Routes.TestData.disableAttach).body(request);
    const response = await this.restClient.execute<OperationStatusInfo>(req);
    return response.body;
  }

  // Session limits

  async changeSessionLimits(request: SetSessionLimitsRequest): Promise<OperationStatusInfo> {
    const req = RestRequest.post(Routes.TestData.changeSessionLimitsInCurrentContext)
      .body(request);
    const response = await this.restClient.execute<OperationStatusInfo>(req);
    return response.body;
  }

  async restoreDefaultSessionLimits(): Promise<OperationStatusInfo> {
    const req = RestRequest.delete(Routes.TestData.restoreDefaultSessionLimitsInCurrentContext);
    const response = await this.restClient.execute<OperationStatusInfo>(req);
    return response.body;
  }

  // Certificate limits

  async changeCertificatesLimit(request: SetSubjectLimitsRequest): Promise<OperationStatusInfo> {
    const req = RestRequest.post(Routes.TestData.changeCertificatesLimitInCurrentSubject)
      .body(request);
    const response = await this.restClient.execute<OperationStatusInfo>(req);
    return response.body;
  }

  async restoreDefaultCertificatesLimit(): Promise<OperationStatusInfo> {
    const req = RestRequest.delete(Routes.TestData.restoreDefaultCertificatesLimitInCurrentSubject);
    const response = await this.restClient.execute<OperationStatusInfo>(req);
    return response.body;
  }

  // Rate limits

  async setRateLimits(request: SetRateLimitsRequest): Promise<OperationStatusInfo> {
    const req = RestRequest.post(Routes.TestData.rateLimits)
      .body(request);
    const response = await this.restClient.execute<OperationStatusInfo>(req);
    return response.body;
  }

  async restoreDefaultRateLimits(): Promise<OperationStatusInfo> {
    const req = RestRequest.delete(Routes.TestData.rateLimits);
    const response = await this.restClient.execute<OperationStatusInfo>(req);
    return response.body;
  }

  async setProductionRateLimits(): Promise<OperationStatusInfo> {
    const req = RestRequest.post(Routes.TestData.productionRateLimits);
    const response = await this.restClient.execute<OperationStatusInfo>(req);
    return response.body;
  }

  // Context blocking

  async blockContext(request: BlockContextAuthenticationRequest): Promise<OperationStatusInfo> {
    const req = RestRequest.post(Routes.TestData.blockContext)
      .body(request);
    const response = await this.restClient.execute<OperationStatusInfo>(req);
    return response.body;
  }

  async unblockContext(request: UnblockContextAuthenticationRequest): Promise<OperationStatusInfo> {
    const req = RestRequest.post(Routes.TestData.unblockContext)
      .body(request);
    const response = await this.restClient.execute<OperationStatusInfo>(req);
    return response.body;
  }
}
