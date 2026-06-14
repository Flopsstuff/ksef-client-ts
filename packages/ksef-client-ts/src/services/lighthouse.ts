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
    if (!this.lighthouseUrl) {
      throw new KSeFError(
        'Lighthouse API is not available for the DEMO environment. Use TEST or PROD instead.',
      );
    }
    const response = await fetch(`${this.lighthouseUrl}${path}`, {
      headers: { Accept: 'application/json' },
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
    return this.fetchJson<KsefStatusResponse>('/status');
  }

  async getMessages(): Promise<LighthouseMessage[]> {
    const data = await this.fetchJson<KsefMessagesResponse>('/messages');
    return data.messages ?? [];
  }
}
