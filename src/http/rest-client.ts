import { consola } from 'consola';
import { KSeFApiError } from '../errors/ksef-api-error.js';
import { KSeFRateLimitError } from '../errors/ksef-rate-limit-error.js';
import { KSeFUnauthorizedError } from '../errors/ksef-unauthorized-error.js';
import { KSeFForbiddenError } from '../errors/ksef-forbidden-error.js';
import { KSeFGoneError } from '../errors/ksef-gone-error.js';
import { KSeFBadRequestError } from '../errors/ksef-bad-request-error.js';
import { KSeFBatchTimeoutError } from '../errors/ksef-batch-timeout-error.js';
import { KSeFUnknownPublicKeyError } from '../errors/ksef-unknown-public-key-error.js';
import { KSeFErrorCode, hasErrorCode } from '../errors/error-codes.js';
import type {
  ApiErrorResponse,
  TooManyRequestsResponse,
  TooManyRequestsProblemDetails,
  UnauthorizedProblemDetails,
  ForbiddenProblemDetails,
  GoneProblemDetails,
  BadRequestProblemDetails,
} from '../errors/types.js';
import type { ResolvedOptions } from '../config/options.js';
import { RouteBuilder } from './route-builder.js';
import { type RestRequest } from './rest-request.js';
import type { RestResponse } from './rest-response.js';
import { type TransportFn, defaultTransport } from './transport.js';
import {
  type RetryPolicy,
  defaultRetryPolicy,
  calculateBackoff,
  parseRetryAfter,
  isRetryableError,
  isRetryableStatus,
  sleep,
} from './retry-policy.js';
import { type RateLimitPolicy } from './rate-limit-policy.js';
import { type CircuitBreakerPolicy } from './circuit-breaker-policy.js';
import { type AuthManager } from './auth-manager.js';
import { type PresignedUrlPolicy, validatePresignedUrl } from './presigned-url-policy.js';

export interface RestClientConfig {
  transport?: TransportFn;
  retryPolicy?: RetryPolicy;
  rateLimitPolicy?: RateLimitPolicy | null;
  circuitBreakerPolicy?: CircuitBreakerPolicy | null;
  authManager?: AuthManager;
  presignedUrlPolicy?: PresignedUrlPolicy;
}

export class RestClient {
  private readonly options: ResolvedOptions;
  private readonly routeBuilder: RouteBuilder;
  private readonly transport: TransportFn;
  private readonly retryPolicy: RetryPolicy;
  private readonly rateLimitPolicy: RateLimitPolicy | null;
  private readonly circuitBreakerPolicy: CircuitBreakerPolicy | null;
  private readonly authManager?: AuthManager;
  private readonly presignedUrlPolicy?: PresignedUrlPolicy;

  constructor(options: ResolvedOptions, config?: RestClientConfig) {
    this.options = options;
    this.routeBuilder = new RouteBuilder(options.apiVersion);
    this.transport = config?.transport ?? defaultTransport;
    this.retryPolicy = config?.retryPolicy ?? defaultRetryPolicy();
    this.rateLimitPolicy = config?.rateLimitPolicy ?? null;
    this.circuitBreakerPolicy = config?.circuitBreakerPolicy ?? null;
    this.authManager = config?.authManager;
    this.presignedUrlPolicy = config?.presignedUrlPolicy;
  }

  async execute<T>(request: RestRequest): Promise<RestResponse<T>> {
    const response = await this.sendRequest(request);
    await this.ensureSuccess(response);
    const body = (await response.json()) as T;
    return { body, headers: response.headers, statusCode: response.status };
  }

  async executeVoid(request: RestRequest): Promise<void> {
    const response = await this.sendRequest(request);
    await this.ensureSuccess(response);
  }

  async executeRaw(request: RestRequest): Promise<RestResponse<ArrayBuffer>> {
    const response = await this.sendRequest(request);
    await this.ensureSuccess(response);
    const body = await response.arrayBuffer();
    return { body, headers: response.headers, statusCode: response.status };
  }

