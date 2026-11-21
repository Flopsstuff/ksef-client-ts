import { Environment, type EnvironmentConfig, type EnvironmentName } from './environments.js';
import type { TransportFn } from '../http/transport.js';
import type { RetryPolicy } from '../http/retry-policy.js';
import type { RateLimitConfig } from '../http/rate-limit-policy.js';
import type { CircuitBreakerConfig } from '../http/circuit-breaker-policy.js';
import type { AuthManager } from '../http/auth-manager.js';

/**
 * Notice that a response carried a `Deprecation` header (RFC 9745), a `Sunset`
 * header (RFC 8594), or both. KSeF sends these on operations it has scheduled
 * to switch off (KSeF API 2.10.0).
 *
 * The library does not de-duplicate notices. The callback runs once per
 * response that carries either header — including a response the client will
 * retry, and including an error response — and the application decides how to
 * aggregate them.
 */
export interface DeprecationNotice {
  /** HTTP method of the request, for example `GET`. */
  method: string;
  /**
   * Route path of the request, without the API version prefix or query string.
   * This is the value passed to `RestRequest`, for example `tokens`.
   */
  path: string;
  /**
   * When the operation was deprecated, from `Deprecation: @<unix-seconds>`.
   * Undefined when the header is absent or the value is not that form.
   */
  deprecatedSince?: Date;
  /**
   * When the operation will be switched off, from a `Sunset` HTTP-date
   * (RFC 8594). Undefined when the header is absent or the value does not
   * parse. After this instant the operation answers `410 Gone`.
   */
  sunset?: Date;
  /** Raw `Deprecation` header value, when the response included one. */
  rawDeprecation?: string;
  /** Raw `Sunset` header value, when the response included one. */
  rawSunset?: string;
}

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
   * Invoked when a response carries a `Deprecation` header (RFC 9745), a
   * `Sunset` header (RFC 8594), or both (KSeF API 2.10.0). Runs for success
   * and error responses, before an error is thrown. A throwing callback is
   * logged and ignored. When omitted, the notice is logged at debug level.
   * May run many times for the same operation; the library does not
   * de-duplicate it.
   */
  onDeprecation?: (notice: DeprecationNotice) => void;
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
