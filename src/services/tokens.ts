import { RestClient } from '../http/rest-client.js';
import { RestRequest } from '../http/rest-request.js';
import { Routes } from '../http/routes.js';
import type { KsefTokenRequest, KsefTokenResponse, AuthenticationKsefToken, QueryKsefTokensResponse, QueryKsefTokensOptions } from '../models/tokens/types.js';

export class TokenService {
  private readonly restClient: RestClient;

  constructor(restClient: RestClient) {
    this.restClient = restClient;
  }

  async generateToken(request: KsefTokenRequest, accessToken: string): Promise<KsefTokenResponse> {
    const req = RestRequest.post(Routes.Tokens.root)
      .accessToken(accessToken)
      .body(request);
    const response = await this.restClient.execute<KsefTokenResponse>(req);
    return response.body;
  }

  async queryTokens(
    accessToken: string,
    options?: QueryKsefTokensOptions,
  ): Promise<QueryKsefTokensResponse> {
    const req = RestRequest.get(Routes.Tokens.root)
      .accessToken(accessToken);
    if (options?.pageOffset !== undefined) req.query('pageOffset', String(options.pageOffset));
    if (options?.pageSize !== undefined) req.query('pageSize', String(options.pageSize));
    if (options?.status) {
      for (const s of options.status) {
        req.query('status', s);
      }
    }
    if (options?.description !== undefined) req.query('description', options.description);
    if (options?.authorIdentifier !== undefined) req.query('authorIdentifier', options.authorIdentifier);
    if (options?.authorIdentifierType !== undefined) req.query('authorIdentifierType', options.authorIdentifierType);
    const response = await this.restClient.execute<QueryKsefTokensResponse>(req);
    return response.body;
  }

  async getToken(ref: string, accessToken: string): Promise<AuthenticationKsefToken> {
    const req = RestRequest.get(Routes.Tokens.byReference(ref))
      .accessToken(accessToken);
    const response = await this.restClient.execute<AuthenticationKsefToken>(req);
    return response.body;
  }

  async revokeToken(ref: string, accessToken: string): Promise<void> {
    const req = RestRequest.delete(Routes.Tokens.byReference(ref))
      .accessToken(accessToken);
    await this.restClient.execute<void>(req);
  }
}
