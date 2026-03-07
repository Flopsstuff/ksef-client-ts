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
    const request = RestRequest.post(Routes.ActiveSessions.session)
      .accessToken(accessToken);
    const body: Record<string, unknown> = {};
    if (pageSize !== undefined) body.pageSize = pageSize;
    if (continuationToken !== undefined) body.continuationToken = continuationToken;
    request.body(body);
    const response = await this.restClient.execute<AuthenticationListResponse>(request);
    return response.body;
  }

  async revokeCurrentSession(token: string): Promise<void> {
    const request = RestRequest.delete(Routes.ActiveSessions.currentSession)
      .accessToken(token);
    await this.restClient.execute<void>(request);
  }

  async revokeSession(sessionRef: string, accessToken: string): Promise<void> {
    const request = RestRequest.delete(Routes.ActiveSessions.session)
      .accessToken(accessToken)
      .body({ referenceNumber: sessionRef });
    await this.restClient.execute<void>(request);
  }
}
