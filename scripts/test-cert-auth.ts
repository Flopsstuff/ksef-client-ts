/**
 * Test script: self-signed certificate auth against KSeF TEST environment.
 *
 * Usage: npx tsx scripts/test-cert-auth.ts [--nip <NIP>]
 */
import { KSeFClient } from '../src/client.js';
import { CertificateService } from '../src/crypto/certificate-service.js';
import { SignatureService } from '../src/crypto/signature-service.js';
import { AuthTokenRequestBuilder } from '../src/builders/auth-token-request.js';
import type { AuthTokenRequest } from '../src/models/auth/types.js';

const nip = process.argv.includes('--nip')
  ? process.argv[process.argv.indexOf('--nip') + 1]
  : process.env.KSEF_NIP ?? '9999999999';

function serializeAuthTokenRequest(req: AuthTokenRequest): string {
  const ns = 'http://ksef.mf.gov.pl/auth/token/2.0';
  const ctx = `<${req.contextIdentifier.type}>${req.contextIdentifier.value}</${req.contextIdentifier.type}>`;

  let policy = '';
  if (req.authorizationPolicy?.allowedIps) {
    const ips = req.authorizationPolicy.allowedIps;
    const parts: string[] = [];
    for (const addr of ips.ip4Addresses ?? []) parts.push(`<Ip4Address>${addr}</Ip4Address>`);
    for (const range of ips.ip4Ranges ?? []) parts.push(`<Ip4Range>${range}</Ip4Range>`);
    for (const mask of ips.ip4Masks ?? []) parts.push(`<Ip4Mask>${mask}</Ip4Mask>`);
    if (parts.length > 0) {
      policy = `<AuthorizationPolicy><AllowedIps>${parts.join('')}</AllowedIps></AuthorizationPolicy>`;
    }
  }

  return [
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`,
    `<AuthTokenRequest xmlns="${ns}">`,
    `<Challenge>${req.challenge}</Challenge>`,
    `<ContextIdentifier>${ctx}</ContextIdentifier>`,
    `<SubjectIdentifierType>${req.subjectIdentifierType}</SubjectIdentifierType>`,
    policy,
    `</AuthTokenRequest>`,
  ].filter(Boolean).join('');
}

async function main() {
  const client = new KSeFClient({ environment: 'TEST' });

  // 1. Generate self-signed certificate
  console.log('--- Generating self-signed certificate (RSA) ---');
  const cert = await CertificateService.generatePersonalCertificate(
    'Jan',
    'Kowalski',
    nip,
    `Test KSeF CLI - ${nip}`,
    'RSA',
  );
  console.log('Fingerprint:', cert.fingerprint);
  console.log('Certificate PEM (first 80 chars):', cert.certificatePem.slice(0, 80));

  // 2. Get challenge
  console.log('\n--- Requesting challenge ---');
  let challenge;
  try {
    challenge = await client.auth.getChallenge();
    console.log('Challenge:', challenge.challenge);
    console.log('Timestamp:', challenge.timestamp);
  } catch (err: unknown) {
    console.error('Failed to get challenge:', (err as Error).message);
    console.error('KSeF TEST environment may be down or behind a WAF.');
    process.exit(1);
  }

  // 3. Build AuthTokenRequest XML
  console.log('\n--- Building AuthTokenRequest XML ---');
  const authRequest = new AuthTokenRequestBuilder()
    .withChallenge(challenge.challenge)
    .withContextNip(nip)
    .withSubjectType('certificateFingerprint')
    .build();

  const xml = serializeAuthTokenRequest(authRequest);
  console.log('XML length:', xml.length);
  console.log('XML preview:', xml.slice(0, 200));

  // 4. Sign with XAdES
  console.log('\n--- Signing with XAdES-B ---');
  const signedXml = SignatureService.sign(
    xml,
    cert.certificatePem,
    cert.privateKeyPem,
  );
  console.log('Signed XML length:', signedXml.length);
  console.log('Contains ds:Signature:', signedXml.includes('ds:Signature'));

  // 5. Submit signed auth request
  console.log('\n--- Submitting XAdES auth request ---');
  try {
    const result = await client.auth.submitXadesAuthRequest(signedXml);
    console.log('Reference number:', result.referenceNumber);
    console.log('Auth token:', result.authenticationToken.token.slice(0, 20), '...');
    console.log('Valid until:', result.authenticationToken.validUntil);

    // 6. Wait for auth to complete, then redeem
    console.log('\n--- Waiting for auth processing ---');
    for (let attempt = 0; attempt < 10; attempt++) {
      await new Promise(r => setTimeout(r, 2000));
      const status = await client.auth.getAuthStatus(
        result.referenceNumber,
        result.authenticationToken.token,
      );
      console.log(`  Attempt ${attempt + 1}: status code ${status.status.code} — ${status.status.description}`);
      if (status.status.code === 200) break;
      if (status.status.code >= 400) {
        console.error('Auth failed with status:', status.status);
        process.exit(1);
      }
    }

    console.log('\n--- Redeeming access token ---');
    const session = await client.auth.getAccessToken(result.authenticationToken.token);
    console.log('Access token:', session.accessToken.token.slice(0, 20), '...');
    console.log('Valid until:', session.accessToken.validUntil);

    console.log('\n--- SUCCESS ---');
  } catch (err: unknown) {
    const error = err as Error & { statusCode?: number; errorResponse?: unknown };
    console.error('Auth failed:', error.message);
    if (error.statusCode) console.error('HTTP status:', error.statusCode);
    if (error.errorResponse) console.error('Response:', JSON.stringify(error.errorResponse, null, 2));
  }
}

main();
