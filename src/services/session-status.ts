import { RestClient } from '../http/rest-client.js';
import { RestRequest } from '../http/rest-request.js';
import { Routes } from '../http/routes.js';
import type { SessionType } from '../models/common.js';
import type { SessionsFilter, SessionsListResponse, SessionStatusResponse, SessionInvoice, SessionInvoicesResponse } from '../models/sessions/status-types.js';

export class SessionStatusService {
  private readonly restClient: RestClient;

  constructor(restClient: RestClient) {
    this.restClient = restClient;
  }

  async getSessions(
    type: SessionType,
    accessToken: string,
    pageSize?: number,
    continuationToken?: string,
    filter?: SessionsFilter,
  ): Promise<SessionsListResponse> {
    const body: Record<string, unknown> = { type };
    if (pageSize !== undefined) body.pageSize = pageSize;
    if (continuationToken !== undefined) body.continuationToken = continuationToken;
    if (filter) body.filter = filter;
    const req = RestRequest.post(Routes.Sessions.root)
      .accessToken(accessToken)
      .body(body);
    const response = await this.restClient.execute<SessionsListResponse>(req);
    return response.body;
  }

  async getSessionStatus(sessionRef: string, accessToken: string): Promise<SessionStatusResponse> {
    const req = RestRequest.get(Routes.Sessions.byReference(sessionRef))
      .accessToken(accessToken);
    const response = await this.restClient.execute<SessionStatusResponse>(req);
    return response.body;
  }

  async getSessionInvoices(
    sessionRef: string,
    accessToken: string,
    pageSize?: number,
    continuationToken?: string,
  ): Promise<SessionInvoicesResponse> {
    const req = RestRequest.get(Routes.Sessions.invoices(sessionRef))
      .accessToken(accessToken);
    if (pageSize !== undefined) req.query('pageSize', String(pageSize));
    if (continuationToken !== undefined) req.query('continuationToken', continuationToken);
    const response = await this.restClient.execute<SessionInvoicesResponse>(req);
    return response.body;
  }

  async getSessionInvoice(
    sessionRef: string,
    invoiceRef: string,
    accessToken: string,
  ): Promise<SessionInvoice> {
    const req = RestRequest.get(Routes.Sessions.invoice(sessionRef, invoiceRef))
      .accessToken(accessToken);
    const response = await this.restClient.execute<SessionInvoice>(req);
    return response.body;
  }

  async getSessionFailedInvoices(
    sessionRef: string,
    accessToken: string,
    pageSize?: number,
    continuationToken?: string,
  ): Promise<SessionInvoicesResponse> {
    const req = RestRequest.get(Routes.Sessions.failedInvoices(sessionRef))
      .accessToken(accessToken);
    if (pageSize !== undefined) req.query('pageSize', String(pageSize));
    if (continuationToken !== undefined) req.query('continuationToken', continuationToken);
    const response = await this.restClient.execute<SessionInvoicesResponse>(req);
    return response.body;
  }

  async getInvoiceUpoByKsefNumber(
    sessionRef: string,
    ksefNumber: string,
    accessToken: string,
  ): Promise<string> {
    const req = RestRequest.get(Routes.Sessions.upoByKsefNumber(sessionRef, ksefNumber))
      .accessToken(accessToken);
    const response = await this.restClient.executeRaw(req);
    return new TextDecoder().decode(response.body);
  }

  async getInvoiceUpoByReference(
    sessionRef: string,
    invoiceRef: string,
    accessToken: string,
  ): Promise<string> {
    const req = RestRequest.get(Routes.Sessions.upoByInvoiceReference(sessionRef, invoiceRef))
      .accessToken(accessToken);
    const response = await this.restClient.executeRaw(req);
    return new TextDecoder().decode(response.body);
  }

  async getSessionUpo(
    sessionRef: string,
    upoRef: string,
    accessToken: string,
  ): Promise<string> {
    const req = RestRequest.get(Routes.Sessions.upo(sessionRef, upoRef))
      .accessToken(accessToken);
    const response = await this.restClient.executeRaw(req);
    return new TextDecoder().decode(response.body);
  }
}
