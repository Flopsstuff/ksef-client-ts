import { consola } from 'consola';
import { KSeFClient } from '../client.js';
import type { KSeFClientOptions } from '../config/options.js';
import { loadConfig } from './config-store.js';
import { loadSession, isSessionExpired } from './session-store.js';
import { recoverSession } from './session-recovery.js';
import { toEnvironmentName, type GlobalOptions, type SessionData } from './types.js';

export function createClient(globalOpts: GlobalOptions): KSeFClient {
  if (globalOpts.verbose) {
    consola.level = 4;
  }
  const config = loadConfig();
  const env = globalOpts.env ?? config.environment;
  const timeout = globalOpts.timeout ? parseInt(globalOpts.timeout, 10) : config.timeout;

  const options: KSeFClientOptions = {
    environment: toEnvironmentName(env as 'test' | 'demo' | 'prod'),
    timeout,
  };

  return new KSeFClient(options);
}

export async function requireSession(globalOpts: GlobalOptions): Promise<{ client: KSeFClient; session: SessionData }> {
  if (globalOpts.verbose) {
    consola.level = 4;
  }

  // Fast path: valid session on disk
  const session = loadSession();
  if (session && !isSessionExpired(session)) {
    const opts = globalOpts.env ? globalOpts : { ...globalOpts, env: session.environment };
    const client = createClient(opts);
    client.authManager.setAccessToken(session.accessToken);
    if (session.refreshToken) {
      client.authManager.setRefreshToken(session.refreshToken);
    }
    return { client, session };
  }

  // Slow path: attempt recovery (refresh or re-login from credentials)
  return recoverSession(globalOpts);
}

export async function requireOnlineSession(globalOpts: GlobalOptions): Promise<{ client: KSeFClient; session: SessionData; onlineSessionRef: string }> {
  const { client, session } = await requireSession(globalOpts);
  if (!session.onlineSessionRef) {
    throw new Error('No active online session. Run `ksef session open` first.');
  }
  return { client, session, onlineSessionRef: session.onlineSessionRef };
}
