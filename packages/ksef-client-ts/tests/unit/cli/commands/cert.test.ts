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
  mockRequireSession.mockResolvedValue({ client: mockClient as any, session: { ...validSession } });
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

    it('throws when key.pem exists without --force', async () => {
      vi.mocked(fs.existsSync).mockImplementation((p: any) => {
        return String(p).endsWith('key.pem');
      });
      await expect(runGenerate({
        type: 'personal', method: 'RSA',
        'given-name': 'Jan', surname: 'Kowalski', 'serial-number': '123',
      })).rejects.toThrow('already exists');
    });

    it('company-seal happy path — writes cert.pem and key.pem', async () => {
      vi.mocked(CertificateService.generateCompanySeal).mockResolvedValue({
        certificatePem: 'COMPANY-CERT', privateKeyPem: 'COMPANY-KEY', fingerprint: 'fp-company',
      });
      await runGenerate({
        type: 'company-seal', method: 'ECDSA',
        org: 'ACME Corp', 'org-identifier': 'ORG-123',
      });
      expect(CertificateService.generateCompanySeal).toHaveBeenCalledWith('ACME Corp', 'ORG-123', 'test', 'ECDSA');
      expect(fs.writeFileSync).toHaveBeenCalledWith(expect.stringContaining('cert.pem'), 'COMPANY-CERT', 'utf-8');
      expect(fs.writeFileSync).toHaveBeenCalledWith(expect.stringContaining('key.pem'), 'COMPANY-KEY', 'utf-8');
    });

    it('outputs JSON when --json is set', async () => {
      vi.mocked(CertificateService.generatePersonalCertificate).mockResolvedValue({
        certificatePem: 'CERT', privateKeyPem: 'KEY', fingerprint: 'fp-json',
      });
      await runGenerate({
        type: 'personal', method: 'RSA',
        'given-name': 'Jan', surname: 'Kowalski', 'serial-number': '123',
        json: true,
      });
      expect(output.outputResult).toHaveBeenCalledWith(
        expect.objectContaining({ fingerprint: 'fp-json' }),
        { json: true },
      );
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

    it('outputs JSON when --json is set', async () => {
      vi.mocked(fs.readFileSync).mockReturnValue('CERT-PEM' as any);
      const enrollResult = { referenceNumber: 'ref-1', timestamp: '2024-01-01' };
      mockClient.certificates.enroll.mockResolvedValue(enrollResult);
      await runEnroll({ cert: '/cert.pem', name: 'test', type: 'Authentication', json: true });
      expect(output.outputResult).toHaveBeenCalledWith(enrollResult, { json: true });
    });

    it('outputs success with key-value when --json is not set', async () => {
      vi.mocked(fs.readFileSync).mockReturnValue('CERT-PEM' as any);
      mockClient.certificates.enroll.mockResolvedValue({
        referenceNumber: 'ref-1', timestamp: '2024-01-01',
      });
      await runEnroll({ cert: '/cert.pem', name: 'test', type: 'Authentication' });
      expect(mockOutputSuccess).toHaveBeenCalledWith('Certificate enrollment submitted.');
      expect(output.outputKeyValue).toHaveBeenCalledWith(
        { 'Reference': 'ref-1', 'Timestamp': '2024-01-01' },
        { json: false },
      );
    });
  });

  describe('revoke', () => {
    it('calls certificates.revoke', async () => {
      await runRevoke({ serial: 'serial-1' });
      expect(mockClient.certificates.revoke).toHaveBeenCalledWith('serial-1', { revocationReason: null });
    });
  });

  describe('status', () => {
    async function runStatus(args: Record<string, unknown>) {
      return (certCommand.subCommands!.status as any).run!({ args });
    }

    it('outputs status as JSON when --json is set', async () => {
      const statusResult = {
        status: { code: 200, description: 'Enrolled' },
        certificateSerialNumber: 'SN-456',
      };
      mockClient.certificates.getEnrollmentStatus.mockResolvedValue(statusResult);
      await runStatus({ ref: 'ref-123', json: true });
      expect(mockClient.certificates.getEnrollmentStatus).toHaveBeenCalledWith('ref-123');
      expect(output.outputResult).toHaveBeenCalledWith(statusResult, { json: true });
    });

    it('outputs key-value with certificate serial when present', async () => {
      const statusResult = {
        status: { code: 200, description: 'Enrolled' },
        certificateSerialNumber: 'SN-456',
      };
      mockClient.certificates.getEnrollmentStatus.mockResolvedValue(statusResult);
      await runStatus({ ref: 'ref-123' });
      expect(output.outputKeyValue).toHaveBeenCalledWith(
        expect.objectContaining({
          'Reference': 'ref-123',
          'Status Code': 200,
          'Description': 'Enrolled',
          'Certificate Serial': 'SN-456',
        }),
        { json: false },
      );
    });

    it('outputs key-value without certificate serial when absent', async () => {
      const statusResult = {
        status: { code: 100, description: 'Pending' },
      };
      mockClient.certificates.getEnrollmentStatus.mockResolvedValue(statusResult);
      await runStatus({ ref: 'ref-999' });
      const kvArg = vi.mocked(output.outputKeyValue).mock.calls[0][0] as Record<string, unknown>;
      expect(kvArg).not.toHaveProperty('Certificate Serial');
      expect(kvArg['Reference']).toBe('ref-999');
    });
  });

  describe('revoke — additional paths', () => {
    it('outputs JSON when --json is set', async () => {
      await runRevoke({ serial: 'serial-1', json: true });
      expect(output.outputResult).toHaveBeenCalledWith(
        { status: 'revoked', serialNumber: 'serial-1' },
        { json: true },
      );
    });

    it('passes revocationReason when provided', async () => {
      await runRevoke({ serial: 'serial-2', revocationReason: 'KeyCompromise' });
      expect(mockClient.certificates.revoke).toHaveBeenCalledWith('serial-2', {
        revocationReason: 'KeyCompromise',
      });
    });

    it('outputs success message when --json is not set', async () => {
      await runRevoke({ serial: 'serial-3' });
      expect(mockOutputSuccess).toHaveBeenCalledWith('Certificate serial-3 revoked.');
    });
  });

  describe('limits', () => {
    async function runLimits(args: Record<string, unknown> = {}) {
      return (certCommand.subCommands!.limits as any).run!({ args });
    }

    it('outputs limits as JSON when --json is set', async () => {
      const limitsResult = {
        canRequest: true,
        enrollment: { limit: 10, remaining: 5 },
        certificate: { limit: 20, remaining: 15 },
      };
      mockClient.certificates.getLimits.mockResolvedValue(limitsResult);
      await runLimits({ json: true });
      expect(mockClient.certificates.getLimits).toHaveBeenCalled();
      expect(output.outputResult).toHaveBeenCalledWith(limitsResult, { json: true });
    });

    it('outputs key-value when canRequest is true', async () => {
      const limitsResult = {
        canRequest: true,
        enrollment: { limit: 10, remaining: 5 },
        certificate: { limit: 20, remaining: 15 },
      };
      mockClient.certificates.getLimits.mockResolvedValue(limitsResult);
      await runLimits();
      expect(output.outputKeyValue).toHaveBeenCalledWith(
        {
          'Can Request': 'Yes',
          'Enrollment Limit': 10,
          'Enrollment Remaining': 5,
          'Certificate Limit': 20,
          'Certificate Remaining': 15,
        },
        { json: false },
      );
    });

    it('outputs key-value when canRequest is false', async () => {
      const limitsResult = {
        canRequest: false,
        enrollment: { limit: 0, remaining: 0 },
        certificate: { limit: 0, remaining: 0 },
      };
      mockClient.certificates.getLimits.mockResolvedValue(limitsResult);
      await runLimits();
      expect(output.outputKeyValue).toHaveBeenCalledWith(
        expect.objectContaining({ 'Can Request': 'No' }),
        { json: false },
      );
    });
  });

  describe('list', () => {
    async function runList(args: Record<string, unknown> = {}) {
      return (certCommand.subCommands!.list as any).run!({ args });
    }

    it('outputs JSON when --json is set', async () => {
      const listResult = {
        certificates: [
          { certificateSerialNumber: 'SN-1', name: 'Cert1', type: 'Authentication', status: 'Active', validFrom: '2024-01-01', validTo: '2025-01-01' },
        ],
        hasMore: false,
      };
      mockClient.certificates.query.mockResolvedValue(listResult);
      await runList({ json: true });
      expect(output.outputResult).toHaveBeenCalledWith(listResult, { json: true });
    });

    it('outputs warning when no certificates found', async () => {
      mockClient.certificates.query.mockResolvedValue({ certificates: [], hasMore: false });
      await runList();
      expect(output.outputWarning).toHaveBeenCalledWith('No certificates found.');
    });

    it('outputs table with certificate data', async () => {
      const listResult = {
        certificates: [
          { certificateSerialNumber: 'SN-1', name: 'Cert1', type: 'Authentication', status: 'Active', validFrom: '2024-01-01', validTo: '2025-01-01' },
          { certificateSerialNumber: 'SN-2', name: 'Cert2', type: 'Offline', status: 'Revoked', validFrom: '2023-01-01', validTo: '2024-01-01' },
        ],
        hasMore: false,
      };
      mockClient.certificates.query.mockResolvedValue(listResult);
      await runList();
      expect(output.outputTable).toHaveBeenCalledWith(
        [
          { serial: 'SN-1', name: 'Cert1', type: 'Authentication', status: 'Active', validFrom: '2024-01-01', validTo: '2025-01-01' },
          { serial: 'SN-2', name: 'Cert2', type: 'Offline', status: 'Revoked', validFrom: '2023-01-01', validTo: '2024-01-01' },
        ],
        expect.arrayContaining([
          expect.objectContaining({ key: 'serial', label: 'Serial' }),
          expect.objectContaining({ key: 'name', label: 'Name' }),
          expect.objectContaining({ key: 'type', label: 'Type' }),
          expect.objectContaining({ key: 'status', label: 'Status' }),
          expect.objectContaining({ key: 'validFrom', label: 'Valid From' }),
          expect.objectContaining({ key: 'validTo', label: 'Valid To' }),
        ]),
        { json: false },
      );
    });

    it('shows pagination hint when hasMore is true', async () => {
      const { consola } = await import('consola');
      const listResult = {
        certificates: [
          { certificateSerialNumber: 'SN-1', name: 'Cert1', type: 'Authentication', status: 'Active', validFrom: '2024-01-01', validTo: '2025-01-01' },
        ],
        hasMore: true,
      };
      mockClient.certificates.query.mockResolvedValue(listResult);
      await runList();
      expect(consola.info).toHaveBeenCalledWith('More results available. Use --page to paginate.');
    });

    it('passes filter and pagination parameters', async () => {
      mockClient.certificates.query.mockResolvedValue({ certificates: [], hasMore: false });
      await runList({
        serial: 'SN-filter',
        name: 'test-cert',
        type: 'Authentication',
        status: 'Active',
        'expires-after': '2025-01-01',
        page: '2',
        'page-size': '10',
      });
      expect(mockClient.certificates.query).toHaveBeenCalledWith(
        {
          certificateSerialNumber: 'SN-filter',
          name: 'test-cert',
          type: 'Authentication',
          status: 'Active',
          expiresAfter: '2025-01-01',
        },
        10,
        2,
      );
    });
  });

  describe('enrollment-data', () => {
    async function runEnrollmentData(args: Record<string, unknown>) {
      return (certCommand.subCommands!['enrollment-data'] as any).run!({ args });
    }

    it('outputs enrollment data as JSON when --json is set', async () => {
      const enrollmentResult = {
        commonName: 'CN-test',
        countryName: 'PL',
        givenName: 'Jan',
        surname: 'Kowalski',
        serialNumber: 'SN-123',
        uniqueIdentifier: 'UID-456',
        organizationName: 'Org',
        organizationIdentifier: 'OrgId',
      };
      mockClient.certificates.getEnrollmentData.mockResolvedValue(enrollmentResult);

      await runEnrollmentData({ json: true });

      expect(mockClient.certificates.getEnrollmentData).toHaveBeenCalled();
      expect(output.outputResult).toHaveBeenCalledWith(enrollmentResult, { json: true });
    });

    it('outputs enrollment data as key-value when --json is not set', async () => {
      const enrollmentResult = {
        commonName: 'CN-test',
        countryName: 'PL',
        givenName: 'Jan',
        surname: 'Kowalski',
        serialNumber: 'SN-123',
        uniqueIdentifier: 'UID-456',
        organizationName: 'Org',
        organizationIdentifier: 'OrgId',
      };
      mockClient.certificates.getEnrollmentData.mockResolvedValue(enrollmentResult);

      await runEnrollmentData({});

      expect(output.outputKeyValue).toHaveBeenCalledWith(
        expect.objectContaining({
          'Common Name': 'CN-test',
          'Country': 'PL',
          'Given Name': 'Jan',
          'Surname': 'Kowalski',
          'Serial Number': 'SN-123',
          'Unique Identifier': 'UID-456',
          'Organization': 'Org',
          'Organization ID': 'OrgId',
        }),
        { json: false },
      );
    });

    it('omits missing fields in key-value output', async () => {
      mockClient.certificates.getEnrollmentData.mockResolvedValue({
        commonName: 'CN-only',
      });

      await runEnrollmentData({});

      expect(output.outputKeyValue).toHaveBeenCalledWith(
        { 'Common Name': 'CN-only' },
        { json: false },
      );
    });
  });

  describe('retrieve', () => {
    async function runRetrieve(args: Record<string, unknown>) {
      return (certCommand.subCommands!.retrieve as any).run!({ args });
    }

    it('throws when no serial numbers provided', async () => {
      await expect(runRetrieve({ serial: '' })).rejects.toThrow('Provide at least one serial number');
    });

    it('outputs results as JSON when --json is set', async () => {
      const retrieveResult = {
        certificates: [
          { certificateSerialNumber: 'SN-1', certificateName: 'Cert1', certificateType: 'Authentication' },
        ],
      };
      mockClient.certificates.retrieve.mockResolvedValue(retrieveResult);

      await runRetrieve({ serial: 'SN-1', json: true });

      expect(mockClient.certificates.retrieve).toHaveBeenCalledWith({ certificateSerialNumbers: ['SN-1'] });
      expect(output.outputResult).toHaveBeenCalledWith(retrieveResult, { json: true });
    });

    it('outputs warning when no certificates found', async () => {
      mockClient.certificates.retrieve.mockResolvedValue({ certificates: [] });

      await runRetrieve({ serial: 'SN-missing' });

      expect(output.outputWarning).toHaveBeenCalledWith('No certificates found.');
    });

    it('outputs table with certificate data', async () => {
      const retrieveResult = {
        certificates: [
          { certificateSerialNumber: 'SN-1', certificateName: 'Cert1', certificateType: 'Authentication' },
          { certificateSerialNumber: 'SN-2', certificateName: 'Cert2', certificateType: 'Offline' },
        ],
      };
      mockClient.certificates.retrieve.mockResolvedValue(retrieveResult);

      await runRetrieve({ serial: 'SN-1,SN-2' });

      expect(mockClient.certificates.retrieve).toHaveBeenCalledWith({ certificateSerialNumbers: ['SN-1', 'SN-2'] });
      expect(output.outputTable).toHaveBeenCalledWith(
        [
          { serial: 'SN-1', name: 'Cert1', type: 'Authentication' },
          { serial: 'SN-2', name: 'Cert2', type: 'Offline' },
        ],
        expect.arrayContaining([
          expect.objectContaining({ key: 'serial', label: 'Serial' }),
          expect.objectContaining({ key: 'name', label: 'Name' }),
          expect.objectContaining({ key: 'type', label: 'Type' }),
        ]),
        { json: false },
      );
    });
  });
});
