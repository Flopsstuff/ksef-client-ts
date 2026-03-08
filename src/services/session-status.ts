import { RestClient } from '../http/rest-client.js';
import { RestRequest } from '../http/rest-request.js';
import { Routes } from '../http/routes.js';
import type { SessionType } from '../models/common.js';
import type { SessionsFilter, SessionsQueryResponse, SessionStatusResponse, SessionInvoiceStatusResponse, SessionInvoicesResponse, UpoResult } from '../models/sessions/status-types.js';

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
  ): Promise<SessionsQueryResponse> {
    const req = RestRequest.get(Routes.Sessions.root)
      .accessToken(accessToken);
    req.query('sessionType', type);
    if (pageSize !== undefined) req.query('pageSize', String(pageSize));
    if (continuationToken !== undefined) req.header('x-continuation-token', continuationToken);
    if (filter) {
      if (filter.referenceNumber) req.query('referenceNumber', filter.referenceNumber);
      if (filter.dateCreatedFrom) req.query('dateCreatedFrom', filter.dateCreatedFrom);
      if (filter.dateCreatedTo) req.query('dateCreatedTo', filter.dateCreatedTo);
      if (filter.dateClosedFrom) req.query('dateClosedFrom', filter.dateClosedFrom);
      if (filter.dateClosedTo) req.query('dateClosedTo', filter.dateClosedTo);
      if (filter.dateModifiedFrom) req.query('dateModifiedFrom', filter.dateModifiedFrom);
      if (filter.dateModifiedTo) req.query('dateModifiedTo', filter.dateModifiedTo);
      if (filter.statuses) {
        for (const status of filter.statuses) {
          req.query('sessionStatus', status);
        }
      }
    }
    const response = await this.restClient.execute<SessionsQueryResponse>(req);
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
  ): Promise<SessionInvoiceStatusResponse> {
    const req = RestRequest.get(Routes.Sessions.invoice(sessionRef, invoiceRef))
      .accessToken(accessToken);
    const response = await this.restClient.execute<SessionInvoiceStatusResponse>(req);
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
  ): Promise<UpoResult> {
    const req = RestRequest.get(Routes.Sessions.upoByKsefNumber(sessionRef, ksefNumber))
      .accessToken(accessToken);
    const response = await this.restClient.executeRaw(req);
    return {
      upo: new TextDecoder().decode(response.body),
      hash: response.headers.get('x-ms-meta-hash') ?? undefined,
    };
  }

  async getInvoiceUpoByReference(
    sessionRef: string,
    invoiceRef: string,
    accessToken: string,
  ): Promise<UpoResult> {
    const req = RestRequest.get(Routes.Sessions.upoByInvoiceReference(sessionRef, invoiceRef))
      .accessToken(accessToken);
    const response = await this.restClient.executeRaw(req);
    return {
      upo: new TextDecoder().decode(response.body),
      hash: response.headers.get('x-ms-meta-hash') ?? undefined,
    };
  }

  async getSessionUpo(
    sessionRef: string,
    upoRef: string,
    accessToken: string,
  ): Promise<UpoResult> {
    const req = RestRequest.get(Routes.Sessions.upo(sessionRef, upoRef))
      .accessToken(accessToken);
    const response = await this.restClient.executeRaw(req);
    return {
      upo: new TextDecoder().decode(response.body),
      hash: response.headers.get('x-ms-meta-hash') ?? undefined,
    };
  }
}
