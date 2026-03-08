import * as fs from 'node:fs';
import { defineCommand } from 'citty';
import { createClient, requireSession } from '../client-factory.js';
import { saveSession, clearSession, loadSession, isSessionExpired } from '../session-store.js';
import { loadConfig } from '../config-store.js';
import { outputResult, outputKeyValue, outputSuccess, outputWarning } from '../output.js';
import { withErrorHandler } from '../error-handler.js';
import type { GlobalOptions, SessionData } from '../types.js';

function getGlobalOpts(args: Record<string, unknown>): GlobalOptions {
  return {
    env: args.env as string | undefined,
    json: args.json as boolean | undefined,
    timeout: args.timeout as string | undefined,
    nip: args.nip as string | undefined,
  };
}

const challenge = defineCommand({
  meta: { name: 'challenge', description: 'Request an authorization challenge from KSeF' },
  args: {
    env: { type: 'string', description: 'Environment (test/demo/prod)' },
    json: { type: 'boolean', description: 'Output as JSON' },
    timeout: { type: 'string', description: 'Request timeout (ms)' },
  },
  run({ args }) {
    return withErrorHandler(async () => {
      const globalOpts = getGlobalOpts(args);
      const client = createClient(globalOpts);
      const result = await client.auth.getChallenge();
      outputResult(result, { json: args.json });
    });
  },
});

const login = defineCommand({
  meta: { name: 'login', description: 'Authenticate with KSeF (token or certificate)' },
  args: {
    token: { type: 'string', description: 'KSeF authorization token' },
    cert: { type: 'string', description: 'Path to PEM certificate file (XAdES auth)' },
    key: { type: 'string', description: 'Path to PEM private key file (XAdES auth)' },
    env: { type: 'string', description: 'Environment (test/demo/prod)' },
    json: { type: 'boolean', description: 'Output as JSON' },
    timeout: { type: 'string', description: 'Request timeout (ms)' },
    nip: { type: 'string', description: 'NIP number' },
  },
  run({ args }) {
    return withErrorHandler(async () => {
      const globalOpts = getGlobalOpts(args);
      const client = createClient(globalOpts);
      const config = loadConfig();
      const nip = args.nip ?? config.nip;

      if (!nip) {
        throw new Error('NIP is required. Provide --nip or set it via `ksef config set --nip <nip>`.');
      }

      if (args.token) {
        // Token auth flow: challenge -> encrypt -> submit -> get access token
        const challengeResult = await client.auth.getChallenge();
        await client.crypto.init();

        const encryptedToken = client.crypto.encryptKsefToken(
          args.token,
          challengeResult.timestamp,
        );

        const submitResult = await client.auth.submitKsefTokenAuthRequest({
          challenge: challengeResult.challenge,
          contextIdentifier: { type: 'Nip', value: nip },
          encryptedToken: Buffer.from(encryptedToken).toString('base64'),
        });

        const authToken = submitResult.authenticationToken.token;
        const accessResult = await client.auth.getAccessToken(authToken);

        const session: SessionData = {
          accessToken: accessResult.accessToken.token,
          refreshToken: accessResult.refreshToken?.token,
          sessionRef: submitResult.referenceNumber,
          expiresAt: accessResult.accessToken.validUntil,
          environment: (args.env ?? config.environment) as SessionData['environment'],
        };
        saveSession(session);
        outputSuccess(`Logged in successfully. Session ref: ${session.sessionRef ?? 'N/A'}`);
      } else if (args.cert && args.key) {
        // XAdES cert auth flow
        const certPem = fs.readFileSync(args.cert, 'utf-8');
        const keyPem = fs.readFileSync(args.key, 'utf-8');

        const challengeResult = await client.auth.getChallenge();

        const { SignatureService } = await import('../../crypto/signature-service.js');
        const signedXml = SignatureService.sign(
          challengeResult.challenge,
          certPem,
          keyPem,
        );

        const submitResult = await client.auth.submitXadesAuthRequest(signedXml);
        const authToken = submitResult.authenticationToken.token;
        const accessResult = await client.auth.getAccessToken(authToken);

        const session: SessionData = {
          accessToken: accessResult.accessToken.token,
          refreshToken: accessResult.refreshToken?.token,
          sessionRef: submitResult.referenceNumber,
          expiresAt: accessResult.accessToken.validUntil,
          environment: (args.env ?? config.environment) as SessionData['environment'],
        };
        saveSession(session);
        outputSuccess(`Logged in successfully. Session ref: ${session.sessionRef ?? 'N/A'}`);
      } else {
        throw new Error('Provide --token or both --cert and --key for authentication.');
      }
    });
  },
});

const status = defineCommand({
  meta: { name: 'status', description: 'Check auth status by reference number' },
  args: {
    ref: { type: 'positional', description: 'Reference number', required: true },
    env: { type: 'string', description: 'Environment (test/demo/prod)' },
    json: { type: 'boolean', description: 'Output as JSON' },
    timeout: { type: 'string', description: 'Request timeout (ms)' },
  },
  run({ args }) {
    return withErrorHandler(async () => {
      const globalOpts = getGlobalOpts(args);
      const { client, session } = requireSession(globalOpts);
      const result = await client.auth.getAuthStatus(args.ref, session.accessToken);
      outputResult(result, { json: args.json });
    });
  },
});

const logout = defineCommand({
  meta: { name: 'logout', description: 'Clear the current session' },
  run() {
    return withErrorHandler(async () => {
      clearSession();
      outputSuccess('Logged out. Session cleared.');
    });
  },
});

const refresh = defineCommand({
  meta: { name: 'refresh', description: 'Refresh the access token' },
  args: {
    env: { type: 'string', description: 'Environment (test/demo/prod)' },
    json: { type: 'boolean', description: 'Output as JSON' },
    timeout: { type: 'string', description: 'Request timeout (ms)' },
  },
  run({ args }) {
    return withErrorHandler(async () => {
      const globalOpts = getGlobalOpts(args);
      const session = loadSession();
      if (!session) {
        throw new Error('No active session. Run `ksef auth login` first.');
      }
      if (!session.refreshToken) {
        throw new Error('No refresh token available. Re-authenticate with `ksef auth login`.');
      }

      const client = createClient(globalOpts);
      const result = await client.auth.refreshAccessToken(session.refreshToken);
      session.accessToken = result.accessToken.token;
      session.expiresAt = result.accessToken.validUntil;
      saveSession(session);
      outputSuccess('Token refreshed successfully.');
    });
  },
});

const whoami = defineCommand({
  meta: { name: 'whoami', description: 'Show current session info' },
  args: {
    json: { type: 'boolean', description: 'Output as JSON' },
  },
  run({ args }) {
    return withErrorHandler(async () => {
      const session = loadSession();
      if (!session) {
        outputWarning('No active session.');
        return;
      }

      const expired = isSessionExpired(session);
      const info: Record<string, unknown> = {
        environment: session.environment,
        sessionRef: session.sessionRef ?? 'N/A',
        expiresAt: session.expiresAt ?? 'N/A',
        status: expired ? 'EXPIRED' : 'ACTIVE',
        accessToken: session.accessToken.slice(0, 12) + '...',
      };

      outputKeyValue(info, { json: args.json });
    });
  },
});

export const authCommand = defineCommand({
  meta: { name: 'auth', description: 'Authentication commands' },
  subCommands: { challenge, login, status, logout, refresh, whoami },
});
