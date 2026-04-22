import { KSeFClient } from '../../../src/client.js';
import { CertificateService } from '../../../src/crypto/certificate-service.js';
import { authenticateWithCertificate as authCertWorkflow } from '../../../src/workflows/auth-workflow.js';
import type { AuthResult } from '../../../src/workflows/types.js';
import { getTestNip, getTestToken } from './env.js';
import { generateRandomNip } from './identifiers.js';
import type { EncryptionData } from '../../../src/models/crypto/types.js';

export function createTestClient(): KSeFClient {
  return new KSeFClient({ environment: 'TEST' });
}

/**
 * Primary auth method for most E2E tests — zero secrets needed.
 * Generates a random NIP + self-signed company seal cert, then authenticates
 * via XAdES with verifyCertificateChain=false (KSeF TEST default).
 *
 * Returns the client and the NIP used (needed for invoice templates).
 */
export async function authenticateWithCert(nip?: string): Promise<{
  client: KSeFClient;
  nip: string;
}> {
  const client = createTestClient();
  nip ??= generateRandomNip();
  const cert = await CertificateService.generateCompanySeal(
    'E2E Test Company', `VATPL-${nip}`, `E2E Test ${nip}`, 'RSA',
  );
  await client.loginWithCertificate(cert.certificatePem, cert.privateKeyPem, nip);
  return { client, nip };
}

/**
 * Cert auth + crypto init + encryption data.
 * loginWithCertificate() does NOT call crypto.init(), so we do it explicitly.
 */
export async function authenticateWithCertAndCrypto(nip?: string): Promise<{
  client: KSeFClient;
  nip: string;
  encryptionData: EncryptionData;
}> {
  const { client, nip: resolvedNip } = await authenticateWithCert(nip);
  await client.crypto.init();
  const encryptionData = await client.crypto.getEncryptionData();
  return { client, nip: resolvedNip, encryptionData };
}

/**
 * Cert auth via workflow function — returns AuthResult with token expiration info.
 * Uses authenticateWithCertificate from src/workflows/auth-workflow.ts.
 */
export async function authenticateWithCertWorkflow(nip?: string): Promise<{
  client: KSeFClient;
  nip: string;
  authResult: AuthResult;
}> {
  const client = createTestClient();
  nip ??= generateRandomNip();
  const cert = await CertificateService.generateCompanySeal(
    'E2E Test Company', `VATPL-${nip}`, `E2E Test ${nip}`, 'RSA',
  );
  const authResult = await authCertWorkflow(client, {
    nip,
    certPem: cert.certificatePem,
    keyPem: cert.privateKeyPem,
  });
  return { client, nip, authResult };
}

/**
 * Token auth — only for 02-auth-token.test.ts.
 * Requires KSEF_TEST_TOKEN and KSEF_TEST_NIP env vars.
 * loginWithToken() internally calls crypto.init().
 */
export async function authenticateWithToken(client?: KSeFClient): Promise<KSeFClient> {
  client ??= createTestClient();
  await client.loginWithToken(getTestToken(), getTestNip());
  return client;
}

/**
 * Token auth + encryption data — only for tests that specifically need token auth.
 */
export async function authenticateWithTokenAndCrypto(client?: KSeFClient): Promise<{
  client: KSeFClient;
  encryptionData: EncryptionData;
}> {
  client = await authenticateWithToken(client);
  const encryptionData = await client.crypto.getEncryptionData();
  return { client, encryptionData };
}
