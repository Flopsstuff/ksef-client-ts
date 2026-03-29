import * as fs from 'node:fs';
import { defineCommand } from 'citty';
import { consola } from 'consola';
import { createClient, requireSession } from '../client-factory.js';
import { saveSession, clearSession, loadSession } from '../session-store.js';
import { loadConfig, saveConfig } from '../config-store.js';
import { loadCredentials } from '../credentials-store.js';
import { savePendingChallenge, clearPendingChallenge } from '../pending-challenge-store.js';
import { outputResult, outputKeyValue, outputSuccess } from '../output.js';
import { withErrorHandler } from '../error-handler.js';
import type { GlobalOptions, SessionData } from '../types.js';
import { pollUntil } from '../../workflows/polling.js';
import { parseKSeFTokenContext } from '../../utils/jwt.js';

export async function readStdin(stream: AsyncIterable<Buffer> = process.stdin): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf-8');
}

function getGlobalOpts(args: Record<string, unknown>): GlobalOptions {
  return {
    env: args.env as string | undefined,
    json: args.json as boolean | undefined,
    verbose: args.verbose as boolean | undefined,
    timeout: args.timeout as string | undefined,
    nip: args.nip as string | undefined,
  };
}

const challenge = defineCommand({
  meta: { name: 'challenge', description: 'Request an authorization challenge from KSeF' },
  args: {
    env: { type: 'string', description: 'Environment (test/demo/prod)' },
    json: { type: 'boolean', description: 'Output as JSON' },
    verbose: { type: 'boolean', description: 'Show HTTP request/response details' },
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
    p12: { type: 'string', description: 'Path to PKCS#12 (.p12/.pfx) certificate file' },
    'p12-password': { type: 'string', description: 'Password for the PKCS#12 file (default: empty)' },
    'key-password': { type: 'string', description: 'Password for encrypted PEM private key' },
    env: { type: 'string', description: 'Environment (test/demo/prod)' },
    json: { type: 'boolean', description: 'Output as JSON' },
    verbose: { type: 'boolean', description: 'Show HTTP request/response details' },
    timeout: { type: 'string', description: 'Request timeout (ms)' },
    nip: { type: 'string', description: 'NIP number' },
  },
  run({ args }) {
    return withErrorHandler(async () => {
      const globalOpts = getGlobalOpts(args);
      const config = loadConfig();

      if (!args.env) {
        consola.info(`Using default environment: ${config.environment}`);
      }

      const client = createClient(globalOpts);
      const nip = args.nip ?? config.nip;

      if (!nip) {
        throw new Error('NIP is required. Provide --nip or set it via `ksef config set --nip <nip>`.');
      }

      const token = args.token ?? loadCredentials()?.token;
      if (token) {
        await client.loginWithToken(token, nip);
      } else if (args.p12) {
        const fs = await import('node:fs');
        const p12Buffer = fs.readFileSync(args.p12);
        await client.loginWithPkcs12(p12Buffer, (args['p12-password'] as string) ?? '', nip);
      } else if (args.cert && args.key) {
        const fs = await import('node:fs');
        const certPem = fs.readFileSync(args.cert, 'utf-8');
        const keyPem = fs.readFileSync(args.key, 'utf-8');
        await client.loginWithCertificate(certPem, keyPem, nip, args['key-password'] as string | undefined);
      } else {
        throw new Error('Provide --token, --p12, or both --cert and --key for authentication.');
      }

      const session: SessionData = {
        accessToken: client.authManager.getAccessToken()!,
        refreshToken: client.authManager.getRefreshToken(),
        expiresAt: undefined, // TODO: track from token response if needed
        environment: (args.env ?? config.environment) as SessionData['environment'],
      };
      saveSession(session);
      if (args.env && args.env !== config.environment) {
        saveConfig({ ...config, environment: session.environment });
      }
      outputSuccess('Logged in successfully.');
    });
  },
});

