import { describe, it, expect, vi, beforeEach } from 'vitest';
import { certCommand } from '../../../../src/cli/commands/cert.js';
import * as clientFactory from '../../../../src/cli/client-factory.js';
import * as output from '../../../../src/cli/output.js';
import fs from 'node:fs';
import { CertificateService } from '../../../../src/crypto/certificate-service.js';
import { createMockClient, validSession } from './_helpers.js';

vi.mock('consola', () => ({
  consola: { level: 0, start: vi.fn(), info: vi.fn() },
}));

vi.mock('../../../../src/cli/error-handler.js', () => ({
  withErrorHandler: vi.fn((fn) => fn()),
}));

vi.mock('../../../../src/cli/client-factory.js', () => ({
  requireSession: vi.fn(),
}));

vi.mock('../../../../src/cli/output.js', () => ({
  outputResult: vi.fn(),
  outputKeyValue: vi.fn(),
  outputTable: vi.fn(),
  outputSuccess: vi.fn(),
  outputWarning: vi.fn(),
}));

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  writeFileSync: vi.fn(),
  readFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  default: {
    existsSync: vi.fn(),
    writeFileSync: vi.fn(),
    readFileSync: vi.fn(),
    mkdirSync: vi.fn(),
  },
}));

vi.mock('../../../../src/crypto/certificate-service.js', () => ({
  CertificateService: {
    generatePersonalCertificate: vi.fn(),
    generateCompanySeal: vi.fn(),
  },
}));

const mockRequireSession = vi.mocked(clientFactory.requireSession);
const mockOutputSuccess = vi.mocked(output.outputSuccess);
let mockClient: ReturnType<typeof createMockClient>;

beforeEach(() => {
  vi.clearAllMocks();
  mockClient = createMockClient();
  mockRequireSession.mockReturnValue({ client: mockClient as any, session: { ...validSession } });
  vi.mocked(fs.existsSync).mockReturnValue(false);
  vi.mocked(fs.mkdirSync).mockReturnValue(undefined as any);
});

async function runGenerate(args: Record<string, unknown>) {
  return (certCommand.subCommands!.generate as any).run!({ args: { out: '/tmp', cn: 'test', ...args } });
}

async function runEnroll(args: Record<string, unknown>) {
  return (certCommand.subCommands!.enroll as any).run!({ args });
}

async function runRevoke(args: Record<string, unknown>) {
  return (certCommand.subCommands!.revoke as any).run!({ args });
}

describe('cert', () => {
  describe('generate', () => {
    it('throws on invalid type', async () => {
      await expect(runGenerate({ type: 'invalid' })).rejects.toThrow('--type must be');
    });

    it('throws on invalid method', async () => {
      await expect(runGenerate({ type: 'personal', method: 'DSA' })).rejects.toThrow('--method must be');
    });

    it('personal — throws without required fields', async () => {
      await expect(runGenerate({
        type: 'personal', method: 'RSA',
      })).rejects.toThrow('--given-name');
    });

    it('company-seal — throws without required fields', async () => {
      await expect(runGenerate({
        type: 'company-seal', method: 'RSA',
      })).rejects.toThrow('--org');
    });

    it('throws when file exists without --force', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      await expect(runGenerate({
        type: 'personal', method: 'RSA',
        'given-name': 'Jan', surname: 'Kowalski', 'serial-number': '123',
      })).rejects.toThrow('already exists');
    });

    it('happy path — writes cert.pem and key.pem', async () => {
      vi.mocked(CertificateService.generatePersonalCertificate).mockResolvedValue({
        certificatePem: 'CERT', privateKeyPem: 'KEY', fingerprint: 'fp-123',
      });
      await runGenerate({
        type: 'personal', method: 'RSA',
        'given-name': 'Jan', surname: 'Kowalski', 'serial-number': '123',
      });
      expect(fs.writeFileSync).toHaveBeenCalledWith(expect.stringContaining('cert.pem'), 'CERT', 'utf-8');
      expect(fs.writeFileSync).toHaveBeenCalledWith(expect.stringContaining('key.pem'), 'KEY', 'utf-8');
    });
  });

  describe('enroll', () => {
    it('calls certificates.enroll', async () => {
      vi.mocked(fs.readFileSync).mockReturnValue('CERT-PEM' as any);
      mockClient.certificates.enroll.mockResolvedValue({
        referenceNumber: 'ref-1', timestamp: '2024-01-01',
      });
      await runEnroll({ cert: '/cert.pem', name: 'test', type: 'Authentication' });
      expect(mockClient.certificates.enroll).toHaveBeenCalledWith(
        expect.objectContaining({ certificateName: 'test', certificateType: 'Authentication' }),
      );
    });
  });

  describe('revoke', () => {
    it('calls certificates.revoke', async () => {
      await runRevoke({ serial: 'serial-1' });
      expect(mockClient.certificates.revoke).toHaveBeenCalledWith('serial-1', { reason: undefined });
    });
  });
});
