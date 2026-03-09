import type { ResolvedOptions } from '../config/options.js';
import type { KsefStatusResponse, LighthouseMessage, KsefMessagesResponse } from '../models/lighthouse/types.js';
import { KSeFError } from '../errors/index.js';

export class LighthouseService {
  private readonly lighthouseUrl: string;
  private readonly timeout: number;

  constructor(options: ResolvedOptions) {
    this.lighthouseUrl = options.lighthouseUrl;
    this.timeout = options.timeout;
  }

  private async fetchJson<T>(path: string): Promise<T> {
    const response = await fetch(`${this.lighthouseUrl}${path}`, {
      signal: AbortSignal.timeout(this.timeout),
    });
    if (!response.ok) {
      const body = await response.text();
      throw new KSeFError(
        `Lighthouse ${path} failed: HTTP ${response.status} — ${body}`,
      );
    }
    return (await response.json()) as T;
  }

  async getStatus(): Promise<KsefStatusResponse> {
    return this.fetchJson<KsefStatusResponse>('/lighthouse/status');
  }

  async getMessages(): Promise<LighthouseMessage[]> {
    const data = await this.fetchJson<KsefMessagesResponse>('/lighthouse/messages');
    return data.messages ?? [];
  }
}
