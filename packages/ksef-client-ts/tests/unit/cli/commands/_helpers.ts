import { vi } from 'vitest';

export function mockService(methods: string[]) {
  return Object.fromEntries(methods.map((m) => [m, vi.fn()]));
}

export function createMockClient() {
  return {
    authManager: {
      getAccessToken: vi.fn().mockReturnValue('mock-access-token'),
      getRefreshToken: vi.fn().mockReturnValue('mock-refresh-token'),
      setAccessToken: vi.fn(),
      setRefreshToken: vi.fn(),
    },
    loginWithToken: vi.fn().mockResolvedValue({ clientIp: '127.0.0.1' }),
    loginWithCertificate: vi.fn().mockResolvedValue({ clientIp: '127.0.0.1' }),
    loginWithPkcs12: vi.fn().mockResolvedValue({ clientIp: '127.0.0.1' }),
    auth: mockService(['getChallenge', 'getAuthStatus', 'refreshAccessToken', 'submitXadesAuthRequest', 'getAccessToken']),
    invoices: mockService(['getInvoice', 'queryInvoiceMetadata', 'exportInvoices', 'getInvoiceExportStatus']),
    permissions: mockService([
      'grantPersonPermissions', 'grantEntityPermissions', 'grantAuthorizationPermissions',
      'grantIndirectPermissions', 'grantSubunitPermissions', 'grantEuEntityAdminPermissions',
      'grantEuEntityRepresentativePermissions', 'revokeCommonGrant', 'revokeAuthorizationGrant',
      'queryPersonalGrants', 'queryPersonsGrants', 'querySubunitsGrants', 'queryEntitiesRoles',
      'queryEntitiesGrants', 'querySubordinateEntitiesRoles', 'queryAuthorizationsGrants',
      'queryEuEntitiesGrants', 'getOperationStatus', 'getAttachmentStatus',
    ]),
    onlineSession: mockService(['openSession', 'closeSession', 'sendInvoice']),
    batchSession: mockService(['openSession', 'sendParts', 'closeSession']),
    sessionStatus: mockService([
      'getSessionStatus', 'getSessions', 'getSessionInvoices', 'getSessionFailedInvoices',
      'getSessionUpo', 'getInvoiceUpoByKsefNumber', 'getInvoiceUpoByReference',
      'getSessionInvoice',
    ]),
    activeSessions: mockService(['getActiveSessions', 'revokeCurrentSession', 'revokeSession']),
    lighthouse: mockService(['getStatus', 'getMessages']),
    tokens: mockService(['generateToken', 'queryTokens', 'getToken', 'revokeToken', 'revokeSelf', 'findSelfReferenceNumber']),
    certificates: mockService(['enroll', 'getEnrollmentStatus', 'query', 'revoke', 'getLimits', 'getEnrollmentData', 'retrieve']),
    limits: mockService(['getContextLimits', 'getSubjectLimits', 'getRateLimits']),
    collectiveIdentifiers: mockService(['generate', 'query', 'getByKsefNumber', 'getInvoices']),
    testData: mockService([
      'createSubject', 'removeSubject', 'createPerson', 'removePerson',
      'grantPermissions', 'revokePermissions', 'enableAttachment', 'disableAttachment',
      'changeSessionLimits', 'restoreDefaultSessionLimits', 'changeCertificatesLimit',
      'restoreDefaultCertificatesLimit', 'setRateLimits', 'restoreDefaultRateLimits',
      'setProductionRateLimits',
      'blockContext', 'unblockContext', 'updateCertificate',
    ]),
    peppol: mockService(['queryProviders']),
    qr: mockService(['buildInvoiceVerificationUrl', 'buildCertificateVerificationUrl']),
    crypto: {
      init: vi.fn(),
      getEncryptionData: vi.fn().mockReturnValue({
        encryptionInfo: { key: 'mock-key' },
        cipherKey: new Uint8Array(32),
        cipherIv: new Uint8Array(16),
      }),
      getFileMetadata: vi.fn().mockReturnValue({ fileSize: 100, hashSHA: 'mock-hash' }),
      encryptAES256: vi.fn().mockReturnValue(new Uint8Array(128)),
    },
  };
}

export const defaultConfig = {
  environment: 'test' as const,
  output: 'pretty' as const,
  timeout: 30_000,
};

export const validSession = {
  accessToken: 'access-token-123',
  refreshToken: 'refresh-token-456',
  sessionRef: 'ref-789',
  expiresAt: '2099-01-01T00:00:00Z',
  environment: 'test' as const,
};
