import type { KSeFClient } from '../client.js';
import type { AuthorizationPolicy } from '../models/auth/types.js';
import type { ContextIdentifier } from '../models/common.js';
import type { PollOptions } from './types.js';
import { pollUntil } from './polling.js';
import { buildUnsignedAuthTokenRequestXml } from '../crypto/auth-xml-builder.js';
import { withKeyRotationRetry } from '../crypto/with-key-rotation-retry.js';

export interface AuthResult {
  accessToken: string;
  accessTokenValidUntil: string;
  refreshToken: string;
  refreshTokenValidUntil: string;
}

export interface TokenAuthOptions {
  nip: string;
  token: string;
  authorizationPolicy?: AuthorizationPolicy;
  pollOptions?: PollOptions;
}

export interface CertificateAuthOptions {
  nip: string;
  certPem: string;
  keyPem: string;
  keyPassword?: string;
  verifyCertificateChain?: boolean;
  enforceXadesCompliance?: boolean;
  pollOptions?: PollOptions;
}

export interface Pkcs12AuthOptions {
  nip: string;
  p12: Buffer | Uint8Array;
  password: string;
  verifyCertificateChain?: boolean;
  enforceXadesCompliance?: boolean;
  pollOptions?: PollOptions;
}

export async function authenticateWithToken(
  client: KSeFClient,
  options: TokenAuthOptions,
): Promise<AuthResult> {
  const challenge = await client.auth.getChallenge();
  await client.crypto.init();

  const submitResult = await withKeyRotationRetry(client.crypto, async () => {
    const { encryptedToken, publicKeyId } = await client.crypto.encryptKsefTokenWithKeyId(options.token, challenge.timestamp);
    return client.auth.submitKsefTokenAuthRequest({
      challenge: challenge.challenge,
      contextIdentifier: { type: 'Nip', value: options.nip },
      encryptedToken: Buffer.from(encryptedToken).toString('base64'),
      publicKeyId,
      authorizationPolicy: options.authorizationPolicy,
    });
  });

  const authToken = submitResult.authenticationToken.token;

  await pollUntil(
    () => client.auth.getAuthStatus(submitResult.referenceNumber, authToken),
    (s) => s.status.code !== 100,
    { ...options.pollOptions, description: `auth ${submitResult.referenceNumber}` },
  );

  const tokens = await client.auth.getAccessToken(authToken);

  client.authManager.setAccessToken(tokens.accessToken.token);
  client.authManager.setRefreshToken(tokens.refreshToken.token);

  return {
    accessToken: tokens.accessToken.token,
    accessTokenValidUntil: tokens.accessToken.validUntil,
    refreshToken: tokens.refreshToken.token,
    refreshTokenValidUntil: tokens.refreshToken.validUntil,
  };
}

export async function authenticateWithCertificate(
  client: KSeFClient,
  options: CertificateAuthOptions,
): Promise<AuthResult> {
  const challenge = await client.auth.getChallenge();

  const { buildAuthTokenRequestXml } = await import('../client.js');
  const { SignatureService } = await import('../crypto/signature-service.js');
  const authRequestXml = buildAuthTokenRequestXml(challenge.challenge, options.nip);
  const signedXml = SignatureService.sign(authRequestXml, options.certPem, options.keyPem, options.keyPassword);

  const submitResult = await client.auth.submitXadesAuthRequest(
    signedXml,
    options.verifyCertificateChain ?? false,
    options.enforceXadesCompliance ?? false,
  );

  const authToken = submitResult.authenticationToken.token;

  await pollUntil(
    () => client.auth.getAuthStatus(submitResult.referenceNumber, authToken),
    (s) => s.status.code !== 100,
    { ...options.pollOptions, description: `auth ${submitResult.referenceNumber}` },
  );

  const tokens = await client.auth.getAccessToken(authToken);

  client.authManager.setAccessToken(tokens.accessToken.token);
  client.authManager.setRefreshToken(tokens.refreshToken.token);

  return {
    accessToken: tokens.accessToken.token,
    accessTokenValidUntil: tokens.accessToken.validUntil,
    refreshToken: tokens.refreshToken.token,
    refreshTokenValidUntil: tokens.refreshToken.validUntil,
  };
}

export interface ExternalSignatureAuthOptions {
  contextIdentifier: ContextIdentifier;
  signXml: (unsignedXml: string) => Promise<string> | string;
  verifyCertificateChain?: boolean;
  enforceXadesCompliance?: boolean;
  pollOptions?: PollOptions;
}

export async function authenticateWithExternalSignature(
  client: KSeFClient,
  options: ExternalSignatureAuthOptions,
): Promise<AuthResult> {
  const challenge = await client.auth.getChallenge();

  const unsignedXml = buildUnsignedAuthTokenRequestXml({
    challenge: challenge.challenge,
    contextIdentifier: options.contextIdentifier,
  });

  const signedXml = await options.signXml(unsignedXml);

  const submitResult = await client.auth.submitXadesAuthRequest(
    signedXml,
    options.verifyCertificateChain ?? false,
    options.enforceXadesCompliance ?? false,
  );

  const authToken = submitResult.authenticationToken.token;

  await pollUntil(
    () => client.auth.getAuthStatus(submitResult.referenceNumber, authToken),
    (s) => s.status.code !== 100,
    { ...options.pollOptions, description: `auth ${submitResult.referenceNumber}` },
  );

  const tokens = await client.auth.getAccessToken(authToken);

  client.authManager.setAccessToken(tokens.accessToken.token);
  client.authManager.setRefreshToken(tokens.refreshToken.token);

  return {
    accessToken: tokens.accessToken.token,
    accessTokenValidUntil: tokens.accessToken.validUntil,
    refreshToken: tokens.refreshToken.token,
    refreshTokenValidUntil: tokens.refreshToken.validUntil,
  };
}

export async function authenticateWithPkcs12(
  client: KSeFClient,
  options: Pkcs12AuthOptions,
): Promise<AuthResult> {
  const { Pkcs12Loader } = await import('../crypto/pkcs12-loader.js');
  const { certificatePem, privateKeyPem } = Pkcs12Loader.load(options.p12, options.password);
  return authenticateWithCertificate(client, {
    nip: options.nip,
    certPem: certificatePem,
    keyPem: privateKeyPem,
    verifyCertificateChain: options.verifyCertificateChain,
    enforceXadesCompliance: options.enforceXadesCompliance,
    pollOptions: options.pollOptions,
  });
}
