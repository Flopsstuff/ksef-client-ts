import { RestClient } from '../../../src/http/rest-client.js';
import { RestRequest } from '../../../src/http/rest-request.js';
import type { TransportFn } from '../../../src/http/transport.js';
import type { ResolvedOptions } from '../../../src/config/options.js';
import { KSeFApiError } from '../../../src/errors/ksef-api-error.js';
import { KSeFBadRequestError } from '../../../src/errors/ksef-bad-request-error.js';
import { KSeFBatchTimeoutError } from '../../../src/errors/ksef-batch-timeout-error.js';
import { KSeFUnknownPublicKeyError } from '../../../src/errors/ksef-unknown-public-key-error.js';
import { KSeFSessionUnavailableError } from '../../../src/errors/ksef-session-unavailable-error.js';
import { KSeFErrorCode, hasErrorCode } from '../../../src/errors/error-codes.js';

const defaultOptions: ResolvedOptions = {
  baseUrl: 'https://ksef-test.mf.gov.pl/api',
  baseQrUrl: 'https://ksef-test.mf.gov.pl/web',
  lighthouseUrl: 'https://ksef-test.mf.gov.pl/api',
  apiVersion: 'v2',
  timeout: 5000,
  customHeaders: {},
  errorFormat: 'problem-details',
};

const DETAIL = "Invalid value in field 'permissionTypes[0]'.";

async function executeWith(status: number, body: unknown): Promise<unknown> {
  const transport = vi.fn<TransportFn>().mockResolvedValue(new Response(JSON.stringify(body), { status }));
  const client = new RestClient(defaultOptions, { transport });
  return client.execute(RestRequest.get('/test')).catch((e: unknown) => e);
}

// 21001 has no class of its own: the caller fixes the field, there is nothing to recover.
describe('RestClient — KSeF code 21001 (unreadable content)', () => {
  it('keeps a 400 Problem Details body with code 21001 a KSeFBadRequestError', async () => {
    // The shape KSeF TEST returns to this client, which asks for Problem Details by default.
    const err = await executeWith(400, {
      title: 'Bad Request',
      status: 400,
      detail: 'Żądanie jest nieprawidłowe.',
      errors: [{ code: 21001, description: 'Nieczytelna treść.', details: [DETAIL] }],
    });

    expect(err).toBeInstanceOf(KSeFBadRequestError);
    expect(err).not.toBeInstanceOf(KSeFUnknownPublicKeyError);
    expect(err).not.toBeInstanceOf(KSeFSessionUnavailableError);
    expect((err as KSeFBadRequestError).errors[0]).toMatchObject({
      code: KSeFErrorCode.UnreadableContent,
      details: [DETAIL],
    });
  });

  it('keeps a 400 legacy body with exceptionCode 21001 a generic KSeFApiError', async () => {
    // The shape KSeF TEST returns without the Problem Details header.
    const err = await executeWith(400, {
      exception: {
        exceptionDetailList: [{ exceptionCode: 21001, exceptionDescription: 'Nieczytelna treść.', details: [DETAIL] }],
      },
    });

    expect(err).toBeInstanceOf(KSeFApiError);
    expect(err).not.toBeInstanceOf(KSeFUnknownPublicKeyError);
    expect(err).not.toBeInstanceOf(KSeFSessionUnavailableError);
    expect(err).not.toBeInstanceOf(KSeFBatchTimeoutError);
    expect((err as KSeFApiError).statusCode).toBe(400);
    expect((err as KSeFApiError).message).toBe('Nieczytelna treść.');
    expect(hasErrorCode((err as KSeFApiError).errorResponse, KSeFErrorCode.UnreadableContent)).toBe(true);
  });
});
