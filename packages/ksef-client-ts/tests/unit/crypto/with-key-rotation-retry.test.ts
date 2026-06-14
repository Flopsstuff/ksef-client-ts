import { withKeyRotationRetry } from '../../../src/crypto/with-key-rotation-retry.js';
import { KSeFUnknownPublicKeyError } from '../../../src/errors/ksef-unknown-public-key-error.js';
import { KSeFApiError } from '../../../src/errors/ksef-api-error.js';
import type { CryptographyService } from '../../../src/crypto/cryptography-service.js';

function mockCrypto(): { crypto: CryptographyService; refresh: ReturnType<typeof vi.fn> } {
  const refresh = vi.fn().mockResolvedValue(undefined);
  return { crypto: { refresh } as unknown as CryptographyService, refresh };
}

describe('withKeyRotationRetry', () => {
  it('returns the result without refreshing when the operation succeeds', async () => {
    const { crypto, refresh } = mockCrypto();
    const op = vi.fn().mockResolvedValue('ok');

    await expect(withKeyRotationRetry(crypto, op)).resolves.toBe('ok');
    expect(op).toHaveBeenCalledTimes(1);
    expect(refresh).not.toHaveBeenCalled();
  });

  it('refreshes certificates and retries once on a 21470 error', async () => {
    const { crypto, refresh } = mockCrypto();
    const op = vi.fn()
      .mockRejectedValueOnce(KSeFUnknownPublicKeyError.fromLegacy())
      .mockResolvedValueOnce('recovered');

    await expect(withKeyRotationRetry(crypto, op)).resolves.toBe('recovered');
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(op).toHaveBeenCalledTimes(2);
  });

  it('propagates the error and does not retry again when the second attempt also fails with 21470', async () => {
    const { crypto, refresh } = mockCrypto();
    const op = vi.fn().mockRejectedValue(KSeFUnknownPublicKeyError.fromLegacy());

    await expect(withKeyRotationRetry(crypto, op)).rejects.toBeInstanceOf(KSeFUnknownPublicKeyError);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(op).toHaveBeenCalledTimes(2);
  });

  it('does not refresh or retry on unrelated errors', async () => {
    const { crypto, refresh } = mockCrypto();
    const op = vi.fn().mockRejectedValue(new KSeFApiError('boom', 400));

    await expect(withKeyRotationRetry(crypto, op)).rejects.toBeInstanceOf(KSeFApiError);
    expect(refresh).not.toHaveBeenCalled();
    expect(op).toHaveBeenCalledTimes(1);
  });
});
