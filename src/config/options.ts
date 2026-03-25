import { Environment, type EnvironmentConfig, type EnvironmentName } from './environments.js';
import type { TransportFn } from '../http/transport.js';
import type { RetryPolicy } from '../http/retry-policy.js';
import type { RateLimitConfig } from '../http/rate-limit-policy.js';
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
  presignedUrlHosts?: string[];
  authManager?: AuthManager;
}

export interface ResolvedOptions {
  baseUrl: string;
  baseQrUrl: string;
  lighthouseUrl: string;
  apiVersion: string;
  timeout: number;
  customHeaders: Record<string, string>;
  environmentName?: EnvironmentName;
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
  };
}
