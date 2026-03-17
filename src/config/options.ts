import { Environment, type EnvironmentConfig, type EnvironmentName } from './environments.js';
import type { TransportFn } from '../http/transport.js';
import type { RetryPolicy } from '../http/retry-policy.js';
import type { RateLimitConfig } from '../http/rate-limit-policy.js';

export interface KSeFClientOptions {
  environment?: EnvironmentName;
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
}

export interface ResolvedOptions {
  baseUrl: string;
  baseQrUrl: string;
  lighthouseUrl: string;
  apiVersion: string;
  timeout: number;
  customHeaders: Record<string, string>;
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
  };
}
