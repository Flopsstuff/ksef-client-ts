import { KSeFClient } from '../client.js';
import type { KSeFClientOptions } from '../config/options.js';
import { loadConfig } from './config-store.js';
import { loadSession, isSessionExpired } from './session-store.js';
import { toEnvironmentName, type GlobalOptions, type SessionData } from './types.js';

export function createClient(globalOpts: GlobalOptions): KSeFClient {
  const config = loadConfig();
  const env = globalOpts.env ?? config.environment;
  const timeout = globalOpts.timeout ? parseInt(globalOpts.timeout, 10) : config.timeout;

  const options: KSeFClientOptions = {
    environment: toEnvironmentName(env as 'test' | 'demo' | 'prod'),
    timeout,
  };

  return new KSeFClient(options);
}

export function requireSession(globalOpts: GlobalOptions): { client: KSeFClient; session: SessionData } {
  const session = loadSession();
  if (!session) {
    throw new Error('No active session. Run `ksef auth login` first.');
  }
  if (isSessionExpired(session)) {
    throw new Error('Session expired. Run `ksef auth login` or `ksef auth refresh`.');
  }
  return { client: createClient(globalOpts), session };
}
