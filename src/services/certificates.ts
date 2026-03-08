import { RestClient } from '../http/rest-client.js';
import { RestRequest } from '../http/rest-request.js';
import { Routes } from '../http/routes.js';
import type {
  CertificateLimitsResponse,
  CertificateEnrollmentDataResponse,
  EnrollCertificateRequest,
  EnrollCertificateResponse,
  CertificateEnrollmentStatusResponse,
  RetrieveCertificatesRequest,
  RetrieveCertificatesResponse,
  QueryCertificatesRequest,
  QueryCertificatesResponse,
  CertificateRevokeRequest,
} from '../models/certificates/types.js';

export class CertificateApiService {
  private readonly restClient: RestClient;

  constructor(restClient: RestClient) {
    this.restClient = restClient;
  }

  async getLimits(accessToken: string): Promise<CertificateLimitsResponse> {
    const req = RestRequest.get(Routes.Certificates.limits)
      .accessToken(accessToken);
    const response = await this.restClient.execute<CertificateLimitsResponse>(req);
    return response.body;
  }

  async getEnrollmentData(accessToken: string): Promise<CertificateEnrollmentDataResponse> {
    const req = RestRequest.get(Routes.Certificates.enrollmentData)
      .accessToken(accessToken);
    const response = await this.restClient.execute<CertificateEnrollmentDataResponse>(req);
    return response.body;
  }

  async enroll(request: EnrollCertificateRequest, accessToken: string): Promise<EnrollCertificateResponse> {
    const req = RestRequest.post(Routes.Certificates.enrollments)
      .accessToken(accessToken)
      .body(request);
    const response = await this.restClient.execute<EnrollCertificateResponse>(req);
    return response.body;
  }

  async getEnrollmentStatus(ref: string, accessToken: string): Promise<CertificateEnrollmentStatusResponse> {
    const req = RestRequest.get(Routes.Certificates.enrollmentStatus(ref))
      .accessToken(accessToken);
    const response = await this.restClient.execute<CertificateEnrollmentStatusResponse>(req);
    return response.body;
  }

  async retrieve(request: RetrieveCertificatesRequest, accessToken: string): Promise<RetrieveCertificatesResponse> {
    const req = RestRequest.post(Routes.Certificates.retrieve)
      .accessToken(accessToken)
      .body(request);
    const response = await this.restClient.execute<RetrieveCertificatesResponse>(req);
    return response.body;
  }

  async revoke(serialNumber: string, request: CertificateRevokeRequest, accessToken: string): Promise<void> {
    const req = RestRequest.post(Routes.Certificates.revoke(serialNumber))
      .accessToken(accessToken)
      .body(request);
    await this.restClient.execute<void>(req);
  }

  async query(request: QueryCertificatesRequest, accessToken: string, pageSize?: number, pageOffset?: number): Promise<QueryCertificatesResponse> {
    const req = RestRequest.post(Routes.Certificates.query)
      .accessToken(accessToken)
      .body(request);
    if (pageSize !== undefined) req.query('pageSize', String(pageSize));
    if (pageOffset !== undefined) req.query('pageOffset', String(pageOffset));
    const response = await this.restClient.execute<QueryCertificatesResponse>(req);
    return response.body;
  }
}
