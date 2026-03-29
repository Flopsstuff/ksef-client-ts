import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { setupCommand } from '../../../../src/cli/commands/setup.js';
import * as clientFactory from '../../../../src/cli/client-factory.js';
import * as configStore from '../../../../src/cli/config-store.js';
import * as sessionStore from '../../../../src/cli/session-store.js';
import * as credentialsStore from '../../../../src/cli/credentials-store.js';
import * as pendingChallengeStore from '../../../../src/cli/pending-challenge-store.js';
import * as output from '../../../../src/cli/output.js';
import { consola } from 'consola';
import { createMockClient, defaultConfig, validSession } from './_helpers.js';

vi.mock('consola', () => ({
  consola: {
    level: 0,
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    box: vi.fn(),
    prompt: vi.fn(),
  },
}));

vi.mock('../../../../src/cli/error-handler.js', () => ({
  withErrorHandler: vi.fn((fn) => fn()),
}));

vi.mock('../../../../src/cli/client-factory.js', () => ({
  createClient: vi.fn(),
  requireSession: vi.fn(),
}));

vi.mock('../../../../src/cli/config-store.js', () => ({
  loadConfig: vi.fn(),
  saveConfig: vi.fn(),
}));

vi.mock('../../../../src/cli/session-store.js', () => ({
  saveSession: vi.fn(),
  loadSession: vi.fn(),
}));

vi.mock('../../../../src/cli/credentials-store.js', () => ({
  loadCredentials: vi.fn(),
  saveCredentials: vi.fn(),
  clearCredentials: vi.fn(),
}));

vi.mock('../../../../src/cli/pending-challenge-store.js', () => ({
  savePendingChallenge: vi.fn(),
  clearPendingChallenge: vi.fn(),
}));

vi.mock('../../../../src/cli/output.js', () => ({
  outputSuccess: vi.fn(),
  outputWarning: vi.fn(),
  outputKeyValue: vi.fn(),
  outputResult: vi.fn(),
}));

vi.mock('../../../../src/cli/utils/open-folder.js', () => ({
  openFolder: vi.fn().mockResolvedValue(true),
}));

vi.mock('../../../../src/crypto/auth-xml-builder.js', () => ({
  buildUnsignedAuthTokenRequestXml: vi.fn().mockReturnValue('<UnsignedXml/>'),
}));

vi.mock('../../../../src/workflows/polling.js', () => ({
  pollUntil: vi.fn().mockResolvedValue({ status: { code: 200 } }),
}));

vi.mock('../../../../src/validation/patterns.js', () => ({
  isValidNip: vi.fn().mockReturnValue(true),
}));

vi.mock('../../../../src/crypto/certificate-service.js', () => ({
  CertificateService: {
    generateCompanySeal: vi.fn().mockResolvedValue({
      certificatePem: '-----BEGIN CERTIFICATE-----\nMOCK\n-----END CERTIFICATE-----',
      privateKeyPem: '-----BEGIN PRIVATE KEY-----\nMOCK\n-----END PRIVATE KEY-----',
    }),
  },
}));

vi.mock('node:fs', () => ({
  readFileSync: vi.fn().mockReturnValue('<SignedXml/>'),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  existsSync: vi.fn().mockReturnValue(true),
  default: {
    readFileSync: vi.fn().mockReturnValue('<SignedXml/>'),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
    existsSync: vi.fn().mockReturnValue(true),
  },
}));

const mockCreateClient = vi.mocked(clientFactory.createClient);
const mockRequireSession = vi.mocked(clientFactory.requireSession);
const mockLoadConfig = vi.mocked(configStore.loadConfig);
const mockSaveConfig = vi.mocked(configStore.saveConfig);
const mockSaveSession = vi.mocked(sessionStore.saveSession);
const mockLoadSession = vi.mocked(sessionStore.loadSession);
const mockLoadCredentials = vi.mocked(credentialsStore.loadCredentials);
const mockSaveCredentials = vi.mocked(credentialsStore.saveCredentials);
const mockSavePendingChallenge = vi.mocked(pendingChallengeStore.savePendingChallenge);
const mockClearPendingChallenge = vi.mocked(pendingChallengeStore.clearPendingChallenge);
const mockOutputSuccess = vi.mocked(output.outputSuccess);
const mockConsolaPrompt = vi.mocked(consola.prompt);

let mockClient: ReturnType<typeof createMockClient>;
let originalIsTTY: boolean | undefined;

