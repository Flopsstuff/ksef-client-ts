import crypto from 'node:crypto';

/** Compute SHA-256 hash of data, returned as base64 string. */
export function sha256Base64(data: Uint8Array): string {
  return crypto.createHash('sha256').update(data).digest('base64');
}

/** Returns true if SHA-256 base64 of `data` matches `expectedHash`. */
export function verifyHash(data: Uint8Array, expectedHash: string): boolean {
  return sha256Base64(data) === expectedHash;
}
