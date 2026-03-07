import { RestClient } from '../http/rest-client.js';
import { RestRequest } from '../http/rest-request.js';
import { Routes } from '../http/routes.js';
import type { SessionLimitsInCurrentContextResponse, CertificatesLimitInCurrentSubjectResponse, EffectiveApiRateLimits } from '../models/limits/types.js';

export class LimitsService {
  private readonly restClient: RestClient;

  constructor(restClient: RestClient) {
    this.restClient = restClient;
  }

  async getContextLimits(accessToken: string): Promise<SessionLimitsInCurrentContextResponse> {
    const req = RestRequest.get(Routes.Limits.currentContext)
      .accessToken(accessToken);
    const response = await this.restClient.execute<SessionLimitsInCurrentContextResponse>(req);
    return response.body;
  }

  async getSubjectLimits(accessToken: string): Promise<CertificatesLimitInCurrentSubjectResponse> {
    const req = RestRequest.get(Routes.Limits.currentSubject)
      .accessToken(accessToken);
    const response = await this.restClient.execute<CertificatesLimitInCurrentSubjectResponse>(req);
    return response.body;
  }

  async getRateLimits(accessToken: string): Promise<EffectiveApiRateLimits> {
    const req = RestRequest.get(Routes.Limits.rateLimits)
      .accessToken(accessToken);
    const response = await this.restClient.execute<EffectiveApiRateLimits>(req);
    return response.body;
  }
}
