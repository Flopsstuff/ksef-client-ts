import { RestClient } from '../http/rest-client.js';
import { RestRequest } from '../http/rest-request.js';
import { Routes } from '../http/routes.js';
import type {
  AuthenticationListResponse,
  AuthenticationListResponseRev2,
} from '../models/auth/active-sessions-types.js';

export class ActiveSessionsService {
  private readonly restClient: RestClient;

  constructor(restClient: RestClient) {
    this.restClient = restClient;
  }

  /** @deprecated This operation is switched off on 2027-06-15. Use getActiveSessionsRev2 instead. */
  async getActiveSessions(
    pageSize?: number,
    continuationToken?: string,
  ): Promise<AuthenticationListResponse> {
    const request = RestRequest.get(Routes.ActiveSessions.session);
    if (pageSize !== undefined) request.query('pageSize', String(pageSize));
    if (continuationToken !== undefined) request.header('x-continuation-token', continuationToken);
    const response = await this.restClient.execute<AuthenticationListResponse>(request);
    return response.body;
  }

  async getActiveSessionsRev2(
    pageSize?: number,
    continuationToken?: string,
  ): Promise<AuthenticationListResponseRev2> {
    const request = RestRequest.get(Routes.ActiveSessions.sessionRev2);
    if (pageSize !== undefined) request.query('pageSize', String(pageSize));
    if (continuationToken !== undefined) request.header('x-continuation-token', continuationToken);
    const response = await this.restClient.execute<AuthenticationListResponseRev2>(request);
    return response.body;
  }

  async revokeCurrentSession(): Promise<void> {
    const request = RestRequest.delete(Routes.ActiveSessions.currentSession);
    await this.restClient.executeVoid(request);
  }

  async revokeSession(sessionRef: string): Promise<void> {
    const request = RestRequest.delete(Routes.ActiveSessions.delete(sessionRef));
    await this.restClient.executeVoid(request);
  }
}