const status = defineCommand({
  meta: { name: 'status', description: 'Check auth status by reference number' },
  args: {
    ref: { type: 'positional', description: 'Reference number', required: true },
    env: { type: 'string', description: 'Environment (test/demo/prod)' },
    json: { type: 'boolean', description: 'Output as JSON' },
    verbose: { type: 'boolean', description: 'Show HTTP request/response details' },
    timeout: { type: 'string', description: 'Request timeout (ms)' },
  },
  run({ args }) {
    return withErrorHandler(async () => {
      const globalOpts = getGlobalOpts(args);
      const { client, session } = await requireSession(globalOpts);
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
    verbose: { type: 'boolean', description: 'Show HTTP request/response details' },
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
    verbose: { type: 'boolean', description: 'Show HTTP request/response details' },
  },
  run({ args }) {
    return withErrorHandler(async () => {
      const globalOpts = getGlobalOpts(args);
      const { session } = await requireSession(globalOpts);

      const context = parseKSeFTokenContext(session.accessToken);
      const info: Record<string, unknown> = {
        environment: session.environment,
        ...(context?.contextIdentifierValue && { nip: context.contextIdentifierValue }),
        ...(context?.authMethod && { authMethod: context.authMethod }),
        ...(context?.permissions && { permissions: context.permissions.join(', ') }),
        ...(context?.type && { tokenType: context.type }),
        sessionRef: session.sessionRef ?? 'N/A',
        expiresAt: session.expiresAt ?? 'N/A',
        status: 'ACTIVE',
        accessToken: session.accessToken.slice(0, 12) + '...',
      };

      if (args.json && context) {
        info.context = context;
      }

      outputKeyValue(info, { json: args.json });
    });
  },
});

const loginExternal = defineCommand({
  meta: { name: 'login-external', description: 'Authenticate with externally-signed XAdES XML' },
  args: {
    generate: { type: 'boolean', description: 'Generate unsigned auth request XML' },
    submit: { type: 'boolean', description: 'Submit externally-signed XML' },
    nip: { type: 'string', description: 'NIP number (or identifier value for non-Nip context types)' },
    'context-type': { type: 'string', description: 'Context identifier type: Nip, InternalId, NipVatUe, PeppolId (default: Nip)' },
    output: { type: 'string', description: 'Write unsigned XML to file instead of stdout (--generate)' },
    input: { type: 'string', description: 'Read signed XML from file instead of stdin (--submit)' },
    env: { type: 'string', description: 'Environment (test/demo/prod)' },
    json: { type: 'boolean', description: 'Output as JSON' },
    verbose: { type: 'boolean', description: 'Show HTTP request/response details' },
    timeout: { type: 'string', description: 'Request timeout (ms)' },
  },
  run({ args }) {
    return withErrorHandler(async () => {
      const globalOpts = getGlobalOpts(args);
      const config = loadConfig();
      const nip = args.nip ?? config.nip;

      if (!nip) {
        throw new Error('NIP/identifier is required. Provide --nip or set it via `ksef config set --nip <nip>`.');
      }

      const contextType = (args['context-type'] as string) ?? 'Nip';
      const validTypes = ['Nip', 'InternalId', 'NipVatUe', 'PeppolId'];
      if (!validTypes.includes(contextType)) {
        throw new Error(`Invalid --context-type "${contextType}". Must be one of: ${validTypes.join(', ')}`);
      }

      if (!args.generate && !args.submit) {
        throw new Error('Specify --generate to create unsigned XML, or --submit to send signed XML.');
      }

      const client = createClient(globalOpts);

      if (args.generate) {
        const { buildUnsignedAuthTokenRequestXml } = await import('../../crypto/auth-xml-builder.js');
        const challengeResult = await client.auth.getChallenge();
        const unsignedXml = buildUnsignedAuthTokenRequestXml({
          challenge: challengeResult.challenge,
          contextIdentifier: { type: contextType as any, value: nip },
        });

        if (args.output) {
          fs.writeFileSync(args.output, unsignedXml, 'utf-8');
          process.stderr.write(`Unsigned XML written to ${args.output}\n`);
        } else {
          process.stdout.write(unsignedXml);
        }

        savePendingChallenge({
          challenge: challengeResult.challenge,
          timestamp: challengeResult.timestamp,
          contextIdentifier: { type: contextType, value: nip },
          createdAt: new Date().toISOString(),
        });

        process.stderr.write(`Challenge: ${challengeResult.challenge}\n`);
        process.stderr.write(`Timestamp: ${challengeResult.timestamp}\n`);
        process.stderr.write(`Note: Sign this XML and submit with --submit before the challenge expires.\n`);
      }

      if (args.submit) {
        let signedXml: string;

        if (args.input) {
          signedXml = fs.readFileSync(args.input, 'utf-8');
        } else {
          signedXml = await readStdin();
        }

        if (!signedXml.trim()) {
          throw new Error('No signed XML provided. Pipe signed XML to stdin or use --input <file>.');
        }

        const submitResult = await client.auth.submitXadesAuthRequest(signedXml);
        const authToken = submitResult.authenticationToken.token;

        await pollUntil(
          () => client.auth.getAuthStatus(submitResult.referenceNumber, authToken),
          (s) => s.status.code !== 100,
          { intervalMs: 1000, maxAttempts: 30, description: `auth ${submitResult.referenceNumber}` },
        );

        const tokens = await client.auth.getAccessToken(authToken);

        const session: SessionData = {
          accessToken: tokens.accessToken.token,
          refreshToken: tokens.refreshToken.token,
          expiresAt: tokens.accessToken.validUntil,
          environment: (args.env ?? config.environment) as SessionData['environment'],
        };
        saveSession(session);
        if (args.env && args.env !== config.environment) {
          saveConfig({ ...config, environment: session.environment });
        }
        clearPendingChallenge();
        outputSuccess('Logged in successfully via external signature.');
      }
    });
  },
});

export const authCommand = defineCommand({
  meta: { name: 'auth', description: 'Authentication commands' },
  subCommands: { challenge, login, 'login-external': loginExternal, status, logout, refresh, whoami },
});