  private async sendRequest(request: RestRequest): Promise<Response> {
    const url = this.buildUrl(request);

    // 1. Presigned URL validation
    if (request.isPresigned() && this.presignedUrlPolicy) {
      validatePresignedUrl(url, this.presignedUrlPolicy);
    }

    // 2. Circuit-breaker pre-check — fail fast BEFORE paying the rate-limit
    //    cost so an open breaker does not stall on the global token queue or
    //    consume a token that a healthy caller could have used.
    let ownsProbeSlot = false;
    if (this.circuitBreakerPolicy) {
      const claimed = this.circuitBreakerPolicy.ensureClosed(request.path);
      if (claimed) ownsProbeSlot = true;
    }

    // 3. Rate limit acquire (once before retry loop). If acquire throws
    //    (e.g. a custom policy enforcing a max queue depth), release any
    //    claimed half-open probe slot without observing upstream — we must
    //    NOT call recordSuccess here, which would fully close the breaker
    //    based on a probe that never ran. releaseProbe keeps the breaker
    //    OPEN and restarts the cooldown so the next probe waits properly.
    if (this.rateLimitPolicy) {
      try {
        await this.rateLimitPolicy.acquire(request.path);
      } catch (error) {
        if (ownsProbeSlot) this.circuitBreakerPolicy?.releaseProbe(request.path);
        throw error;
      }
    }

    // 4. Retry loop.
    //
    // Circuit-breaker rules:
    // - `ensureClosed` runs at the **start of every iteration** so an open
    //   breaker (possibly opened by another concurrent request mid-loop)
    //   short-circuits remaining attempts instead of letting them proceed.
    // - Outcome is recorded **once per logical request**, on the terminal
    //   path. Retry-and-recover does not score multiple failures against the
    //   breaker, and the documented "5xx after retries exhausted" contract
    //   becomes literal instead of aspirational.
    // - If this request claimed the half-open probe slot, we track ownership
    //   locally so subsequent `ensureClosed` calls in the same retry loop do
    //   not deadlock on our own in-flight probe.
    let lastError: unknown;
    for (let attempt = 0; attempt <= this.retryPolicy.maxRetries; attempt++) {
      if (this.circuitBreakerPolicy) {
        const claimed = this.circuitBreakerPolicy.ensureClosed(request.path, ownsProbeSlot);
        if (claimed) ownsProbeSlot = true;
      }

      try {
        let response = await this.doRequest(request, url);

        // Auth refresh on 401 — one-shot, first attempt only. The refreshed
        // response then falls through into the normal outcome-recording flow
        // so the breaker sees a single, consistent outcome regardless of
        // whether a token refresh happened.
        if (response.status === 401 && this.authManager && attempt === 0 && !request.isSkipAuthRetry()) {
          const newToken = await this.authManager.onUnauthorized();
          if (newToken) {
            consola.debug('Auth token refreshed, retrying request');
            response = await this.doRequest(request, url, newToken);
          }
        }

        // Retryable status + budget left → defer outcome to a later iteration.
        if (isRetryableStatus(response.status, this.retryPolicy) && attempt < this.retryPolicy.maxRetries) {
          const is429 = response.status === 429;
          const retryAfterMs = is429 ? parseRetryAfter(response.headers.get('Retry-After')) : null;
          const delayMs = retryAfterMs ?? calculateBackoff(attempt, this.retryPolicy);

          consola.debug(`Retryable ${response.status}, attempt ${attempt + 1}/${this.retryPolicy.maxRetries}, waiting ${Math.round(delayMs)}ms`);
          await sleep(delayMs);

          // Re-acquire rate limit token on 429. If this local step fails
          // (custom policy rejection, max queue depth, etc.), the upstream
          // response we already observed was a 429 — NOT an outage signal.
          // Record the observed outcome (releases any probe slot via
          // recordSuccess) and propagate the limiter error instead of letting
          // the generic catch below misclassify it as upstream failure.
          if (is429 && this.rateLimitPolicy) {
            try {
              await this.rateLimitPolicy.acquire(request.path);
            } catch (error) {
              this.recordCircuitOutcome(request.path, 429);
              // Outcome already recorded — prevent the outer catch from also
              // re-recording this as an upstream failure via the probe-owner
              // fallback path.
              ownsProbeSlot = false;
              throw error;
            }
          }
          continue;
        }

        // Terminal response — record outcome once, then return.
        this.recordCircuitOutcome(request.path, response.status);
        return response;
      } catch (error) {
        lastError = error;

        if (isRetryableError(error, this.retryPolicy) && attempt < this.retryPolicy.maxRetries) {
          const delayMs = calculateBackoff(attempt, this.retryPolicy);
          consola.debug(`Network error, attempt ${attempt + 1}/${this.retryPolicy.maxRetries}, waiting ${Math.round(delayMs)}ms`);
          await sleep(delayMs);
          continue;
        }

        // Terminal network error — count against the breaker when the failure
        // mode is the kind it protects against. A non-retryable throw (ex.
        // AbortError on deliberate cancel) is normally not an outage signal,
        // but if this request had claimed the half-open probe slot we MUST
        // release it — otherwise `probeInFlight` stays true forever and the
        // breaker deadlocks. `recordFailure` on an owned probe re-opens with
        // a fresh cooldown (see CircuitBreakerPolicy.recordFailure).
        if (isRetryableError(error, this.retryPolicy) || ownsProbeSlot) {
          this.circuitBreakerPolicy?.recordFailure(request.path);
        }

        throw error;
      }
    }

    throw lastError;
  }