beforeEach(() => {
  vi.clearAllMocks();

  // Save and set TTY
  originalIsTTY = process.stdin.isTTY;
  process.stdin.isTTY = true;

  mockClient = createMockClient();
  mockCreateClient.mockReturnValue(mockClient as any);
  mockRequireSession.mockResolvedValue({ client: mockClient as any, session: validSession });
  mockLoadConfig.mockReturnValue({ ...defaultConfig });
  mockLoadSession.mockReturnValue(null);
  mockLoadCredentials.mockReturnValue(null);

  // Setup mock client methods
  mockClient.auth.getChallenge.mockResolvedValue({
    challenge: 'ch1',
    timestamp: '2026-01-01T00:00:00Z',
    timestampMs: 0,
    clientIp: '127.0.0.1',
  });

  mockClient.auth.submitXadesAuthRequest.mockResolvedValue({
    referenceNumber: 'ref-1',
    authenticationToken: { token: 'auth-tok', validUntil: '2099-01-01' },
  });

  mockClient.auth.getAuthStatus.mockResolvedValue({
    status: { code: 200, description: 'OK' },
  });

  mockClient.auth.getAccessToken.mockResolvedValue({
    accessToken: { token: 'access-1', validUntil: '2099-01-01' },
    refreshToken: { token: 'refresh-1', validUntil: '2099-01-01' },
  });

  mockClient.tokens.generateToken.mockResolvedValue({
    token: 'generated-token-123',
    referenceNumber: 'tok-ref-1',
  });

  mockClient.loginWithToken.mockResolvedValue(undefined);
  mockClient.authManager.getAccessToken.mockReturnValue('new-access-token');
  mockClient.authManager.getRefreshToken.mockReturnValue('new-refresh-token');
});

afterEach(() => {
  // Restore TTY
  process.stdin.isTTY = originalIsTTY;
});

async function runSetup(args: Record<string, unknown> = {}) {
  const cmd = setupCommand as any;
  await cmd.run({ args });
}

