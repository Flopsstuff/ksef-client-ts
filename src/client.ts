import { type KSeFClientOptions, type ResolvedOptions, resolveOptions } from './config/index.js';
import { RestClient } from './http/rest-client.js';
import { AuthService } from './services/auth.js';
import { ActiveSessionsService } from './services/active-sessions.js';
import { OnlineSessionService } from './services/online-session.js';
import { BatchSessionService } from './services/batch-session.js';
import { SessionStatusService } from './services/session-status.js';

export class KSeFClient {
  readonly auth: AuthService;
  readonly activeSessions: ActiveSessionsService;
  readonly onlineSession: OnlineSessionService;
  readonly batchSession: BatchSessionService;
  readonly sessionStatus: SessionStatusService;
  readonly options: ResolvedOptions;

  constructor(options?: KSeFClientOptions) {
    this.options = resolveOptions(options);
    const restClient = new RestClient(this.options);
    this.auth = new AuthService(restClient);
    this.activeSessions = new ActiveSessionsService(restClient);
    this.onlineSession = new OnlineSessionService(restClient);
    this.batchSession = new BatchSessionService(restClient);
    this.sessionStatus = new SessionStatusService(restClient);
  }
}
