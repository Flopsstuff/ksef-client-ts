import { RestClient } from '../http/rest-client.js';
import { KSEF_FEATURE_HEADER } from '../http/ksef-feature.js';
import { RestRequest } from '../http/rest-request.js';
import { Routes } from '../http/routes.js';
import type { UpoVersion } from '../http/ksef-feature.js';
import type { OpenOnlineSessionRequest, OpenOnlineSessionResponse, SendInvoiceRequest, SendInvoiceResponse } from '../models/sessions/online-types.js';

export class OnlineSessionService {
  private readonly restClient: RestClient;

  constructor(restClient: RestClient) {
    this.restClient = restClient;
  }

  async openSession(
    request: OpenOnlineSessionRequest,
    upoVersion?: UpoVersion | string,
  ): Promise<OpenOnlineSessionResponse> {
    const req = RestRequest.post(Routes.Sessions.Online.open)
      .body(request);
    if (upoVersion) {
      req.header(KSEF_FEATURE_HEADER, upoVersion);
    }
    const response = await this.restClient.execute<OpenOnlineSessionResponse>(req);
    return response.body;
  }

  async sendInvoice(
    sessionRef: string,
    request: SendInvoiceRequest,
  ): Promise<SendInvoiceResponse> {
    const req = RestRequest.post(Routes.Sessions.Online.invoices(sessionRef))
      .body(request);
    const response = await this.restClient.execute<SendInvoiceResponse>(req);
    return response.body;
  }

  async closeSession(sessionRef: string): Promise<void> {
    const req = RestRequest.post(Routes.Sessions.Online.close(sessionRef));
    await this.restClient.executeVoid(req);
  }
}
