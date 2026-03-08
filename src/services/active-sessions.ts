import { RestClient } from '../http/rest-client.js';
import { RestRequest } from '../http/rest-request.js';
import { Routes } from '../http/routes.js';
import type { AuthenticationListResponse } from '../models/auth/active-sessions-types.js';

export class ActiveSessionsService {
  private readonly restClient: RestClient;

  constructor(restClient: RestClient) {
    this.restClient = restClient;
  }

  async getActiveSessions(
    accessToken: string,
    pageSize?: number,
    continuationToken?: string,
  ): Promise<AuthenticationListResponse> {
    const request = RestRequest.get(Routes.ActiveSessions.session)
      .accessToken(accessToken);
    if (pageSize !== undefined) request.query('pageSize', String(pageSize));
    if (continuationToken !== undefined) request.header('x-continuation-token', continuationToken);
    const response = await this.restClient.execute<AuthenticationListResponse>(request);
    return response.body;
  }

  async revokeCurrentSession(token: string): Promise<void> {
    const request = RestRequest.delete(Routes.ActiveSessions.currentSession)
      .accessToken(token);
    await this.restClient.execute<void>(request);
  }

  async revokeSession(sessionRef: string, accessToken: string): Promise<void> {
    const request = RestRequest.delete(Routes.ActiveSessions.delete(sessionRef))
      .accessToken(accessToken);
    await this.restClient.execute<void>(request);
  }
}
