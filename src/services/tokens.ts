import { RestClient } from '../http/rest-client.js';
import { RestRequest } from '../http/rest-request.js';
import { Routes } from '../http/routes.js';
import type {
  KsefTokenRequest,
  KsefTokenResponse,
  TokenStatusResponse,
  QueryKsefTokensResponse,
  QueryKsefTokensOptions,
  TokenAuthorIdentifierType,
} from '../models/tokens/types.js';
import { decodeJwtPayload, parseKSeFTokenContext } from '../utils/jwt.js';
import { KSeFApiError } from '../errors/ksef-api-error.js';

export interface RevokeSelfOptions {
  /** Known reference number — skips discovery. */
  referenceNumber?: string;
  /** Access token used to infer the caller's context when discovery is needed. */
  accessToken?: string;
}

export interface RevokeSelfResult {
  referenceNumber: string;
  alreadyRevoked: boolean;
}

export class TokenService {
  private readonly restClient: RestClient;

  constructor(restClient: RestClient) {
    this.restClient = restClient;
  }

  async generateToken(request: KsefTokenRequest): Promise<KsefTokenResponse> {
    const req = RestRequest.post(Routes.Tokens.root)
      .body(request);
    const response = await this.restClient.execute<KsefTokenResponse>(req);
    return response.body;
  }

  async queryTokens(
    options?: QueryKsefTokensOptions,
  ): Promise<QueryKsefTokensResponse> {
    const req = RestRequest.get(Routes.Tokens.root);
    if (options?.continuationToken !== undefined) req.header('x-continuation-token', options.continuationToken);
    if (options?.pageSize !== undefined) req.query('pageSize', String(options.pageSize));
    if (options?.status) {
      for (const s of options.status) {
        req.query('status', s);
      }
    }
    if (options?.description !== undefined) req.query('description', options.description);
    if (options?.authorIdentifier !== undefined) req.query('authorIdentifier', options.authorIdentifier);
    if (options?.authorIdentifierType !== undefined) req.query('authorIdentifierType', options.authorIdentifierType);
    const response = await this.restClient.execute<QueryKsefTokensResponse>(req);
    return response.body;
  }

  async getToken(ref: string): Promise<TokenStatusResponse> {
    const req = RestRequest.get(Routes.Tokens.byReference(ref));
    const response = await this.restClient.execute<TokenStatusResponse>(req);
    return response.body;
  }

  async revokeToken(ref: string): Promise<void> {
    const req = RestRequest.delete(Routes.Tokens.byReference(ref));
    await this.restClient.executeVoid(req);
  }

  /**
   * Resolves the reference number of the token currently in use for authentication.
   * Tries JWT payload first (opportunistic — not part of the documented KSeF JWT shape),
   * then falls back to `GET /tokens` filtered by author and context. Requires exactly
   * one active match in the fallback; returns undefined when ambiguous.
   */
  async findSelfReferenceNumber(accessToken: string): Promise<string | undefined> {
    if (!accessToken) return undefined;

    const payload = decodeJwtPayload(accessToken);
    if (payload) {
      if (typeof payload['trn'] === 'string') return payload['trn'];
      if (typeof payload['jti'] === 'string') return payload['jti'];
    }

    const ctx = parseKSeFTokenContext(accessToken);
    const author = ctx?.authorSubjectIdentifier as { type?: string; value?: string } | undefined;
    if (!author?.type || !author.value) return undefined;
    if (!ctx?.contextIdentifierType || !ctx?.contextIdentifierValue) return undefined;

    const list = await this.queryTokens({
      status: ['Active'],
      authorIdentifier: author.value,
      authorIdentifierType: author.type as TokenAuthorIdentifierType,
      pageSize: 50,
    });
    const matches = list.tokens.filter(
      (t) =>
        t.status === 'Active' &&
        t.contextIdentifier?.value === ctx.contextIdentifierValue &&
        t.contextIdentifier?.type === ctx.contextIdentifierType,
    );
    return matches.length === 1 ? matches[0]!.referenceNumber : undefined;
  }

  /**
   * Revokes the token currently used for authentication.
   * Treats 404/409/410 on DELETE as "already revoked" and returns successfully with
   * `alreadyRevoked: true` so callers can still clear local state.
   */
  async revokeSelf(opts: RevokeSelfOptions = {}): Promise<RevokeSelfResult> {
    let ref = opts.referenceNumber;
    if (!ref && opts.accessToken) {
      ref = await this.findSelfReferenceNumber(opts.accessToken);
    }
    if (!ref) {
      throw new KSeFApiError(
        'Could not determine the current token reference number: no cache, JWT lacks the field, and the active-token list had 0 or 2+ matches in the current context.',
        400,
      );
    }
    try {
      await this.revokeToken(ref);
      return { referenceNumber: ref, alreadyRevoked: false };
    } catch (err) {
      if (
        err instanceof KSeFApiError &&
        (err.statusCode === 404 || err.statusCode === 409 || err.statusCode === 410)
      ) {
        return { referenceNumber: ref, alreadyRevoked: true };
      }
      throw err;
    }
  }
}
