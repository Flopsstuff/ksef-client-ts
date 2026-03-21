import { describe, it, expect, vi, beforeEach } from 'vitest';
import { qrCommand } from '../../../../src/cli/commands/qr.js';
import * as clientFactory from '../../../../src/cli/client-factory.js';
import * as output from '../../../../src/cli/output.js';
import * as fs from 'node:fs';
import { QrCodeService } from '../../../../src/qr/qrcode-service.js';
import { createMockClient } from './_helpers.js';

vi.mock('consola', () => ({ consola: { level: 0 } }));
vi.mock('../../../../src/cli/error-handler.js', () => ({
  withErrorHandler: vi.fn((fn) => fn()),
}));
vi.mock('../../../../src/cli/client-factory.js', () => ({
  createClient: vi.fn(),
}));
vi.mock('../../../../src/cli/config-store.js', () => ({
  loadConfig: vi.fn().mockReturnValue({ environment: 'test', output: 'pretty', timeout: 30000 }),
}));
vi.mock('../../../../src/cli/output.js', () => ({
  outputResult: vi.fn(),
  outputSuccess: vi.fn(),
  outputKeyValue: vi.fn(),
  outputTable: vi.fn(),
  outputWarning: vi.fn(),
}));
vi.mock('node:fs', () => ({
  writeFileSync: vi.fn(),
  readFileSync: vi.fn(),
  default: { writeFileSync: vi.fn(), readFileSync: vi.fn() },
}));
vi.mock('../../../../src/qr/qrcode-service.js', () => ({
  QrCodeService: {
    generateQrCode: vi.fn(),
    generateQrCodeSvg: vi.fn(),
    generateQrCodeSvgWithLabel: vi.fn(),
    generateResult: vi.fn(),
  },
}));

const mockCreateClient = vi.mocked(clientFactory.createClient);
let mockClient: ReturnType<typeof createMockClient>;

beforeEach(() => {
  vi.clearAllMocks();
  mockClient = createMockClient();
  mockCreateClient.mockReturnValue(mockClient as any);
  mockClient.qr.buildInvoiceVerificationUrl.mockReturnValue('https://ksef.mf.gov.pl/verify/123');
});

describe('qr', () => {
  it('invoice — builds URL and generates QR code', async () => {
    vi.mocked(QrCodeService.generateQrCode).mockResolvedValue(Buffer.from('png'));
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await (qrCommand.subCommands!.invoice as any).run!({
      args: { nip: '1234567890', date: '2024-01-01', hash: 'abc123' },
    });
    expect(mockClient.qr.buildInvoiceVerificationUrl).toHaveBeenCalledWith('1234567890', '2024-01-01', 'abc123');
    logSpy.mockRestore();
  });

  it('certificate — reads key and builds URL', async () => {
    vi.mocked(fs.readFileSync).mockReturnValue('KEY-PEM' as any);
    mockClient.qr.buildCertificateVerificationUrl.mockReturnValue('https://ksef.mf.gov.pl/verify/cert');
    vi.mocked(QrCodeService.generateQrCode).mockResolvedValue(Buffer.from('png'));
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await (qrCommand.subCommands!.certificate as any).run!({
      args: {
        'context-type': 'Nip', 'context-id': '123', 'seller-nip': '456',
        'cert-serial': 'serial', hash: 'hash', key: '/key.pem',
      },
    });
    expect(mockClient.qr.buildCertificateVerificationUrl).toHaveBeenCalled();
    logSpy.mockRestore();
  });

  it('invoice — writes to file with --o', async () => {
    vi.mocked(QrCodeService.generateQrCode).mockResolvedValue(Buffer.from('png'));
    await (qrCommand.subCommands!.invoice as any).run!({
      args: { nip: '1234567890', date: '2024-01-01', hash: 'abc123', o: '/out.png' },
    });
    expect(fs.writeFileSync).toHaveBeenCalledWith('/out.png', expect.any(Buffer));
  });
});
