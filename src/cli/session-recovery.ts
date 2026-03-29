import { consola } from 'consola';
import type { KSeFClient } from '../client.js';
import { loadSession, saveSession, isSessionExpired } from './session-store.js';
import { loadCredentials } from './credentials-store.js';
import { loadConfig } from './config-store.js';
import { createClient } from './client-factory.js';
import { authenticateWithToken } from '../workflows/auth-workflow.js';
import type { GlobalOptions, SessionData } from './types.js';

export async function recoverSession(globalOpts: GlobalOptions): Promise<{ client: KSeFClient; session: SessionData }> {
  const session = loadSession();

  // Try refresh if session exists but expired and has a refresh token
  if (session && isSessionExpired(session) && session.refreshToken) {
    try {
      consola.info('Session expired, refreshing token...');
      const opts = globalOpts.env ? globalOpts : { ...globalOpts, env: session.environment };
      const client = createClient(opts);
      client.authManager.setAccessToken(session.accessToken);
      const result = await client.auth.refreshAccessToken(session.refreshToken);
      session.accessToken = result.accessToken.token;
      session.expiresAt = result.accessToken.validUntil;
      saveSession(session);
      client.authManager.setAccessToken(session.accessToken);
      if (session.refreshToken) {
        client.authManager.setRefreshToken(session.refreshToken);
      }
      return { client, session };
    } catch {
      // Refresh failed, fall through to full login
    }
  }

  // Try full login from stored credentials
  const credentials = loadCredentials();
  const config = loadConfig();
  if (credentials?.token && config.nip) {
    consola.info('Logging in with stored credentials...');
    const env = globalOpts.env ?? session?.environment ?? config.environment;
    const opts = { ...globalOpts, env };
    const client = createClient(opts);
    try {
      const authResult = await authenticateWithToken(client, {
        token: credentials.token,
        nip: config.nip,
      });
      const newSession: SessionData = {
        accessToken: authResult.accessToken,
        refreshToken: authResult.refreshToken,
        expiresAt: authResult.accessTokenValidUntil,
        environment: env as SessionData['environment'],
      };
      saveSession(newSession);
      return { client, session: newSession };
    } catch (err) {
      throw new Error(
        `Auto-login failed: ${err instanceof Error ? err.message : String(err)}. Run 'ksef auth login' to authenticate manually.`,
      );
    }
  }

  // Nothing available
  if (!credentials?.token) {
    throw new Error('No active session and no stored credentials. Run `ksef setup` to configure authentication.');
  }
  throw new Error('No active session and no NIP configured. Run `ksef config set nip <your-nip>` or `ksef setup`.');
}
