import { type KSeFClientOptions, type ResolvedOptions, resolveOptions } from './config/index.js';
import { RestClient, type RestClientConfig } from './http/rest-client.js';
import { defaultRetryPolicy, type RetryPolicy } from './http/retry-policy.js';
import { RateLimitPolicy } from './http/rate-limit-policy.js';
import { defaultPresignedUrlPolicy, type PresignedUrlPolicy } from './http/presigned-url-policy.js';
import { DefaultAuthManager, type AuthManager } from './http/auth-manager.js';
import { AuthService } from './services/auth.js';
import { ActiveSessionsService } from './services/active-sessions.js';
import { OnlineSessionService } from './services/online-session.js';
import { BatchSessionService } from './services/batch-session.js';
import { SessionStatusService } from './services/session-status.js';
import { InvoiceDownloadService } from './services/invoice-download.js';
import { PermissionsService } from './services/permissions.js';
import { TokenService } from './services/tokens.js';
import { CertificateApiService } from './services/certificates.js';
import { LighthouseService } from './services/lighthouse.js';
import { LimitsService } from './services/limits.js';
import { PeppolService } from './services/peppol.js';
import { TestDataService } from './services/test-data.js';
import { CertificateFetcher } from './crypto/certificate-fetcher.js';
import { CryptographyService } from './crypto/cryptography-service.js';
import { VerificationLinkService } from './qr/verification-link-service.js';

export class KSeFClient {
  readonly auth: AuthService;
  readonly activeSessions: ActiveSessionsService;
  readonly onlineSession: OnlineSessionService;
  readonly batchSession: BatchSessionService;
  readonly sessionStatus: SessionStatusService;
  readonly invoices: InvoiceDownloadService;
  readonly permissions: PermissionsService;
  readonly tokens: TokenService;
  readonly certificates: CertificateApiService;
  readonly lighthouse: LighthouseService;
  readonly limits: LimitsService;
  readonly peppol: PeppolService;
  readonly testData: TestDataService;
  readonly crypto: CryptographyService;
  readonly qr: VerificationLinkService;
  readonly options: ResolvedOptions;
  readonly authManager: AuthManager;

  constructor(options?: KSeFClientOptions) {
    this.options = resolveOptions(options);

    const authManager = options?.authManager ?? new DefaultAuthManager(async () => {
      const rt = this.authManager.getRefreshToken();
      if (!rt) return null;
      const res = await this.auth.refreshAccessToken(rt);
      return res.accessToken.token;
    });
    this.authManager = authManager;

    const restClientConfig = buildRestClientConfig(options, authManager);
    const restClient = new RestClient(this.options, restClientConfig);

    const fetcher = new CertificateFetcher(restClient);
    this.crypto = new CryptographyService(fetcher);
    this.auth = new AuthService(restClient);
    this.activeSessions = new ActiveSessionsService(restClient);
    this.onlineSession = new OnlineSessionService(restClient);
    this.batchSession = new BatchSessionService(restClient);
    this.sessionStatus = new SessionStatusService(restClient);
    this.invoices = new InvoiceDownloadService(restClient);
    this.permissions = new PermissionsService(restClient);
    this.tokens = new TokenService(restClient);
    this.certificates = new CertificateApiService(restClient);
    this.lighthouse = new LighthouseService(this.options);
    this.limits = new LimitsService(restClient);
    this.peppol = new PeppolService(restClient);
    this.testData = new TestDataService(restClient);
    this.qr = new VerificationLinkService(this.options.baseQrUrl);
  }

  async loginWithToken(token: string, nip: string): Promise<void> {
    const challenge = await this.auth.getChallenge();
    await this.crypto.init();
    const encryptedToken = this.crypto.encryptKsefToken(token, challenge.timestamp);

    const submitResult = await this.auth.submitKsefTokenAuthRequest({
      challenge: challenge.challenge,
      contextIdentifier: { type: 'Nip', value: nip },
      encryptedToken: Buffer.from(encryptedToken).toString('base64'),
    });

    const authToken = submitResult.authenticationToken.token;
    await this.awaitAuthReady(submitResult.referenceNumber, authToken);
    const tokens = await this.auth.getAccessToken(authToken);

    this.authManager.setAccessToken(tokens.accessToken.token);
    this.authManager.setRefreshToken(tokens.refreshToken.token);
  }

  async loginWithCertificate(certPem: string, keyPem: string, nip: string): Promise<void> {
    const challenge = await this.auth.getChallenge();
    const authRequestXml = buildAuthTokenRequestXml(challenge.challenge, nip);

    const { SignatureService } = await import('./crypto/signature-service.js');
    const signedXml = SignatureService.sign(authRequestXml, certPem, keyPem);

    const submitResult = await this.auth.submitXadesAuthRequest(signedXml);
    const authToken = submitResult.authenticationToken.token;
    await this.awaitAuthReady(submitResult.referenceNumber, authToken);
    const tokens = await this.auth.getAccessToken(authToken);

    this.authManager.setAccessToken(tokens.accessToken.token);
    this.authManager.setRefreshToken(tokens.refreshToken.token);
  }

  private async awaitAuthReady(referenceNumber: string, authToken: string): Promise<void> {
    for (let i = 0; i < 30; i++) {
      const status = await this.auth.getAuthStatus(referenceNumber, authToken);
      if (status.status.code === 200) return;
      if (status.status.code !== 100) {
        throw new Error(`Authentication failed with status ${status.status.code}: ${status.status.description}`);
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  async logout(): Promise<void> {
    this.authManager.setAccessToken(undefined);
    this.authManager.setRefreshToken(undefined);
  }
}

const AUTH_TOKEN_REQUEST_NS = 'http://ksef.mf.gov.pl/auth/token/2.0';

function buildAuthTokenRequestXml(
  challenge: string,
  nip: string,
  subjectIdentifierType = 'certificateSubject',
): string {
  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    `<AuthTokenRequest xmlns="${AUTH_TOKEN_REQUEST_NS}">`,
    `<Challenge>${xmlEscape(challenge)}</Challenge>`,
    `<ContextIdentifier>`,
    `<Nip>${xmlEscape(nip)}</Nip>`,
    `</ContextIdentifier>`,
    `<SubjectIdentifierType>${xmlEscape(subjectIdentifierType)}</SubjectIdentifierType>`,
    `</AuthTokenRequest>`,
  ].join('');
}

function xmlEscape(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function buildRestClientConfig(options: KSeFClientOptions | undefined, authManager: AuthManager): RestClientConfig {
  const config: RestClientConfig = { authManager };

  if (options?.transport) {
    config.transport = options.transport;
  }

  // Retry policy: merge user overrides with defaults
  if (options?.retry) {
    config.retryPolicy = { ...defaultRetryPolicy(), ...options.retry } as RetryPolicy;
  }

  // Rate limit policy: null disables, partial config creates with defaults
  if (options?.rateLimit === null) {
    config.rateLimitPolicy = null;
  } else if (options?.rateLimit) {
    config.rateLimitPolicy = new RateLimitPolicy({
      globalRps: options.rateLimit.globalRps ?? 10,
      endpointLimits: options.rateLimit.endpointLimits,
    });
  }

  // Presigned URL policy: merge additional hosts with defaults
  if (options?.presignedUrlHosts) {
    const base = defaultPresignedUrlPolicy();
    config.presignedUrlPolicy = {
      ...base,
      allowedHosts: [...base.allowedHosts, ...options.presignedUrlHosts],
    } as PresignedUrlPolicy;
  }

  return config;
}
