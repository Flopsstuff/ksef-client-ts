import { RestClient } from '../http/rest-client.js';
import { RestRequest } from '../http/rest-request.js';
import { Routes } from '../http/routes.js';
import type {
  CertificateLimitResponse,
  CertificateEnrollmentsInfoResponse,
  CertificateEnrollmentResponse,
  CertificateEnrollmentStatusResponse,
  CertificateListResponse,
  CertificateMetadataListResponse,
  SendCertificateEnrollmentRequest,
  CertificateListRequest,
  CertificateRevokeRequest,
  CertificateMetadataListRequest,
} from '../models/certificates/types.js';

export class CertificateApiService {
  private readonly restClient: RestClient;

  constructor(restClient: RestClient) {
    this.restClient = restClient;
  }

  async getLimits(accessToken: string): Promise<CertificateLimitResponse> {
    const req = RestRequest.get(Routes.Certificates.limits)
      .accessToken(accessToken);
    const response = await this.restClient.execute<CertificateLimitResponse>(req);
    return response.body;
  }

  async getEnrollmentData(accessToken: string): Promise<CertificateEnrollmentsInfoResponse> {
    const req = RestRequest.get(Routes.Certificates.enrollmentData)
      .accessToken(accessToken);
    const response = await this.restClient.execute<CertificateEnrollmentsInfoResponse>(req);
    return response.body;
  }

  async enroll(request: SendCertificateEnrollmentRequest, accessToken: string): Promise<CertificateEnrollmentResponse> {
    const req = RestRequest.post(Routes.Certificates.enrollments)
      .accessToken(accessToken)
      .body(request);
    const response = await this.restClient.execute<CertificateEnrollmentResponse>(req);
    return response.body;
  }

  async getEnrollmentStatus(ref: string, accessToken: string): Promise<CertificateEnrollmentStatusResponse> {
    const req = RestRequest.get(Routes.Certificates.enrollmentStatus(ref))
      .accessToken(accessToken);
    const response = await this.restClient.execute<CertificateEnrollmentStatusResponse>(req);
    return response.body;
  }

  async retrieve(request: CertificateListRequest, accessToken: string): Promise<CertificateListResponse> {
    const req = RestRequest.post(Routes.Certificates.retrieve)
      .accessToken(accessToken)
      .body(request);
    const response = await this.restClient.execute<CertificateListResponse>(req);
    return response.body;
  }

  async revoke(serialNumber: string, request: CertificateRevokeRequest, accessToken: string): Promise<void> {
    const req = RestRequest.delete(Routes.Certificates.revoke(serialNumber))
      .accessToken(accessToken)
      .body(request);
    await this.restClient.execute<void>(req);
  }

  async query(request: CertificateMetadataListRequest, accessToken: string): Promise<CertificateMetadataListResponse> {
    const req = RestRequest.post(Routes.Certificates.query)
      .accessToken(accessToken)
      .body(request);
    const response = await this.restClient.execute<CertificateMetadataListResponse>(req);
    return response.body;
  }
}
