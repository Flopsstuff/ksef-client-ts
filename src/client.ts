import { type KSeFClientOptions, type ResolvedOptions, resolveOptions } from './config/index.js';
import { RestClient } from './http/rest-client.js';
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
  readonly options: ResolvedOptions;

  constructor(options?: KSeFClientOptions) {
    this.options = resolveOptions(options);
    const restClient = new RestClient(this.options);
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
  }
}
