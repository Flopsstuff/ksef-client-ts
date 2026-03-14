import { consola } from 'consola';
import { KSeFApiError } from '../errors/ksef-api-error.js';
import { KSeFRateLimitError } from '../errors/ksef-rate-limit-error.js';
import { KSeFUnauthorizedError } from '../errors/ksef-unauthorized-error.js';
import { KSeFForbiddenError } from '../errors/ksef-forbidden-error.js';
import type { ApiErrorResponse, UnauthorizedProblemDetails, ForbiddenProblemDetails } from '../errors/types.js';
import type { ResolvedOptions } from '../config/options.js';
import { RouteBuilder } from './route-builder.js';
import { type RestRequest } from './rest-request.js';
import type { RestResponse } from './rest-response.js';

export class RestClient {
  private readonly options: ResolvedOptions;
  private readonly routeBuilder: RouteBuilder;

  constructor(options: ResolvedOptions) {
    this.options = options;
    this.routeBuilder = new RouteBuilder(options.apiVersion);
  }

  async execute<T>(request: RestRequest): Promise<RestResponse<T>> {
    const response = await this.sendRequest(request);
    await this.ensureSuccess(response);
    const body = (await response.json()) as T;
    return { body, headers: response.headers, statusCode: response.status };
  }

  async executeRaw(request: RestRequest): Promise<RestResponse<ArrayBuffer>> {
    const response = await this.sendRequest(request);
    await this.ensureSuccess(response);
    const body = await response.arrayBuffer();
    return { body, headers: response.headers, statusCode: response.status };
  }

  private async sendRequest(request: RestRequest): Promise<Response> {
    const url = this.buildUrl(request);

    const headers: Record<string, string> = {
      ...this.options.customHeaders,
      ...request.getHeaders(),
    };

    const rawBody = request.getBody();
    if (rawBody !== undefined && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }

    let body: string | undefined;
    if (rawBody !== undefined) {
      body = typeof rawBody === 'string' ? rawBody : JSON.stringify(rawBody);
    }

    const start = performance.now();
    const response = await fetch(url, {
      method: request.method,
      headers,
      body,
      signal: AbortSignal.timeout(this.options.timeout),
    });
    const elapsed = Math.round(performance.now() - start);
    consola.debug(`${request.method} ${url} → ${response.status} (${elapsed}ms)`);
    return response;
  }

  private buildUrl(request: RestRequest): string {
    const path = this.routeBuilder.build(request.path);
    const base = this.options.baseUrl;
    const url = new URL(`${base}${path}`);

    const query = request.getQuery();
    for (const [key, value] of query) {
      url.searchParams.append(key, value);
    }

    return url.toString();
  }

  private async ensureSuccess(response: Response): Promise<void> {
    if (response.ok) return;

    const text = await response.text().catch(() => '');

    const parseJson = <T>(): T | undefined => {
      try { return JSON.parse(text) as T; } catch { return undefined; }
    };

    if (response.status === 429) {
      throw KSeFRateLimitError.fromRetryAfterHeader(
        response.status,
        response.headers.get('Retry-After'),
        parseJson<ApiErrorResponse>(),
      );
    }

    if (response.status === 401) {
      const body = parseJson<UnauthorizedProblemDetails>();
      if (body?.detail) {
        throw new KSeFUnauthorizedError(body);
      }
    }

    if (response.status === 403) {
      const body = parseJson<ForbiddenProblemDetails>();
      if (body?.reasonCode) {
        throw new KSeFForbiddenError(body);
      }
    }

    throw KSeFApiError.fromResponse(response.status, parseJson<ApiErrorResponse>());
  }
}
