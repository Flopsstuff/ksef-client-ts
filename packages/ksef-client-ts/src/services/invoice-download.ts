import { RestClient } from '../http/rest-client.js';
import { RestRequest } from '../http/rest-request.js';
import { Routes } from '../http/routes.js';
import type { OperationResponse, SortOrder } from '../models/common.js';
import type { InvoiceQueryFilters, QueryInvoicesMetadataResponse, InvoiceExportRequest, InvoiceExportStatusResponse, InvoiceResult } from '../models/invoices/types.js';

export class InvoiceDownloadService {
  private readonly restClient: RestClient;

  constructor(restClient: RestClient) {
    this.restClient = restClient;
  }

  async getInvoice(ksefNumber: string): Promise<InvoiceResult> {
    const req = RestRequest.get(Routes.Invoices.byKsefNumber(ksefNumber));
    const response = await this.restClient.executeRaw(req);
    return {
      xml: new TextDecoder().decode(response.body),
      hash: response.headers.get('x-ms-meta-hash') ?? undefined,
    };
  }

  async queryInvoiceMetadata(
    filters: InvoiceQueryFilters,
    pageOffset?: number,
    pageSize?: number,
    sortOrder?: SortOrder,
  ): Promise<QueryInvoicesMetadataResponse> {
    const req = RestRequest.post(Routes.Invoices.queryMetadata)
      .body(filters);
    if (pageOffset !== undefined) req.query('pageOffset', String(pageOffset));
    if (pageSize !== undefined) req.query('pageSize', String(pageSize));
    if (sortOrder !== undefined) req.query('sortOrder', sortOrder);
    const response = await this.restClient.execute<QueryInvoicesMetadataResponse>(req);
    return response.body;
  }

  async exportInvoices(request: InvoiceExportRequest): Promise<OperationResponse> {
    const req = RestRequest.post(Routes.Invoices.exports)
      .body(request);
    const response = await this.restClient.execute<OperationResponse>(req);
    return response.body;
  }

  async getInvoiceExportStatus(ref: string): Promise<InvoiceExportStatusResponse> {
    const req = RestRequest.get(Routes.Invoices.exportByReference(ref));
    const response = await this.restClient.execute<InvoiceExportStatusResponse>(req);
    return response.body;
  }
}
