import { RestClient } from '../http/rest-client.js';
import { RestRequest } from '../http/rest-request.js';
import { Routes } from '../http/routes.js';
import { KSeFValidationError } from '../errors/ksef-validation-error.js';
import type {
  GenerateCollectiveIdentifierRequest,
  GenerateCollectiveIdentifierResponse,
  CollectiveIdentifiersQueryRequest,
  CollectiveIdentifiersQueryResponse,
  CollectiveIdentifiersByKsefNumberQueryResponse,
  CollectiveIdentifierInvoicesQueryResponse,
} from '../models/collective-identifiers/types.js';

export const MAX_INVOICES_PER_COLLECTIVE_IDENTIFIER = 500;

export class CollectiveIdentifiersService {
  private readonly restClient: RestClient;

  constructor(restClient: RestClient) {
    this.restClient = restClient;
  }

  async generate(
    request: GenerateCollectiveIdentifierRequest,
  ): Promise<GenerateCollectiveIdentifierResponse> {
    const count = request.invoices?.length ?? 0;
    if (count > MAX_INVOICES_PER_COLLECTIVE_IDENTIFIER) {
      throw KSeFValidationError.fromField(
        'invoices',
        `A collective identifier accepts at most ${MAX_INVOICES_PER_COLLECTIVE_IDENTIFIER} invoices, got ${count}`,
      );
    }
    const req = RestRequest.post(Routes.CollectiveIdentifiers.root)
      .body(request);
    const response = await this.restClient.execute<GenerateCollectiveIdentifierResponse>(req);
    return response.body;
  }

  async query(
    request: CollectiveIdentifiersQueryRequest,
    pageSize?: number,
    continuationToken?: string,
  ): Promise<CollectiveIdentifiersQueryResponse> {
    const req = RestRequest.post(Routes.CollectiveIdentifiers.query)
      .body(request);
    if (pageSize !== undefined) req.query('pageSize', String(pageSize));
    if (continuationToken !== undefined) req.header('x-continuation-token', continuationToken);
    const response = await this.restClient.execute<CollectiveIdentifiersQueryResponse>(req);
    return response.body;
  }

  async getByKsefNumber(
    ksefNumber: string,
    pageSize?: number,
    continuationToken?: string,
  ): Promise<CollectiveIdentifiersByKsefNumberQueryResponse> {
    const req = RestRequest.get(Routes.CollectiveIdentifiers.byKsefNumber(ksefNumber));
    if (pageSize !== undefined) req.query('pageSize', String(pageSize));
    if (continuationToken !== undefined) req.header('x-continuation-token', continuationToken);
    const response = await this.restClient.execute<CollectiveIdentifiersByKsefNumberQueryResponse>(req);
    return response.body;
  }

  async getInvoices(
    collectiveIdentifierNumber: string,
    pageSize?: number,
    continuationToken?: string,
  ): Promise<CollectiveIdentifierInvoicesQueryResponse> {
    const req = RestRequest.get(Routes.CollectiveIdentifiers.invoices(collectiveIdentifierNumber));
    if (pageSize !== undefined) req.query('pageSize', String(pageSize));
    if (continuationToken !== undefined) req.header('x-continuation-token', continuationToken);
    const response = await this.restClient.execute<CollectiveIdentifierInvoicesQueryResponse>(req);
    return response.body;
  }
}
