import { RestClient } from '../http/rest-client.js';
import { RestRequest } from '../http/rest-request.js';
import { Routes } from '../http/routes.js';
import type { AuthChallengeResponse, SignatureResponse, AuthKsefTokenRequest, AuthStatus, AuthOperationStatusResponse, RefreshTokenResponse } from '../models/auth/types.js';

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
  ): Promise<SignatureResponse> {
    const request = RestRequest.post(Routes.Authorization.xadesSignature)
      .body(signedXml)
      .header('Content-Type', 'application/xml');
    if (verifyCertificateChain) {
      request.header('X-KSeF-CertificateChainVerification', 'true');
    }
    if (enforceXadesCompliance) {
      request.header('X-KSeF-Feature', 'enforce-xades-compliance');
    }
    const response = await this.restClient.execute<SignatureResponse>(request);
    return response.body;
  }

  async submitKsefTokenAuthRequest(payload: AuthKsefTokenRequest): Promise<SignatureResponse> {
    const request = RestRequest.post(Routes.Authorization.ksefToken).body(payload);
    const response = await this.restClient.execute<SignatureResponse>(request);
    return response.body;
  }

  async getAuthStatus(referenceNumber: string, authToken: string): Promise<AuthStatus> {
    const request = RestRequest.get(Routes.Authorization.status(referenceNumber))
      .accessToken(authToken);
    const response = await this.restClient.execute<AuthStatus>(request);
    return response.body;
  }

  async getAccessToken(authToken: string): Promise<AuthOperationStatusResponse> {
    const request = RestRequest.post(Routes.Authorization.Token.redeem)
      .accessToken(authToken);
    const response = await this.restClient.execute<AuthOperationStatusResponse>(request);
    return response.body;
  }

  async refreshAccessToken(refreshToken: string): Promise<RefreshTokenResponse> {
    const request = RestRequest.post(Routes.Authorization.Token.refresh)
      .accessToken(refreshToken);
    const response = await this.restClient.execute<RefreshTokenResponse>(request);
    return response.body;
  }
}
