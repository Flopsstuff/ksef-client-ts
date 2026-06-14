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

  it('invoice — outputs JSON result when --json flag is set', async () => {
    const qrResult = { dataUrl: 'data:image/png;base64,...', url: 'https://ksef.mf.gov.pl/verify/123' };
    vi.mocked(QrCodeService.generateResult).mockResolvedValue(qrResult);
    await (qrCommand.subCommands!.invoice as any).run!({
      args: { nip: '1234567890', date: '2024-01-01', hash: 'abc123', json: true },
    });
    expect(QrCodeService.generateResult).toHaveBeenCalledWith('https://ksef.mf.gov.pl/verify/123', { width: 300 });
    expect(vi.mocked(output.outputResult)).toHaveBeenCalledWith(qrResult, { json: true });
  });

  it('invoice — generates SVG without label', async () => {
    vi.mocked(QrCodeService.generateQrCodeSvg).mockResolvedValue('<svg>inv-no-label</svg>');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await (qrCommand.subCommands!.invoice as any).run!({
      args: { nip: '1234567890', date: '2024-01-01', hash: 'abc123', format: 'svg' },
    });
    expect(QrCodeService.generateQrCodeSvg).toHaveBeenCalledWith('https://ksef.mf.gov.pl/verify/123', { width: 300 });
    expect(logSpy).toHaveBeenCalledWith('<svg>inv-no-label</svg>');
    logSpy.mockRestore();
  });

  it('invoice — generates SVG with label', async () => {
    vi.mocked(QrCodeService.generateQrCodeSvgWithLabel).mockResolvedValue('<svg>inv-with-label</svg>');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await (qrCommand.subCommands!.invoice as any).run!({
      args: { nip: '1234567890', date: '2024-01-01', hash: 'abc123', format: 'svg', label: 'Invoice QR' },
    });
    expect(QrCodeService.generateQrCodeSvgWithLabel).toHaveBeenCalledWith(
      'https://ksef.mf.gov.pl/verify/123', 'Invoice QR', { width: 300 },
    );
    logSpy.mockRestore();
  });

  it('invoice — writes SVG to file with --o', async () => {
    vi.mocked(QrCodeService.generateQrCodeSvg).mockResolvedValue('<svg>saved-inv</svg>');
    await (qrCommand.subCommands!.invoice as any).run!({
      args: { nip: '1234567890', date: '2024-01-01', hash: 'abc123', format: 'svg', o: '/inv-out.svg' },
    });
    expect(fs.writeFileSync).toHaveBeenCalledWith('/inv-out.svg', '<svg>saved-inv</svg>');
    expect(vi.mocked(output.outputSuccess)).toHaveBeenCalledWith(expect.stringContaining('/inv-out.svg'));
  });

  it('invoice — writes to file with --o', async () => {
    vi.mocked(QrCodeService.generateQrCode).mockResolvedValue(Buffer.from('png'));
    await (qrCommand.subCommands!.invoice as any).run!({
      args: { nip: '1234567890', date: '2024-01-01', hash: 'abc123', o: '/out.png' },
    });
    expect(fs.writeFileSync).toHaveBeenCalledWith('/out.png', expect.any(Buffer));
  });

  it('certificate — writes PNG to file with --o', async () => {
    vi.mocked(fs.readFileSync).mockReturnValue('KEY-PEM' as any);
    mockClient.qr.buildCertificateVerificationUrl.mockReturnValue('https://ksef.mf.gov.pl/verify/cert');
    vi.mocked(QrCodeService.generateQrCode).mockResolvedValue(Buffer.from('cert-png'));
    await (qrCommand.subCommands!.certificate as any).run!({
      args: {
        'context-type': 'Nip', 'context-id': '123', 'seller-nip': '456',
        'cert-serial': 'serial', hash: 'hash', key: '/key.pem', o: '/cert-out.png',
      },
    });
    expect(fs.writeFileSync).toHaveBeenCalledWith('/cert-out.png', expect.any(Buffer));
    expect(vi.mocked(output.outputSuccess)).toHaveBeenCalledWith(expect.stringContaining('/cert-out.png'));
  });

  describe('certificate — JSON and SVG paths', () => {
    const certArgs = {
      'context-type': 'Nip', 'context-id': '123', 'seller-nip': '456',
      'cert-serial': 'serial', hash: 'hash', key: '/key.pem',
    };

    beforeEach(() => {
      vi.mocked(fs.readFileSync).mockReturnValue('KEY-PEM' as any);
      mockClient.qr.buildCertificateVerificationUrl.mockReturnValue('https://ksef.mf.gov.pl/verify/cert');
    });

    it('outputs JSON result when --json flag is set', async () => {
      const qrResult = { dataUrl: 'data:image/png;base64,...', url: 'https://ksef.mf.gov.pl/verify/cert' };
      vi.mocked(QrCodeService.generateResult).mockResolvedValue(qrResult);
      await (qrCommand.subCommands!.certificate as any).run!({
        args: { ...certArgs, json: true },
      });
      expect(QrCodeService.generateResult).toHaveBeenCalledWith('https://ksef.mf.gov.pl/verify/cert', { width: 300 });
      expect(vi.mocked(output.outputResult)).toHaveBeenCalledWith(qrResult, { json: true });
    });

    it('generates SVG without label', async () => {
      vi.mocked(QrCodeService.generateQrCodeSvg).mockResolvedValue('<svg>no-label</svg>');
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      await (qrCommand.subCommands!.certificate as any).run!({
        args: { ...certArgs, format: 'svg' },
      });
      expect(QrCodeService.generateQrCodeSvg).toHaveBeenCalledWith('https://ksef.mf.gov.pl/verify/cert', { width: 300 });
      expect(logSpy).toHaveBeenCalledWith('<svg>no-label</svg>');
      logSpy.mockRestore();
    });

    it('generates SVG with label', async () => {
      vi.mocked(QrCodeService.generateQrCodeSvgWithLabel).mockResolvedValue('<svg>with-label</svg>');
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      await (qrCommand.subCommands!.certificate as any).run!({
        args: { ...certArgs, format: 'svg', label: 'My Label' },
      });
      expect(QrCodeService.generateQrCodeSvgWithLabel).toHaveBeenCalledWith(
        'https://ksef.mf.gov.pl/verify/cert', 'My Label', { width: 300 },
      );
      expect(logSpy).toHaveBeenCalledWith('<svg>with-label</svg>');
      logSpy.mockRestore();
    });

    it('writes SVG to file with --o', async () => {
      vi.mocked(QrCodeService.generateQrCodeSvg).mockResolvedValue('<svg>saved</svg>');
      await (qrCommand.subCommands!.certificate as any).run!({
        args: { ...certArgs, format: 'svg', o: '/out.svg' },
      });
      expect(fs.writeFileSync).toHaveBeenCalledWith('/out.svg', '<svg>saved</svg>');
      expect(vi.mocked(output.outputSuccess)).toHaveBeenCalledWith(expect.stringContaining('/out.svg'));
    });

    it('outputs PNG base64 to console when no --o', async () => {
      vi.mocked(QrCodeService.generateQrCode).mockResolvedValue(Buffer.from('cert-png-data'));
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      await (qrCommand.subCommands!.certificate as any).run!({
        args: { ...certArgs },
      });
      expect(logSpy).toHaveBeenCalledWith(Buffer.from('cert-png-data').toString('base64'));
      logSpy.mockRestore();
    });
  });

  describe('url', () => {
    it('prints verification URL to console', async () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      await (qrCommand.subCommands!.url as any).run!({
        args: { nip: '1234567890', date: '2024-01-01', hash: 'abc123' },
      });
      expect(mockClient.qr.buildInvoiceVerificationUrl).toHaveBeenCalledWith('1234567890', '2024-01-01', 'abc123');
      expect(logSpy).toHaveBeenCalledWith('https://ksef.mf.gov.pl/verify/123');
      logSpy.mockRestore();
    });

    it('outputs JSON when --json flag is set', async () => {
      await (qrCommand.subCommands!.url as any).run!({
        args: { nip: '1234567890', date: '2024-01-01', hash: 'abc123', json: true },
      });
      expect(vi.mocked(output.outputResult)).toHaveBeenCalledWith(
        { url: 'https://ksef.mf.gov.pl/verify/123' },
        { json: true },
      );
    });
  });
});
