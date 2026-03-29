export interface KSeFTokenContext {
  type?: string;
  contextIdentifierType?: string;
  contextIdentifierValue?: string;
  authMethod?: string;
  permissions?: string[];
  subjectDetails?: Record<string, unknown>;
  authorSubjectIdentifier?: Record<string, unknown>;
  issuedAt?: number;
  expiresAt?: number;
}

/**
 * Decodes the payload of a JWT token without verifying its signature.
 * Intended for display purposes only (e.g., the `whoami` command).
 */
export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  try {
    const payload = parts[1]!;
    const json = Buffer.from(payload, 'base64url').toString('utf-8');
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function tryParseJson(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== 'string') return undefined;
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

function tryParseJsonArray(value: unknown): string[] | undefined {
  if (typeof value !== 'string') return undefined;
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) && parsed.every(item => typeof item === 'string') ? parsed : undefined;
  } catch {
    return undefined;
  }
}

export function parseKSeFTokenContext(token: string): KSeFTokenContext | null {
  const raw = decodeJwtPayload(token);
  if (!raw) return null;

  return {
    type: typeof raw['typ'] === 'string' ? raw['typ'] : undefined,
    contextIdentifierType: typeof raw['cit'] === 'string' ? raw['cit'] : undefined,
    contextIdentifierValue: typeof raw['civ'] === 'string' ? raw['civ'] : undefined,
    authMethod: typeof raw['aum'] === 'string' ? raw['aum'] : undefined,
    permissions: tryParseJsonArray(raw['per']),
    subjectDetails: tryParseJson(raw['sud']),
    authorSubjectIdentifier: tryParseJson(raw['asi']),
    issuedAt: typeof raw['iat'] === 'number' ? raw['iat'] : undefined,
    expiresAt: typeof raw['exp'] === 'number' ? raw['exp'] : undefined,
  };
}
