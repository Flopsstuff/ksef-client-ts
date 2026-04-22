/**
 * Diagnostic: reproduce a full token-auth flow on Deno against KSeF TEST.
 *
 * What it does
 * ------------
 * 1. Generates a self-signed RSA company-seal cert.
 * 2. `loginWithCertificate` against TEST for the given NIP.
 * 3. `tokens.generateToken(...)` on the cert-authenticated session to mint a
 *    fresh API-issued token.
 * 4. Fresh `KSeFClient`: inlined `loginWithToken` flow with per-step logging
 *    (challenge → crypto.init → encryptKsefToken → submit → polled auth
 *    status → getAccessToken).
 *
 * This is the programmatic mirror of the asks posted on issue #18:
 *   - Full `getAuthStatus` JSON per polling cycle so `status.details` is
 *     visible (distinguishes the 5 different 450 sub-causes).
 *   - API-issued token (not UI-issued) to isolate whether token metadata
 *     from the MF web UI is part of the failing path.
 *
 * Usage
 * -----
 *   deno run -A scripts/diag-deno-token-auth.ts
 *
 * Env vars
 * --------
 *   KSEF_TEST_NIP        NIP to authenticate against (default: 5252287009).
 *   KSEF_CLIENT_VERSION  npm version of ksef-client-ts to pull (default:
 *                        0.7.2-alpha.0, the published alpha a Deno consumer
 *                        gets from `npm:ksef-client-ts`).
 *
 * Notes
 * -----
 * - Creates one visible token on the NIP's TEST account with description
 *   "diag-deno-<ts>"; revoked at the end if the flow reaches that point.
 * - TEST accepts self-signed certs with `verifyCertificateChain: false`
 *   (library default). No MF-issued "testowy certyfikat" needed.
 */

const NIP = Deno.env.get('KSEF_TEST_NIP') ?? '5252287009';
const VERSION = Deno.env.get('KSEF_CLIENT_VERSION') ?? '0.7.2-alpha.0';
const RUN_ID = `diag-deno-${Date.now()}`;

const { KSeFClient, CertificateService } = await import(`npm:ksef-client-ts@${VERSION}`);
const { Buffer } = await import('node:buffer');

const log = (label: string, data?: unknown) => {
  console.log(`\n━━━ ${label} ━━━`);
  if (data !== undefined) {
    console.log(typeof data === 'string' ? data : JSON.stringify(data, null, 2));
  }
};

let createdTokenRef: string | null = null;
let clientA: InstanceType<typeof KSeFClient> | null = null;

try {
  console.log(`Deno ${Deno.version.deno} · ksef-client-ts@${VERSION} · NIP ${NIP}`);

  log('Step 1: Generate self-signed RSA company-seal cert');
  const cert = await CertificateService.generateCompanySeal(
    'Diagnostic (Deno)',
    `VATPL-${NIP}`,
    `Diagnostic ${NIP}`,
    'RSA',
  );
  console.log('  cert PEM length:', cert.certificatePem.length);

  log(`Step 2: loginWithCertificate on TEST (NIP=${NIP})`);
  clientA = new KSeFClient({ environment: 'TEST' });
  const certLogin = await clientA.loginWithCertificate(
    cert.certificatePem,
    cert.privateKeyPem,
    NIP,
  );
  console.log('  ✓ cert-auth OK, result keys:', Object.keys(certLogin));

  log('Step 3: Generate fresh token via API');
  const tokenResp = await clientA.tokens.generateToken({
    description: RUN_ID,
    permissions: ['InvoiceRead', 'InvoiceWrite'],
  });
  console.log('  ✓ token response:', JSON.stringify(tokenResp, null, 2).slice(0, 500));
  const apiToken: string | undefined =
    typeof tokenResp.token === 'string'
      ? tokenResp.token
      : (tokenResp.token as { token?: string } | undefined)?.token;
  if (!apiToken) throw new Error('No token string in generateToken response');
  createdTokenRef = (tokenResp as { referenceNumber?: string }).referenceNumber ?? null;

  log('Step 4: Fresh client, loginWithToken (inlined)');
  const clientB = new KSeFClient({ environment: 'TEST' });

  console.log('  4a. getChallenge');
  const challenge = await clientB.auth.getChallenge();
  console.log('     ts:', challenge.timestamp, 'tsMs:', challenge.timestampMs);

  console.log('  4b. crypto.init');
  await clientB.crypto.init();

  console.log('  4c. encryptKsefToken');
  const encrypted = clientB.crypto.encryptKsefToken(apiToken, challenge.timestamp);
  console.log('     ciphertext bytes:', encrypted.length);

  console.log('  4d. submitKsefTokenAuthRequest');
  const submitResult = await clientB.auth.submitKsefTokenAuthRequest({
    challenge: challenge.challenge,
    contextIdentifier: { type: 'Nip', value: NIP },
    encryptedToken: Buffer.from(encrypted).toString('base64'),
  });
  console.log('     ✓ ref:', submitResult.referenceNumber);
  const authToken = submitResult.authenticationToken.token;

  console.log('  4e. polling getAuthStatus');
  let finalStatus: unknown = null;
  for (let i = 0; i < 30; i++) {
    const status = await clientB.auth.getAuthStatus(
      submitResult.referenceNumber,
      authToken,
    );
    console.log(
      `     [poll ${i}]`,
      JSON.stringify((status as { status: unknown }).status),
    );
    const s = status as { status: { code: number } };
    if (s.status.code !== 100) {
      finalStatus = status;
      break;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }

  log('FINAL polling status (raw JSON)', finalStatus);

  const fs = finalStatus as { status: { code: number } } | null;
  if (fs?.status?.code === 200) {
    console.log('  4f. getAccessToken');
    const tokens = await clientB.auth.getAccessToken(authToken);
    const t = (tokens as { accessToken: unknown }).accessToken;
    const tokenStr =
      typeof t === 'string' ? t : (t as { token?: string } | undefined)?.token;
    console.log('     ✓ access token first 24:', tokenStr?.slice(0, 24), '...');
    console.log('\n=== SUCCESS — full token-auth flow works on Deno ===');
  } else {
    console.log(
      `\n  ⚠ Final code = ${fs?.status?.code} — auth failed at polling stage`,
    );
  }
} catch (err) {
  console.error('\n✗ EXCEPTION:', err instanceof Error ? err.message : err);
  if (err instanceof Error && err.stack) console.error(err.stack);
  Deno.exit(1);
} finally {
  if (clientA && createdTokenRef) {
    try {
      await (clientA as unknown as {
        tokens: { revokeToken(ref: string): Promise<unknown> };
      }).tokens.revokeToken(createdTokenRef);
      console.log(`\n(cleanup) revoked diagnostic token ${createdTokenRef}`);
    } catch (revokeErr) {
      console.log(
        `\n(cleanup) revoke failed for ${createdTokenRef}:`,
        revokeErr instanceof Error ? revokeErr.message : revokeErr,
      );
    }
  }
}
