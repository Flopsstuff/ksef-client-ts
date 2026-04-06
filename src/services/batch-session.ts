import { RestClient } from '../http/rest-client.js';
import { KSEF_FEATURE_HEADER } from '../http/ksef-feature.js';
import { RestRequest } from '../http/rest-request.js';
import { Routes } from '../http/routes.js';
import { runWithConcurrency } from '../utils/concurrency.js';
import type { UpoVersion } from '../http/ksef-feature.js';
import type { OpenBatchSessionRequest, OpenBatchSessionResponse, BatchPartSendingInfo, BatchPartStreamSendingInfo } from '../models/sessions/batch-types.js';

export class BatchSessionService {
  private readonly restClient: RestClient;

  constructor(restClient: RestClient) {
    this.restClient = restClient;
  }

  async openSession(
    request: OpenBatchSessionRequest,
    upoVersion?: UpoVersion | string,
  ): Promise<OpenBatchSessionResponse> {
    const req = RestRequest.post(Routes.Sessions.Batch.open)
      .body(request);
    if (upoVersion) {
      req.header(KSEF_FEATURE_HEADER, upoVersion);
    }
    const response = await this.restClient.execute<OpenBatchSessionResponse>(req);
    return response.body;
  }

  async sendParts(
    openResponse: OpenBatchSessionResponse,
    parts: BatchPartSendingInfo[],
    parallelism?: number,
  ): Promise<void> {
    const uploadRequests = openResponse.partUploadRequests;
    const tasks = parts.map((part) => async () => {
      const uploadReq = uploadRequests.find(
        (r) => r.ordinalNumber === part.ordinalNumber,
      );
      if (!uploadReq) {
        throw new Error(`No upload request found for part ${part.ordinalNumber}`);
      }
      const headers: Record<string, string> = {};
      for (const [k, v] of Object.entries(uploadReq.headers)) {
        if (v != null) headers[k] = v;
      }
      const resp = await fetch(uploadReq.url, {
        method: uploadReq.method,
        headers,
        body: part.data,
      });
      if (!resp.ok) {
        throw new Error(`Upload failed for part ${part.ordinalNumber}: HTTP ${resp.status}`);
      }
    });
    if (parallelism !== undefined) {
      await runWithConcurrency(tasks, parallelism);
    } else {
      await Promise.all(tasks.map(t => t()));
    }
  }

  /**
   * Upload parts using streaming bodies (`duplex: 'half'`).
   * By default uploads sequentially to avoid backpressure issues.
   * Pass `parallelism` to enable bounded concurrent uploads.
   */
  async sendPartsWithStream(
    openResponse: OpenBatchSessionResponse,
    parts: BatchPartStreamSendingInfo[],
    parallelism?: number,
  ): Promise<void> {
    const uploadRequests = openResponse.partUploadRequests;
    const uploadPart = async (part: BatchPartStreamSendingInfo) => {
      const uploadReq = uploadRequests.find(
        (r) => r.ordinalNumber === part.ordinalNumber,
      );
      if (!uploadReq) {
        throw new Error(`No upload request found for part ${part.ordinalNumber}`);
      }
      const headers: Record<string, string> = {};
      for (const [k, v] of Object.entries(uploadReq.headers)) {
        if (v != null) headers[k] = v;
      }
      const resp = await fetch(uploadReq.url, {
        method: uploadReq.method,
        headers,
        body: part.dataStream,
        // @ts-expect-error -- Node 18+ undici supports duplex for streaming body
        duplex: 'half',
      });
      if (!resp.ok) {
        throw new Error(`Upload failed for part ${part.ordinalNumber}: HTTP ${resp.status}`);
      }
    };

    if (parallelism !== undefined) {
      await runWithConcurrency(parts.map((p) => () => uploadPart(p)), parallelism);
    } else {
      for (const part of parts) {
        await uploadPart(part);
      }
    }
  }

  async closeSession(batchRef: string): Promise<void> {
    const req = RestRequest.post(Routes.Sessions.Batch.close(batchRef));
    await this.restClient.executeVoid(req);
  }
}
