import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { defineCommand } from 'citty';
import { consola } from 'consola';
import { createClient } from '../client-factory.js';
import { saveSession, loadSession } from '../session-store.js';
import { loadConfig, saveConfig } from '../config-store.js';
import { loadCredentials, saveCredentials } from '../credentials-store.js';
import { savePendingChallenge, clearPendingChallenge } from '../pending-challenge-store.js';
import { withErrorHandler } from '../error-handler.js';
import { outputSuccess } from '../output.js';
import type { CliConfig, SessionData } from '../types.js';
import { isValidNip } from '../../validation/patterns.js';
import { buildUnsignedAuthTokenRequestXml } from '../../crypto/auth-xml-builder.js';
import { pollUntil } from '../../workflows/polling.js';
import { openFolder } from '../utils/open-folder.js';
import { CertificateService } from '../../crypto/certificate-service.js';
import type { KsefTokenPermissionType, KsefTokenRequest } from '../../models/tokens/types.js';

const KSEF_DIR = path.join(os.homedir(), '.ksef');
const AUTH_XML_FILE = path.join(KSEF_DIR, 'auth.xml');

const SIGNING_URL = 'https://podpis.gov.pl/podpisz-dokument-elektronicznie/';

const ALL_PERMISSIONS: { value: KsefTokenPermissionType; label: string }[] = [
  { value: 'InvoiceRead', label: 'InvoiceRead — Read invoices' },
  { value: 'InvoiceWrite', label: 'InvoiceWrite — Send invoices' },
  { value: 'CredentialsRead', label: 'CredentialsRead — View permissions' },
  { value: 'CredentialsManage', label: 'CredentialsManage — Manage permissions' },
  { value: 'EnforcementOperations', label: 'EnforcementOperations — Enforcement actions' },
  { value: 'SubunitManage', label: 'SubunitManage — Manage subunits' },
  { value: 'Introspection', label: 'Introspection — Self-invoicing introspection' },
];

function expandTilde(p: string): string {
  if (p.startsWith('~')) {
    return path.join(os.homedir(), p.slice(1));
  }
  return p;
}

async function promptNip(): Promise<string> {
  while (true) {
    const nip = await consola.prompt('Enter your NIP (10 digits):', {
      type: 'text',
      cancel: 'reject',
    }) as string;

    if (isValidNip(nip.trim())) {
      return nip.trim();
    }
    consola.warn('Invalid NIP. Must be a valid 10-digit Polish tax identification number.');
  }
}

async function promptSignedXmlPath(): Promise<string> {
  while (true) {
    const raw = await consola.prompt('Path to signed XML file:', {
      type: 'text',
      cancel: 'reject',
    }) as string;

    const resolved = expandTilde(raw.trim());
    if (fs.existsSync(resolved)) {
      return resolved;
    }
    consola.warn(`File not found: ${resolved}`);
  }
}

