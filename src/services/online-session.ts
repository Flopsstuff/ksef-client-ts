import { RestClient } from '../http/rest-client.js';
import { RestRequest } from '../http/rest-request.js';
import { Routes } from '../http/routes.js';
import type { OpenOnlineSessionRequest, OpenOnlineSessionResponse, SendInvoiceRequest, SendInvoiceResponse } from '../models/sessions/online-types.js';

export class OnlineSessionService {
  private readonly restClient: RestClient;

  constructor(restClient: RestClient) {
    this.restClient = restClient;
  }

  async openSession(
    request: OpenOnlineSessionRequest,
    accessToken: string,
    upoVersion?: string,
  ): Promise<OpenOnlineSessionResponse> {
    const req = RestRequest.post(Routes.Sessions.Online.open)
      .accessToken(accessToken)
      .body(request);
    if (upoVersion) {
      req.header('X-KSeF-Feature', upoVersion);
    }
    const response = await this.restClient.execute<OpenOnlineSessionResponse>(req);
    return response.body;
  }

  async sendInvoice(
    sessionRef: string,
    request: SendInvoiceRequest,
    accessToken: string,
  ): Promise<SendInvoiceResponse> {
    const req = RestRequest.post(Routes.Sessions.Online.invoices(sessionRef))
      .accessToken(accessToken)
      .body(request);
    const response = await this.restClient.execute<SendInvoiceResponse>(req);
    return response.body;
  }

  async closeSession(sessionRef: string, accessToken: string): Promise<void> {
    const req = RestRequest.post(Routes.Sessions.Online.close(sessionRef))
      .accessToken(accessToken);
    await this.restClient.execute<void>(req);
  }
}
