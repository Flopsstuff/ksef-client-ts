import { RestClient } from '../http/rest-client.js';
import { RestRequest } from '../http/rest-request.js';
import { Routes } from '../http/routes.js';
import type { OperationResponse, SortOrder } from '../models/common.js';
import type { InvoiceQueryFilters, PagedInvoiceResponse, InvoiceExportRequest, InvoiceExportStatusResponse } from '../models/invoices/types.js';

export class InvoiceDownloadService {
  private readonly restClient: RestClient;

  constructor(restClient: RestClient) {
    this.restClient = restClient;
  }

  async getInvoice(ksefNumber: string, accessToken: string): Promise<string> {
    const req = RestRequest.get(Routes.Invoices.byKsefNumber(ksefNumber))
      .accessToken(accessToken);
    const response = await this.restClient.executeRaw(req);
    return new TextDecoder().decode(response.body);
  }

  async queryInvoiceMetadata(
    filters: InvoiceQueryFilters,
    accessToken: string,
    pageOffset?: number,
    pageSize?: number,
    sortOrder?: SortOrder,
  ): Promise<PagedInvoiceResponse> {
    const req = RestRequest.post(Routes.Invoices.queryMetadata)
      .accessToken(accessToken)
      .body(filters);
    if (pageOffset !== undefined) req.query('pageOffset', String(pageOffset));
    if (pageSize !== undefined) req.query('pageSize', String(pageSize));
    if (sortOrder !== undefined) req.query('sortOrder', sortOrder);
    const response = await this.restClient.execute<PagedInvoiceResponse>(req);
    return response.body;
  }

  async exportInvoices(request: InvoiceExportRequest, accessToken: string): Promise<OperationResponse> {
    const req = RestRequest.post(Routes.Invoices.exports)
      .accessToken(accessToken)
      .body(request);
    const response = await this.restClient.execute<OperationResponse>(req);
    return response.body;
  }

  async getInvoiceExportStatus(ref: string, accessToken: string): Promise<InvoiceExportStatusResponse> {
    const req = RestRequest.get(Routes.Invoices.exportByReference(ref))
      .accessToken(accessToken);
    const response = await this.restClient.execute<InvoiceExportStatusResponse>(req);
    return response.body;
  }
}
