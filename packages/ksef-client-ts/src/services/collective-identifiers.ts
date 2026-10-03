import { RestClient } from '../http/rest-client.js';
import { RestRequest } from '../http/rest-request.js';
import { Routes } from '../http/routes.js';
import { KSeFValidationError } from '../errors/ksef-validation-error.js';
import { KsefNumber } from '../validation/patterns.js';
import type {
  CollectiveIdentifierInvoice,
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

/** The request schema caps each invoice's description at this many characters. */
export const MAX_COLLECTIVE_IDENTIFIER_INVOICE_DESCRIPTION_LENGTH = 512;

/**
 * Rejects an invoice list KSeF is bound to refuse, before it is sent: a malformed
 * number, an overlong description or an incomplete payment (21405), invoices of
 * different sellers (71004) and a repeated number (71005). The seller is the NIP
 * that opens every KSeF number. Numbers are compared exactly as written, because
 * KSeF resolves the 35- and 36-character forms separately: the two forms of one
 * number are not reported as a repeat, the form the invoice was not issued under
 * is simply not found (71001).
 */
function assertGenerateInvoices(invoices: CollectiveIdentifierInvoice[]): void {
  const seen = new Set<string>();
  let seller: string | undefined;
  invoices.forEach((invoice, i) => {
    const { ksefNumber, payment, description } = invoice;
    if (typeof ksefNumber !== 'string' || !KsefNumber.test(ksefNumber)) {
      throw KSeFValidationError.fromField(
        `invoices[${i}].ksefNumber`,
        `Invalid KSeF number "${String(ksefNumber)}": expected NIP-YYYYMMDD-XXXXXXXXXXXX-CC (uppercase hex)`,
      );
    }
    const nip = ksefNumber.slice(0, ksefNumber.indexOf('-'));
    if (seller === undefined) {
      seller = nip;
    } else if (nip !== seller) {
      throw KSeFValidationError.fromField(
        `invoices[${i}].ksefNumber`,
        `All invoices of a collective identifier must have one seller: ${ksefNumber} belongs to ${nip}, the list starts with ${seller}`,
      );
    }
    if (seen.has(ksefNumber)) {
      throw KSeFValidationError.fromField(
        `invoices[${i}].ksefNumber`,
        `KSeF number ${ksefNumber} appears more than once in the list`,
      );
    }
    seen.add(ksefNumber);
    if (
      typeof description === 'string'
      && description.length > MAX_COLLECTIVE_IDENTIFIER_INVOICE_DESCRIPTION_LENGTH
    ) {
      throw KSeFValidationError.fromField(
        `invoices[${i}].description`,
        `A description is at most ${MAX_COLLECTIVE_IDENTIFIER_INVOICE_DESCRIPTION_LENGTH} characters, got ${description.length}`,
      );
    }
    if (payment != null) {
      // A non-finite number serializes to null, which KSeF reads as a missing amount.
      const { amount, currency } = payment;
      if (amount == null || (typeof amount === 'number' && !Number.isFinite(amount))) {
        throw KSeFValidationError.fromField(
          `invoices[${i}].payment.amount`,
          'A payment needs an amount together with its currency',
        );
      }
      if (typeof currency !== 'string' || currency === '') {
        throw KSeFValidationError.fromField(
          `invoices[${i}].payment.currency`,
          'A payment needs a currency together with its amount',
        );
      }
    }
  });
}

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
    assertGenerateInvoices(request.invoices);
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
    const req = RestRequest.post(Routes.CollectiveIdentifiers.query).retrySafe()
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
    const req = RestRequest.post(Routes.CollectiveIdentifiers.invoices).retrySafe()
      .body(request);
    if (pageSize !== undefined) req.query('pageSize', String(pageSize));
    if (continuationToken !== undefined) req.header('x-continuation-token', continuationToken);
    const response = await this.restClient.execute<CollectiveIdentifierInvoicesQueryResponse>(req);
    return response.body;
  }
}
