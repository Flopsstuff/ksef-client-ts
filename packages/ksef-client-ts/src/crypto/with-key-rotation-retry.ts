import { KSeFUnknownPublicKeyError } from '../errors/ksef-unknown-public-key-error.js';
import type { CryptographyService } from './cryptography-service.js';

/**
 * Run an encryption-bearing operation with KSeF key-rotation recovery (KSeF API v2.5.0).
 *
 * If KSeF rejects the request because the supplied public key identifier is unknown or
 * revoked (error 21470), refresh the certificate cache and retry the operation exactly
 * once with a freshly selected key. A second failure propagates to the caller.
 *
 * The operation MUST rebuild its encryption material on each invocation (i.e. call
 * `getEncryptionData()` / `encryptKsefToken()` inside `op`) so the retry picks up the
 * refreshed key.
 */
export async function withKeyRotationRetry<T>(
  crypto: CryptographyService,
  op: () => Promise<T>,
): Promise<T> {
  try {
    return await op();
  } catch (err) {
    if (err instanceof KSeFUnknownPublicKeyError) {
      await crypto.refresh();
      return await op();
    }
    throw err;
  }
}
