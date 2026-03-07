import type { ResolvedOptions } from '../config/options.js';
import type { KsefStatusResponse, LighthouseMessage, KsefMessagesResponse } from '../models/lighthouse/types.js';

export class LighthouseService {
  private readonly lighthouseUrl: string;
  private readonly timeout: number;

  constructor(options: ResolvedOptions) {
    this.lighthouseUrl = options.lighthouseUrl;
    this.timeout = options.timeout;
  }

  async getStatus(): Promise<KsefStatusResponse> {
    const response = await fetch(`${this.lighthouseUrl}/lighthouse/status`, {
      signal: AbortSignal.timeout(this.timeout),
    });
    return (await response.json()) as KsefStatusResponse;
  }

  async getMessages(): Promise<LighthouseMessage[]> {
    const response = await fetch(`${this.lighthouseUrl}/lighthouse/messages`, {
      signal: AbortSignal.timeout(this.timeout),
    });
    const data = (await response.json()) as KsefMessagesResponse;
    return data.messages;
  }
}
