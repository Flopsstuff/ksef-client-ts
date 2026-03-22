import type { RestClient } from '../../../src/http/rest-client.js';
import type { RestRequest } from '../../../src/http/rest-request.js';

export function createMockRestClient() {
  return {
    execute: vi.fn().mockResolvedValue({
      body: {},
      headers: new Headers(),
      statusCode: 200,
    }),
    executeVoid: vi.fn().mockResolvedValue(undefined),
    executeRaw: vi.fn().mockResolvedValue({
      body: new ArrayBuffer(0),
      headers: new Headers(),
      statusCode: 200,
    }),
  } as unknown as RestClient;
}

export function getRequest(
  mock: ReturnType<typeof vi.fn>,
  callIndex = 0,
): RestRequest {
  return mock.mock.calls[callIndex][0] as RestRequest;
}

export function mockResponse<T>(body: T, headers?: Headers) {
  return {
    body,
    headers: headers ?? new Headers(),
    statusCode: 200,
  };
}

export function mockRawResponse(
  text: string,
  headers?: Record<string, string>,
) {
  const encoded = new TextEncoder().encode(text);
  return {
    body: encoded.buffer as ArrayBuffer,
    headers: new Headers(headers),
    statusCode: 200,
  };
}
