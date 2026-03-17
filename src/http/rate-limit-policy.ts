export interface RateLimitConfig {
  globalRps: number;
  endpointLimits?: Record<string, number>;
}

class TokenBucket {
  private tokens: number;
  private readonly maxTokens: number;
  private readonly refillRate: number; // tokens per ms
  private lastRefill: number;

  constructor(rps: number) {
    this.maxTokens = rps;
    this.tokens = rps;
    this.refillRate = rps / 1000;
    this.lastRefill = Date.now();
  }

  async acquire(): Promise<void> {
    this.refill();

    if (this.tokens >= 1) {
      this.tokens -= 1;
      return;
    }

    const waitMs = Math.ceil((1 - this.tokens) / this.refillRate);
    await new Promise<void>((resolve) => setTimeout(resolve, waitMs));
    this.refill();
    this.tokens -= 1;
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    this.tokens = Math.min(this.maxTokens, this.tokens + elapsed * this.refillRate);
    this.lastRefill = now;
  }
}

export class RateLimitPolicy {
  private readonly globalBucket: TokenBucket;
  private readonly endpointBuckets = new Map<string, TokenBucket>();
  private readonly endpointLimits: Record<string, number>;
  private chain: Promise<void> = Promise.resolve();

  constructor(config: RateLimitConfig) {
    this.globalBucket = new TokenBucket(config.globalRps);
    this.endpointLimits = config.endpointLimits ?? {};
  }

  async acquire(endpoint: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.chain = this.chain
        .then(() => this.doAcquire(endpoint))
        .then(resolve, reject);
    });
  }

  private async doAcquire(endpoint: string): Promise<void> {
    await this.globalBucket.acquire();

    const limit = this.endpointLimits[endpoint];
    if (limit !== undefined) {
      let bucket = this.endpointBuckets.get(endpoint);
      if (!bucket) {
        bucket = new TokenBucket(limit);
        this.endpointBuckets.set(endpoint, bucket);
      }
      await bucket.acquire();
    }
  }
}

export function defaultRateLimitPolicy(): RateLimitPolicy {
  return new RateLimitPolicy({ globalRps: 10 });
}
