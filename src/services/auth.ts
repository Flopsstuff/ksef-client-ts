import { RestClient } from '../http/rest-client.js';
import { KSEF_FEATURE_HEADER, ENFORCE_XADES_COMPLIANCE } from '../http/ksef-feature.js';
import { RestRequest } from '../http/rest-request.js';
import { Routes } from '../http/routes.js';
import type { AuthChallengeResponse, AuthenticationInitResponse, AuthKsefTokenRequest, AuthenticationOperationStatusResponse, AuthenticationTokensResponse, AuthenticationTokenRefreshResponse } from '../models/auth/types.js';

export class AuthService {
  private readonly restClient: RestClient;

  constructor(restClient: RestClient) {
    this.restClient = restClient;
  }

  async getChallenge(): Promise<AuthChallengeResponse> {
    const request = RestRequest.post(Routes.Authorization.challenge);
    const response = await this.restClient.execute<AuthChallengeResponse>(request);
    return response.body;
  }

  async submitXadesAuthRequest(
    signedXml: string,
    verifyCertificateChain = false,
    enforceXadesCompliance = false,
  ): Promise<AuthenticationInitResponse> {
    const request = RestRequest.post(Routes.Authorization.xadesSignature)
      .body(signedXml)
      .header('Content-Type', 'application/xml')
      .query('verifyCertificateChain', String(verifyCertificateChain));
    if (enforceXadesCompliance) {
      request.header(KSEF_FEATURE_HEADER, ENFORCE_XADES_COMPLIANCE);
    }
    const response = await this.restClient.execute<AuthenticationInitResponse>(request);
    return response.body;
  }

  async submitKsefTokenAuthRequest(payload: AuthKsefTokenRequest): Promise<AuthenticationInitResponse> {
    const request = RestRequest.post(Routes.Authorization.ksefToken).body(payload);
    const response = await this.restClient.execute<AuthenticationInitResponse>(request);
    return response.body;
  }

  async getAuthStatus(referenceNumber: string, authToken: string): Promise<AuthenticationOperationStatusResponse> {
    const request = RestRequest.get(Routes.Authorization.status(referenceNumber))
      .accessToken(authToken);
    const response = await this.restClient.execute<AuthenticationOperationStatusResponse>(request);
    return response.body;
  }

  async getAccessToken(authToken: string): Promise<AuthenticationTokensResponse> {
    const request = RestRequest.post(Routes.Authorization.Token.redeem)
      .accessToken(authToken);
    const response = await this.restClient.execute<AuthenticationTokensResponse>(request);
    return response.body;
  }

  async refreshAccessToken(refreshToken: string): Promise<AuthenticationTokenRefreshResponse> {
    const request = RestRequest.post(Routes.Authorization.Token.refresh)
      .accessToken(refreshToken)
      .skipAuthRetry();
    const response = await this.restClient.execute<AuthenticationTokenRefreshResponse>(request);
    return response.body;
  }
}
