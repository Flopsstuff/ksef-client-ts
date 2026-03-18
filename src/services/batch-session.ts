import { RestClient } from '../http/rest-client.js';
import { RestRequest } from '../http/rest-request.js';
import { Routes } from '../http/routes.js';
import type { OpenBatchSessionRequest, OpenBatchSessionResponse, BatchPartSendingInfo } from '../models/sessions/batch-types.js';

export class BatchSessionService {
  private readonly restClient: RestClient;

  constructor(restClient: RestClient) {
    this.restClient = restClient;
  }

  async openSession(
    request: OpenBatchSessionRequest,
    upoVersion?: string,
  ): Promise<OpenBatchSessionResponse> {
    const req = RestRequest.post(Routes.Sessions.Batch.open)
      .body(request);
    if (upoVersion) {
      req.header('X-KSeF-Feature', upoVersion);
    }
    const response = await this.restClient.execute<OpenBatchSessionResponse>(req);
    return response.body;
  }

  async sendParts(
    openResponse: OpenBatchSessionResponse,
    parts: BatchPartSendingInfo[],
  ): Promise<void> {
    const uploadRequests = openResponse.partUploadRequests;
    const tasks = parts.map(async (part) => {
      const uploadReq = uploadRequests.find(
        (r) => r.ordinalNumber === part.ordinalNumber,
      );
      if (!uploadReq) {
        throw new Error(`No upload request found for part ${part.ordinalNumber}`);
      }
      await fetch(uploadReq.url, {
        method: uploadReq.method,
        headers: uploadReq.headers,
        body: part.data,
      });
    });
    await Promise.all(tasks);
  }

  async closeSession(batchRef: string): Promise<void> {
    const req = RestRequest.post(Routes.Sessions.Batch.close(batchRef));
    await this.restClient.execute<void>(req);
  }
}
