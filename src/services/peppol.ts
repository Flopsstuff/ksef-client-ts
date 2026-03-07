import { RestClient } from '../http/rest-client.js';
import { RestRequest } from '../http/rest-request.js';
import { Routes } from '../http/routes.js';
import type { QueryPeppolProvidersResponse } from '../models/peppol/types.js';

export class PeppolService {
  private readonly restClient: RestClient;

  constructor(restClient: RestClient) {
    this.restClient = restClient;
  }

  async queryProviders(
    accessToken: string,
    pageOffset?: number,
    pageSize?: number,
  ): Promise<QueryPeppolProvidersResponse> {
    const req = RestRequest.post(Routes.Peppol.query)
      .accessToken(accessToken)
      .body({});
    if (pageOffset !== undefined) req.query('pageOffset', String(pageOffset));
    if (pageSize !== undefined) req.query('pageSize', String(pageSize));
    const response = await this.restClient.execute<QueryPeppolProvidersResponse>(req);
    return response.body;
  }
}