  private recordCircuitOutcome(path: string, status: number): void {
    if (!this.circuitBreakerPolicy) return;
    if (status >= 500) {
      this.circuitBreakerPolicy.recordFailure(path);
      return;
    }
    // Any non-5xx response — including 401/429 — is not an outage signal.
    // Recording success (a) resets an in-progress failure streak to keep
    // the documented "consecutive failures" semantics and prevent false
    // positives from 500 → 429 → 500 patterns, and (b) releases the
    // half-open probe slot if this request owned it.
    this.circuitBreakerPolicy.recordSuccess(path);
  }

  private async doRequest(request: RestRequest, url: string, overrideToken?: string): Promise<Response> {
    const headers: Record<string, string> = {
      ...this.options.customHeaders,
      ...request.getHeaders(),
    };

    const hasHeader = (name: string) =>
      Object.keys(headers).some((header) => header.toLowerCase() === name.toLowerCase());

    if (this.options.errorFormat !== 'legacy' && !hasHeader('x-error-format')) {
      headers['X-Error-Format'] = 'problem-details';
    }

    // Auth header injection: explicit token on request takes precedence
    if (!headers['Authorization'] && this.authManager) {
      const token = overrideToken ?? this.authManager.getAccessToken();
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
    }

    const rawBody = request.getBody();
    if (rawBody !== undefined && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }

    let body: string | undefined;
    if (rawBody !== undefined) {
      body = typeof rawBody === 'string' ? rawBody : JSON.stringify(rawBody);
    }

    const start = performance.now();
    const response = await this.transport(url, {
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

    let jsonCache: { value: unknown } | null = null;
    const parseJson = <T>(): T | undefined => {
      if (jsonCache === null) {
        try { jsonCache = { value: JSON.parse(text) }; }
        catch { jsonCache = { value: undefined }; }
      }
      return jsonCache.value as T | undefined;
    };

    const tryParseProblem = <T>(guard: (value: unknown) => value is T): T | undefined => {
      const parsed = parseJson<unknown>();
      return parsed !== undefined && guard(parsed) ? parsed : undefined;
    };

    if (response.status === 400) {
      const problem = tryParseProblem(isBadRequestProblem);
      if (problem) {
        if (problem.errors?.some((e) => e.code === KSeFErrorCode.UnknownPublicKeyId)) {
          throw KSeFUnknownPublicKeyError.fromProblem(problem);
        }
        throw new KSeFBadRequestError(problem);
      }
      const legacy = parseJson<ApiErrorResponse>();
      if (hasErrorCode(legacy, KSeFErrorCode.UnknownPublicKeyId)) {
        throw KSeFUnknownPublicKeyError.fromLegacy(legacy);
      }
      if (hasErrorCode(legacy, KSeFErrorCode.BatchTimeout)) {
        throw KSeFBatchTimeoutError.fromResponse(400, legacy);
      }
      throw KSeFApiError.fromResponse(400, legacy);
    }

    if (response.status === 429) {
      const problem = tryParseProblem(isTooManyRequestsProblem);
      const legacy = problem
        ? undefined
        : parseJson<TooManyRequestsResponse & ApiErrorResponse>();
      throw KSeFRateLimitError.fromRetryAfterHeader(
        response.status,
        response.headers.get('Retry-After'),
        legacy,
        problem,
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

    if (response.status === 410) {
      const body = parseJson<Partial<GoneProblemDetails>>();
      throw new KSeFGoneError({
        title: body?.title || 'Gone',
        status: body?.status || 410,
        detail: body?.detail || 'Operation status no longer available (retention expired)',
        instance: body?.instance,
        traceId: body?.traceId,
        timestamp: body?.timestamp,
      });
    }

    const body = parseJson<ApiErrorResponse>();
    if (hasErrorCode(body, KSeFErrorCode.BatchTimeout)) {
      throw KSeFBatchTimeoutError.fromResponse(response.status, body);
    }
    throw KSeFApiError.fromResponse(response.status, body);
  }
}

function isBadRequestProblem(value: unknown): value is BadRequestProblemDetails {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  if (typeof v.title !== 'string') return false;
  if (v.status !== undefined && typeof v.status !== 'number') return false;
  if (v.errors !== undefined) {
    if (!Array.isArray(v.errors)) return false;
    for (const item of v.errors) {
      if (typeof item !== 'object' || item === null) return false;
      const detail = item as Record<string, unknown>;
      if (typeof detail.code !== 'number') return false;
      if (typeof detail.description !== 'string') return false;
    }
  }
  return true;
}

function isTooManyRequestsProblem(value: unknown): value is TooManyRequestsProblemDetails {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.title === 'string'
    && (v.status === undefined || typeof v.status === 'number')
    && (v.detail === undefined || typeof v.detail === 'string')
    && (v.instance === undefined || typeof v.instance === 'string')
    && (v.traceId === undefined || typeof v.traceId === 'string')
    && (v.timestamp === undefined || typeof v.timestamp === 'string');
}
