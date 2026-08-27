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
  CollectiveIdentifierInvoicesQueryRequest,
  CollectiveIdentifierInvoicesQueryResponse,
} from '../models/collective-identifiers/types.js';

/** An identifier groups invoices, so a list of one is rejected by the request schema. */
export const MIN_INVOICES_PER_COLLECTIVE_IDENTIFIER = 2;

/**
 * The invoice count a context starts with. It is a default rather than a ceiling:
 * the session limits for a context can raise it, so the client does not reject on it.
 */
export const DEFAULT_MAX_INVOICES_PER_COLLECTIVE_IDENTIFIER = 500;

/**
 * The highest the limit above can ever be raised to, since the context limit that
 * governs it is itself capped at this value. A list longer than this cannot be
 * accepted by any context, so it is worth rejecting before the request leaves.
 */
export const MAX_INVOICES_PER_COLLECTIVE_IDENTIFIER = 5000;

export const MAX_COLLECTIVE_IDENTIFIERS_PER_INVOICES_QUERY = 10;

export class CollectiveIdentifiersService {
  private readonly restClient: RestClient;

  constructor(restClient: RestClient) {
    this.restClient = restClient;
  }

  async generate(
    request: GenerateCollectiveIdentifierRequest,
  ): Promise<GenerateCollectiveIdentifierResponse> {
    const count = request.invoices?.length ?? 0;
    if (count < MIN_INVOICES_PER_COLLECTIVE_IDENTIFIER) {
      throw KSeFValidationError.fromField(
        'invoices',
        `A collective identifier groups at least ${MIN_INVOICES_PER_COLLECTIVE_IDENTIFIER} invoices, got ${count}`,
      );
    }
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

  async queryInvoices(
    request: CollectiveIdentifierInvoicesQueryRequest,
    pageSize?: number,
    continuationToken?: string,
  ): Promise<CollectiveIdentifierInvoicesQueryResponse> {
    const count = request.collectiveIdentifierNumbers?.length ?? 0;
    if (count > MAX_COLLECTIVE_IDENTIFIERS_PER_INVOICES_QUERY) {
      throw KSeFValidationError.fromField(
        'collectiveIdentifierNumbers',
        `An invoice query accepts at most ${MAX_COLLECTIVE_IDENTIFIERS_PER_INVOICES_QUERY} collective identifiers, got ${count}`,
      );
    }
    const req = RestRequest.post(Routes.CollectiveIdentifiers.invoices)
      .body(request);
    if (pageSize !== undefined) req.query('pageSize', String(pageSize));
    if (continuationToken !== undefined) req.header('x-continuation-token', continuationToken);
    const response = await this.restClient.execute<CollectiveIdentifierInvoicesQueryResponse>(req);
    return response.body;
  }
}