export const setupCommand = defineCommand({
  meta: { name: 'setup', description: 'Interactive setup wizard for KSeF CLI' },
  args: {
    env: { type: 'string', description: 'Environment (test/demo/prod)' },
  },
  run({ args }) {
    return withErrorHandler(async () => {
      if (!process.stdin.isTTY) {
        throw new Error(
          'Interactive terminal required. Use `ksef auth login-external` and `ksef token generate` for non-interactive setup.',
        );
      }

      // Welcome
      consola.box('KSeF CLI Setup Wizard');

      // Check existing session/credentials
      const existingSession = loadSession();
      const existingCredentials = loadCredentials();
      if (existingSession || existingCredentials?.token) {
        const overwrite = await consola.prompt('An existing session or token was found. Overwrite?', {
          type: 'confirm',
          initial: false,
          cancel: 'reject',
        });
        if (!overwrite) {
          consola.info('Setup cancelled.');
          return;
        }
      }

      // ── Phase 1: Configuration ──

      const config = loadConfig();
      const env = (args.env ?? config.environment) as CliConfig['environment'];
      const nip = await promptNip();

      // Save config immediately
      saveConfig({ ...config, nip, environment: env });
      consola.info(`Config saved: NIP=${nip}, env=${env}`);

      // ── Phase 1: Authentication ──

      const client = createClient({ env });

      // For test environment, offer quick self-signed certificate auth
      let useSelfSigned = false;
      if (env === 'test') {
        useSelfSigned = await consola.prompt('Test environment detected. Use self-signed certificate for quick auth?', {
          type: 'confirm',
          initial: true,
          cancel: 'reject',
        });
      }

      if (useSelfSigned) {
        // Quick path: self-signed cert (test env only)
        consola.info('Generating self-signed certificate...');
        const cert = await CertificateService.generateCompanySeal(
          'CLI Setup', `VATPL-${nip}`, `CLI Setup ${nip}`, 'RSA',
        );
        consola.info('Authenticating with self-signed certificate...');
        await client.loginWithCertificate(cert.certificatePem, cert.privateKeyPem, nip);

        const session: SessionData = {
          accessToken: client.authManager.getAccessToken()!,
          refreshToken: client.authManager.getRefreshToken(),
          environment: env,
        };
        saveSession(session);
        outputSuccess('Authenticated successfully via self-signed certificate.');
      } else {
        // External signature auth (all environments)
        let authenticated = false;
        while (!authenticated) {
          consola.info('Requesting authorization challenge from KSeF...');
          const challengeResult = await client.auth.getChallenge();

          const unsignedXml = buildUnsignedAuthTokenRequestXml({
            challenge: challengeResult.challenge,
            contextIdentifier: { type: 'Nip', value: nip },
          });

          // Save unsigned XML
          fs.mkdirSync(KSEF_DIR, { recursive: true });
          fs.writeFileSync(AUTH_XML_FILE, unsignedXml, 'utf-8');
          consola.info(`Unsigned XML saved to ${AUTH_XML_FILE}`);

          // Save pending challenge
          savePendingChallenge({
            challenge: challengeResult.challenge,
            timestamp: challengeResult.timestamp,
            contextIdentifier: { type: 'Nip', value: nip },
            createdAt: new Date().toISOString(),
          });

          // Open folder
          const opened = await openFolder(KSEF_DIR);
          if (!opened) {
            consola.info(`Open the folder manually: ${KSEF_DIR}`);
          }

          // Signing instructions
          consola.box([
            'Sign the XML file using a qualified signature:',
            '',
            `  1. Open: ${SIGNING_URL}`,
            `  2. Upload: ${AUTH_XML_FILE}`,
            '  3. Sign with your qualified signature',
            '  4. Download the signed XML file',
          ].join('\n'));

          const signedXmlPath = await promptSignedXmlPath();
          const signedXml = fs.readFileSync(signedXmlPath, 'utf-8');

          try {
            consola.info('Submitting signed XML to KSeF...');
            const submitResult = await client.auth.submitXadesAuthRequest(signedXml);
            const authToken = submitResult.authenticationToken.token;

            consola.info('Waiting for authorization...');
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
              environment: env,
            };
            saveSession(session);
            clearPendingChallenge();
            authenticated = true;
            outputSuccess('Authenticated successfully via external signature.');
          } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            consola.error(`Authentication failed: ${msg}`);
            const retry = await consola.prompt('Get a new challenge and try again?', {
              type: 'confirm',
              initial: true,
              cancel: 'reject',
            });
            if (!retry) {
              consola.info('Setup incomplete. Your NIP and environment are saved. Run `ksef auth login-external` to authenticate later.');
              return;
            }
          }
        }
      }

      // ── Phase 2: Token generation ──

      const generateToken = await consola.prompt('Generate a long-lived API token?', {
        type: 'confirm',
        initial: true,
        cancel: 'reject',
      });

      if (generateToken) {
        try {
          const selectedPermissions = await consola.prompt('Select token permissions:', {
            type: 'multiselect',
            options: ALL_PERMISSIONS,
            cancel: 'reject',
          }) as unknown as KsefTokenPermissionType[];

          if (selectedPermissions.length === 0) {
            consola.warn('No permissions selected. Skipping token generation.');
          } else {
            const defaultDescription = `KSeF CLI API Token ${new Date().toISOString().slice(0, 10)}`;
            const description = await consola.prompt(`Token description (${defaultDescription}):`, {
              type: 'text',
              default: defaultDescription,
              cancel: 'reject',
            }) as string;

            const { client: sessionClient } = await getSessionClient(env);
            const request: KsefTokenRequest = {
              description: description.trim() || defaultDescription,
              permissions: selectedPermissions,
            };
            const tokenResult = await sessionClient.tokens.generateToken(request);

            saveCredentials({ token: tokenResult.token });
            outputSuccess('Token generated and saved.');

            // Re-login with token
            try {
              const freshClient = createClient({ env });
              await freshClient.loginWithToken(tokenResult.token, nip);
              const newSession: SessionData = {
                accessToken: freshClient.authManager.getAccessToken()!,
                refreshToken: freshClient.authManager.getRefreshToken(),
                environment: env,
              };
              saveSession(newSession);
              consola.info('Re-authenticated with generated token.');
            } catch {
              consola.warn('Token saved but re-login failed. Run `ksef auth login` to authenticate with the stored token.');
            }
          }
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          consola.error(`Token generation failed: ${msg}`);
          consola.info('Your session is still active. Run `ksef token generate` to create a token later.');
        }
      }

      // ── Summary ──

      const finalCredentials = loadCredentials();
      consola.box([
        'Setup complete!',
        '',
        `  Environment: ${env}`,
        `  NIP: ${nip}`,
        `  Session: active`,
        `  Token: ${finalCredentials?.token ? 'saved' : 'not generated'}`,
        '',
        'Quick start:',
        '  ksef invoice send <file>    — Send an invoice',
        '  ksef session open           — Open an online session',
        '  ksef auth whoami            — Check current session',
      ].join('\n'));
    });
  },
});

async function getSessionClient(env: string) {
  const { requireSession } = await import('../client-factory.js');
  return requireSession({ env });
}
