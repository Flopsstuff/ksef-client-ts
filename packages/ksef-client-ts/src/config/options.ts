import { Environment, type EnvironmentConfig, type EnvironmentName } from './environments.js';
import type { TransportFn } from '../http/transport.js';
import type { RetryPolicy } from '../http/retry-policy.js';
import type { RateLimitConfig } from '../http/rate-limit-policy.js';
import type { CircuitBreakerConfig } from '../http/circuit-breaker-policy.js';
import type { AuthManager } from '../http/auth-manager.js';

export interface KSeFClientOptions {
  /**
   * Target KSeF environment. Defaults to `'TEST'` when neither `environment`
   * nor `baseUrl` is specified.
   */
  environment?: EnvironmentName;
  /**
   * Custom base URL for the KSeF API. Overrides the URL from `environment`.
   *
   * **Warning:** When `baseUrl` is set without `environment`, the test environment
   * guard is bypassed — test data APIs will not be blocked. Set `environment`
   * explicitly alongside `baseUrl` if the guard is needed.
   */
  baseUrl?: string;
  baseQrUrl?: string;
  lighthouseUrl?: string;
  apiVersion?: string;
  timeout?: number;
  customHeaders?: Record<string, string>;
  transport?: TransportFn;
  retry?: Partial<RetryPolicy>;
  rateLimit?: Partial<RateLimitConfig> | null;
  /**
   * HTTP circuit breaker. Opt-in: `undefined` or omitted keeps the feature off.
   * Pass a partial config to enable with defaults merged in. Opens after
   * consecutive network/5xx failures and fails fast during the cooldown window,
   * then probes a single request to recover. 429/401 never trip the breaker.
   */
  circuitBreaker?: Partial<CircuitBreakerConfig> | null;
  presignedUrlHosts?: string[];
  authManager?: AuthManager;
  /**
   * Invoked with the raw `X-System-Warning` response header value when present
   * (KSeF API v2.6.0). Advisory only — does not affect the operation result.
   * When omitted, warnings are logged at warn level.
   */
  onSystemWarning?: (warning: string) => void;
  /**
   * Request format for server-returned error bodies. Defaults to
   * `'problem-details'` (RFC 7807, KSeF API v2.4.0+). Set to `'legacy'`
   * to suppress the `X-Error-Format` header and receive legacy error
   * bodies from older servers or proxies.
   */
  errorFormat?: 'problem-details' | 'legacy';
}

export interface ResolvedOptions {
  baseUrl: string;
  baseQrUrl: string;
  lighthouseUrl: string;
  apiVersion: string;
  timeout: number;
  customHeaders: Record<string, string>;
  environmentName?: EnvironmentName;
  errorFormat: 'problem-details' | 'legacy';
}

const DEFAULT_API_VERSION = 'v2';
const DEFAULT_TIMEOUT = 30_000;

export function resolveOptions(options: KSeFClientOptions = {}): ResolvedOptions {
  const env: EnvironmentConfig = options.environment
    ? Environment[options.environment]
    : Environment.TEST;

  return {
    baseUrl: options.baseUrl ?? env.apiUrl,
    baseQrUrl: options.baseQrUrl ?? env.qrUrl,
    lighthouseUrl: options.lighthouseUrl ?? env.lighthouseUrl,
    apiVersion: options.apiVersion ?? DEFAULT_API_VERSION,
    timeout: options.timeout ?? DEFAULT_TIMEOUT,
    customHeaders: options.customHeaders ?? {},
    environmentName: options.environment ?? (options.baseUrl ? undefined : 'TEST'),
    errorFormat: options.errorFormat ?? 'problem-details',
  };
}