describe('setup', () => {
  it('rejects non-interactive terminal', async () => {
    process.stdin.isTTY = false;
    await expect(runSetup()).rejects.toThrow('Interactive terminal required');
  });

  it('full setup flow (both phases)', async () => {
    // Mock prompts sequence
    mockConsolaPrompt
      .mockResolvedValueOnce('1234567890') // NIP
      .mockResolvedValueOnce(false) // Self-signed cert → no, use external signature
      .mockResolvedValueOnce('/path/to/signed.xml') // Signed XML path
      .mockResolvedValueOnce(true) // Generate token confirm
      .mockResolvedValueOnce(['InvoiceRead', 'InvoiceWrite']) // Permissions multiselect
      .mockResolvedValueOnce('My token'); // Description

    await runSetup();

    // Verify config saved
    expect(mockSaveConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        nip: '1234567890',
        environment: 'test',
      }),
    );

    // Verify session saved (after external auth)
    expect(mockSaveSession).toHaveBeenCalledWith(
      expect.objectContaining({
        accessToken: 'access-1',
        refreshToken: 'refresh-1',
      }),
    );

    // Verify pending challenge saved and cleared
    expect(mockSavePendingChallenge).toHaveBeenCalledWith(
      expect.objectContaining({
        challenge: 'ch1',
        contextIdentifier: { type: 'Nip', value: '1234567890' },
      }),
    );
    expect(mockClearPendingChallenge).toHaveBeenCalled();

    // Verify token generated
    expect(mockClient.tokens.generateToken).toHaveBeenCalledWith({
      description: 'My token',
      permissions: ['InvoiceRead', 'InvoiceWrite'],
    });

    // Verify credentials saved
    expect(mockSaveCredentials).toHaveBeenCalledWith({ token: 'generated-token-123' });

    // Verify re-login with token
    expect(mockClient.loginWithToken).toHaveBeenCalledWith('generated-token-123', '1234567890');

    // Verify success output
    expect(mockOutputSuccess).toHaveBeenCalledWith(
      expect.stringContaining('Authenticated successfully'),
    );
    expect(mockOutputSuccess).toHaveBeenCalledWith(expect.stringContaining('Token generated'));
  });

  it('skips Phase 2 when user declines token generation', async () => {
    // Mock prompts sequence
    mockConsolaPrompt
      .mockResolvedValueOnce('1234567890') // NIP
      .mockResolvedValueOnce(false) // Self-signed cert → no
      .mockResolvedValueOnce('/path/to/signed.xml') // Signed XML path
      .mockResolvedValueOnce(false); // Generate token confirm → false

    await runSetup();

    // Verify session saved but credentials NOT saved
    expect(mockSaveSession).toHaveBeenCalledWith(
      expect.objectContaining({
        accessToken: 'access-1',
      }),
    );
    expect(mockSaveCredentials).not.toHaveBeenCalled();
    expect(mockClient.tokens.generateToken).not.toHaveBeenCalled();
  });

  it('env override via --env arg', async () => {
    // prod env → no self-signed prompt
    mockConsolaPrompt
      .mockResolvedValueOnce('1234567890')
      .mockResolvedValueOnce('/path/to/signed.xml')
      .mockResolvedValueOnce(false);

    await runSetup({ env: 'prod' });

    expect(mockSaveConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        environment: 'prod',
      }),
    );

    expect(mockSaveSession).toHaveBeenCalledWith(
      expect.objectContaining({
        environment: 'prod',
      }),
    );
  });

  it('default env from config', async () => {
    // demo env → no self-signed prompt
    mockLoadConfig.mockReturnValue({ ...defaultConfig, environment: 'demo' as any });

    mockConsolaPrompt
      .mockResolvedValueOnce('1234567890')
      .mockResolvedValueOnce('/path/to/signed.xml')
      .mockResolvedValueOnce(false);

    await runSetup();

    expect(mockSaveConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        environment: 'demo',
      }),
    );

    expect(mockSaveSession).toHaveBeenCalledWith(
      expect.objectContaining({
        environment: 'demo',
      }),
    );
  });

  it('existing session - user cancels', async () => {
    mockLoadSession.mockReturnValue(validSession);

    mockConsolaPrompt.mockResolvedValueOnce(false); // Overwrite prompt → false

    await runSetup();

    // Verify setup cancelled early
    expect(mockSaveConfig).not.toHaveBeenCalled();
    expect(mockSaveSession).not.toHaveBeenCalled();
    expect(mockClient.auth.getChallenge).not.toHaveBeenCalled();
  });

  it('existing credentials - user overwrites', async () => {
    mockLoadCredentials.mockReturnValue({ token: 'existing-token' });

    mockConsolaPrompt
      .mockResolvedValueOnce(true) // Overwrite confirm
      .mockResolvedValueOnce('1234567890')
      .mockResolvedValueOnce(false) // Self-signed cert → no
      .mockResolvedValueOnce('/path/to/signed.xml')
      .mockResolvedValueOnce(false);

    await runSetup();

    // Verify setup proceeds
    expect(mockSaveConfig).toHaveBeenCalled();
    expect(mockSaveSession).toHaveBeenCalled();
  });

  it('token generation with no permissions selected - skips', async () => {
    mockConsolaPrompt
      .mockResolvedValueOnce('1234567890')
      .mockResolvedValueOnce(false) // Self-signed cert → no
      .mockResolvedValueOnce('/path/to/signed.xml')
      .mockResolvedValueOnce(true) // Generate token confirm
      .mockResolvedValueOnce([]); // Empty permissions

    await runSetup();

    expect(mockClient.tokens.generateToken).not.toHaveBeenCalled();
    expect(mockSaveCredentials).not.toHaveBeenCalled();
  });

  it('authentication failure - user retries', async () => {
    mockClient.auth.submitXadesAuthRequest
      .mockRejectedValueOnce(new Error('Invalid signature'))
      .mockResolvedValueOnce({
        referenceNumber: 'ref-2',
        authenticationToken: { token: 'auth-tok-2', validUntil: '2099-01-01' },
      });

    mockConsolaPrompt
      .mockResolvedValueOnce('1234567890') // NIP
      .mockResolvedValueOnce(false) // Self-signed cert → no
      .mockResolvedValueOnce('/path/to/signed.xml') // First attempt
      .mockResolvedValueOnce(true) // Retry confirm
      .mockResolvedValueOnce('/path/to/signed2.xml') // Second attempt
      .mockResolvedValueOnce(false); // No token generation

    await runSetup();

    // Verify two challenges requested
    expect(mockClient.auth.getChallenge).toHaveBeenCalledTimes(2);

    // Verify successful session after retry
    expect(mockSaveSession).toHaveBeenCalledWith(
      expect.objectContaining({
        accessToken: 'access-1',
      }),
    );
  });

  it('authentication failure - user cancels', async () => {
    mockClient.auth.submitXadesAuthRequest.mockRejectedValue(new Error('Invalid signature'));

    mockConsolaPrompt
      .mockResolvedValueOnce('1234567890')
      .mockResolvedValueOnce(false) // Self-signed cert → no
      .mockResolvedValueOnce('/path/to/signed.xml')
      .mockResolvedValueOnce(false); // Retry confirm → false

    await runSetup();

    // Verify config saved but session NOT saved
    expect(mockSaveConfig).toHaveBeenCalled();
    expect(mockSaveSession).not.toHaveBeenCalled();
    expect(mockOutputSuccess).not.toHaveBeenCalledWith(
      expect.stringContaining('Authenticated successfully'),
    );
  });

  it('token generation failure - session remains active', async () => {
    mockClient.tokens.generateToken.mockRejectedValue(new Error('Permission denied'));

    mockConsolaPrompt
      .mockResolvedValueOnce('1234567890')
      .mockResolvedValueOnce(false) // Self-signed cert → no
      .mockResolvedValueOnce('/path/to/signed.xml')
      .mockResolvedValueOnce(true) // Generate token confirm
      .mockResolvedValueOnce(['InvoiceRead'])
      .mockResolvedValueOnce('CLI token');

    await runSetup();

    // Verify session saved despite token failure
    expect(mockSaveSession).toHaveBeenCalledWith(
      expect.objectContaining({
        accessToken: 'access-1',
      }),
    );

    // Verify credentials NOT saved
    expect(mockSaveCredentials).not.toHaveBeenCalled();

    // Verify error logged
    expect(consola.error).toHaveBeenCalledWith(expect.stringContaining('Token generation failed'));
  });

  it('test env - self-signed cert quick auth', async () => {
    mockClient.loginWithCertificate.mockResolvedValue(undefined);

    mockConsolaPrompt
      .mockResolvedValueOnce('1234567890') // NIP
      .mockResolvedValueOnce(true) // Self-signed cert → yes
      .mockResolvedValueOnce(false); // Generate token → no

    await runSetup();

    // Verify self-signed cert auth used
    expect(mockClient.loginWithCertificate).toHaveBeenCalledWith(
      expect.stringContaining('BEGIN CERTIFICATE'),
      expect.stringContaining('BEGIN PRIVATE KEY'),
      '1234567890',
    );

    // Verify session saved from authManager
    expect(mockSaveSession).toHaveBeenCalledWith(
      expect.objectContaining({
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
        environment: 'test',
      }),
    );

    // Verify external signature flow NOT used
    expect(mockClient.auth.getChallenge).not.toHaveBeenCalled();
    expect(mockSavePendingChallenge).not.toHaveBeenCalled();

    expect(mockOutputSuccess).toHaveBeenCalledWith(
      expect.stringContaining('self-signed certificate'),
    );
  });

  it('test env - self-signed cert with Phase 2 token generation', async () => {
    mockClient.loginWithCertificate.mockResolvedValue(undefined);

    mockConsolaPrompt
      .mockResolvedValueOnce('1234567890') // NIP
      .mockResolvedValueOnce(true) // Self-signed cert → yes
      .mockResolvedValueOnce(true) // Generate token → yes
      .mockResolvedValueOnce(['InvoiceRead', 'InvoiceWrite']) // Permissions
      .mockResolvedValueOnce('CLI setup token'); // Description

    await runSetup();

    // Verify self-signed cert auth
    expect(mockClient.loginWithCertificate).toHaveBeenCalled();

    // Verify token generated
    expect(mockClient.tokens.generateToken).toHaveBeenCalledWith({
      description: 'CLI setup token',
      permissions: ['InvoiceRead', 'InvoiceWrite'],
    });
    expect(mockSaveCredentials).toHaveBeenCalledWith({ token: 'generated-token-123' });
  });

  it('non-test env - no self-signed cert prompt', async () => {
    mockConsolaPrompt
      .mockResolvedValueOnce('1234567890') // NIP
      .mockResolvedValueOnce('/path/to/signed.xml') // Signed XML (no self-signed prompt)
      .mockResolvedValueOnce(false); // Generate token → no

    await runSetup({ env: 'prod' });

    // Verify no self-signed prompt - went straight to external signature
    expect(mockClient.loginWithCertificate).not.toHaveBeenCalled();
    expect(mockClient.auth.getChallenge).toHaveBeenCalled();
  });

  it('re-login failure after token generation - saves token', async () => {
    mockClient.loginWithToken.mockRejectedValue(new Error('Network error'));

    mockConsolaPrompt
      .mockResolvedValueOnce('1234567890')
      .mockResolvedValueOnce(false) // Self-signed cert → no
      .mockResolvedValueOnce('/path/to/signed.xml')
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(['InvoiceRead'])
      .mockResolvedValueOnce('CLI token');

    await runSetup();

    // Verify token saved despite re-login failure
    expect(mockSaveCredentials).toHaveBeenCalledWith({ token: 'generated-token-123' });

    // Verify warning logged
    expect(consola.warn).toHaveBeenCalledWith(
      expect.stringContaining('Token saved but re-login failed'),
    );
  });
});
