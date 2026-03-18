import { RestClient } from '../http/rest-client.js';
import { RestRequest } from '../http/rest-request.js';
import { Routes } from '../http/routes.js';
import type { EffectiveContextLimits, EffectiveSubjectLimits, EffectiveApiRateLimits } from '../models/limits/types.js';

export class LimitsService {
  private readonly restClient: RestClient;

  constructor(restClient: RestClient) {
    this.restClient = restClient;
  }

  async getContextLimits(): Promise<EffectiveContextLimits> {
    const req = RestRequest.get(Routes.Limits.currentContext);
    const response = await this.restClient.execute<EffectiveContextLimits>(req);
    return response.body;
  }

  async getSubjectLimits(): Promise<EffectiveSubjectLimits> {
    const req = RestRequest.get(Routes.Limits.currentSubject);
    const response = await this.restClient.execute<EffectiveSubjectLimits>(req);
    return response.body;
  }

  async getRateLimits(): Promise<EffectiveApiRateLimits> {
    const req = RestRequest.get(Routes.Limits.rateLimits);
    const response = await this.restClient.execute<EffectiveApiRateLimits>(req);
    return response.body;
  }
}
