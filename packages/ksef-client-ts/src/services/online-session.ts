import { RestClient } from '../http/rest-client.js';
import { KSEF_FEATURE_HEADER, resolveSessionFeature } from '../http/ksef-feature.js';
import { RestRequest } from '../http/rest-request.js';
import { Routes } from '../http/routes.js';
import type { KSeFFeature, UpoVersion } from '../http/ksef-feature.js';
import type { OpenOnlineSessionRequest, OpenOnlineSessionResponse, SendInvoiceRequest, SendInvoiceResponse } from '../models/sessions/online-types.js';

export class OnlineSessionService {
  private readonly restClient: RestClient;

  constructor(restClient: RestClient) {
    this.restClient = restClient;
  }

  /**
   * @param features Value(s) for the X-KSeF-Feature header, e.g.
   *   `KSeFFeature.SubjectIdentifierValidation` (TEST only). Strings are split
   *   on commas. KSeF honours one feature per session, so more than one
   *   distinct value throws `KSeFValidationError` before the request is sent.
   */
  async openSession(
    request: OpenOnlineSessionRequest,
    features?: UpoVersion | KSeFFeature | string | readonly string[],
  ): Promise<OpenOnlineSessionResponse> {
    const feature = resolveSessionFeature(features);
    const req = RestRequest.post(Routes.Sessions.Online.open)
      .body(request);
    if (feature) {
      req.header(KSEF_FEATURE_HEADER, feature);
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
