import { KSeFValidationError } from '../errors/ksef-validation-error.js';

export interface PresignedUrlPolicy {
  allowedHosts: string[];
  requireHttps: boolean;
  blockRedirectParams: boolean;
  rejectPrivateIps: boolean;
}

export function defaultPresignedUrlPolicy(): PresignedUrlPolicy {
  return {
    allowedHosts: ['*.ksef.mf.gov.pl'],
    requireHttps: true,
    blockRedirectParams: true,
    rejectPrivateIps: true,
  };
}

export function validatePresignedUrl(url: string, policy: PresignedUrlPolicy): void {
  const parsed = new URL(url);

  if (policy.requireHttps && parsed.protocol !== 'https:') {
    throw new KSeFValidationError(`Presigned URL must use HTTPS: ${url}`);
  }

  if (!matchesAllowedHost(parsed.hostname, policy.allowedHosts)) {
    throw new KSeFValidationError(
      `Presigned URL host '${parsed.hostname}' is not in the allowed hosts list`,
    );
  }

  if (policy.blockRedirectParams) {
    checkRedirectParams(parsed, url);
  }

  if (policy.rejectPrivateIps) {
    checkPrivateIp(parsed.hostname, url);
  }
}

function matchesAllowedHost(hostname: string, allowedHosts: string[]): boolean {
  for (const pattern of allowedHosts) {
    if (pattern.startsWith('*.')) {
      const suffix = pattern.slice(1); // '.domain.com'
      if (hostname.endsWith(suffix) && hostname.length > suffix.length) {
        return true;
      }
    } else if (hostname === pattern) {
      return true;
    }
  }
  return false;
}

const BLOCKED_PARAMS = ['redirect', 'callback', 'return_url', 'next'];

function checkRedirectParams(parsed: URL, originalUrl: string): void {
  for (const [key] of parsed.searchParams) {
    if (BLOCKED_PARAMS.includes(key.toLowerCase())) {
      throw new KSeFValidationError(
        `Presigned URL contains blocked redirect parameter '${key}': ${originalUrl}`,
      );
    }
  }
}

function checkPrivateIp(hostname: string, originalUrl: string): void {
  // Strip IPv6 brackets
  const host = hostname.startsWith('[') ? hostname.slice(1, -1) : hostname;

  if (isPrivateIPv4(host) || isPrivateIPv6(host)) {
    throw new KSeFValidationError(
      `Presigned URL resolves to a private/reserved IP address '${hostname}': ${originalUrl}`,
    );
  }
}

function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split('.');
  if (parts.length !== 4) return false;

  const nums = parts.map(Number);
  if (nums.some((n) => Number.isNaN(n))) return false;

  const a = nums[0]!;
  const b = nums[1]!;

  // Loopback: 127.0.0.0/8
  if (a === 127) return true;
  // Private: 10.0.0.0/8
  if (a === 10) return true;
  // Private: 172.16.0.0/12
  if (a === 172 && b >= 16 && b <= 31) return true;
  // Private: 192.168.0.0/16
  if (a === 192 && b === 168) return true;
  // Link-local: 169.254.0.0/16
  if (a === 169 && b === 254) return true;

  return false;
}

function isPrivateIPv6(ip: string): boolean {
  const lower = ip.toLowerCase();

  // Loopback
  if (lower === '::1') return true;
  // Private (fc00::/7)
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true;
  // Link-local (fe80::/10)
  if (lower.startsWith('fe8') || lower.startsWith('fe9') || lower.startsWith('fea') || lower.startsWith('feb')) return true;

  return false;
}
