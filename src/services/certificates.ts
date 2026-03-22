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
  RevokeCertificateRequest,
} from '../models/certificates/types.js';

export class CertificateApiService {
  private readonly restClient: RestClient;

  constructor(restClient: RestClient) {
    this.restClient = restClient;
  }

  async getLimits(): Promise<CertificateLimitsResponse> {
    const req = RestRequest.get(Routes.Certificates.limits);
    const response = await this.restClient.execute<CertificateLimitsResponse>(req);
    return response.body;
  }

  async getEnrollmentData(): Promise<CertificateEnrollmentDataResponse> {
    const req = RestRequest.get(Routes.Certificates.enrollmentData);
    const response = await this.restClient.execute<CertificateEnrollmentDataResponse>(req);
    return response.body;
  }

  async enroll(request: EnrollCertificateRequest): Promise<EnrollCertificateResponse> {
    const req = RestRequest.post(Routes.Certificates.enrollments)
      .body(request);
    const response = await this.restClient.execute<EnrollCertificateResponse>(req);
    return response.body;
  }

  async getEnrollmentStatus(ref: string): Promise<CertificateEnrollmentStatusResponse> {
    const req = RestRequest.get(Routes.Certificates.enrollmentStatus(ref));
    const response = await this.restClient.execute<CertificateEnrollmentStatusResponse>(req);
    return response.body;
  }

  async retrieve(request: RetrieveCertificatesRequest): Promise<RetrieveCertificatesResponse> {
    const req = RestRequest.post(Routes.Certificates.retrieve)
      .body(request);
    const response = await this.restClient.execute<RetrieveCertificatesResponse>(req);
    return response.body;
  }

  async revoke(serialNumber: string, request: RevokeCertificateRequest): Promise<void> {
    const req = RestRequest.post(Routes.Certificates.revoke(serialNumber))
      .body(request);
    await this.restClient.executeVoid(req);
  }

  async query(request: QueryCertificatesRequest, pageSize?: number, pageOffset?: number): Promise<QueryCertificatesResponse> {
    const req = RestRequest.post(Routes.Certificates.query)
      .body(request);
    if (pageSize !== undefined) req.query('pageSize', String(pageSize));
    if (pageOffset !== undefined) req.query('pageOffset', String(pageOffset));
    const response = await this.restClient.execute<QueryCertificatesResponse>(req);
    return response.body;
  }
}
