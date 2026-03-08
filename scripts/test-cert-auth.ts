/**
 * Test script: self-signed certificate auth against KSeF TEST environment.
 *
 * Usage: npx tsx scripts/test-cert-auth.ts [--nip <NIP>]
 */
import { KSeFClient } from '../src/client.js';
import { CertificateService } from '../src/crypto/certificate-service.js';
import { SignatureService } from '../src/crypto/signature-service.js';

const nip = process.argv.includes('--nip')
  ? process.argv[process.argv.indexOf('--nip') + 1]
  : '9999999999';

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
    console.log('Challenge:', challenge.challenge.slice(0, 100), '...');
    console.log('Timestamp:', challenge.timestamp);
  } catch (err: unknown) {
    console.error('Failed to get challenge:', (err as Error).message);
    console.error('KSeF TEST environment may be down or behind a WAF.');
    process.exit(1);
  }

  // 3. Sign challenge with XAdES
  console.log('\n--- Signing challenge with XAdES-B ---');
  const signedXml = SignatureService.sign(
    challenge.challenge,
    cert.certificatePem,
    cert.privateKeyPem,
  );
  console.log('Signed XML length:', signedXml.length);
  console.log('Contains ds:Signature:', signedXml.includes('ds:Signature'));

  // 4. Submit signed auth request
  console.log('\n--- Submitting XAdES auth request ---');
  try {
    const result = await client.auth.submitXadesAuthRequest(signedXml);
    console.log('Reference number:', result.referenceNumber);
    console.log('Auth token:', result.authenticationToken.token.slice(0, 20), '...');
    console.log('Valid until:', result.authenticationToken.validUntil);

    // 5. Redeem for access token
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
