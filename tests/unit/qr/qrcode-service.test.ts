import { describe, it, expect } from 'vitest';
import { QrCodeService } from '../../../src/qr/qrcode-service.js';

const TEST_URL = 'https://qr-test.ksef.mf.gov.pl/invoice/1234567890/15-01-2024/dGVzdA';

describe('QrCodeService', () => {
  describe('generateQrCode', () => {
    it('should return a Buffer with PNG magic bytes', async () => {
      const buffer = await QrCodeService.generateQrCode(TEST_URL);

      expect(buffer).toBeInstanceOf(Buffer);
      // PNG magic bytes: 89 50 4E 47
      expect(buffer[0]).toBe(0x89);
      expect(buffer[1]).toBe(0x50);
      expect(buffer[2]).toBe(0x4e);
      expect(buffer[3]).toBe(0x47);
    });
  });

  describe('generateQrCodeBase64', () => {
    it('should return base64 string starting with iVBOR (PNG header)', async () => {
      const base64 = await QrCodeService.generateQrCodeBase64(TEST_URL);

      expect(typeof base64).toBe('string');
      expect(base64.startsWith('iVBOR')).toBe(true);
    });
  });

  describe('generateQrCodeSvg', () => {
    it('should return SVG string', async () => {
      const svg = await QrCodeService.generateQrCodeSvg(TEST_URL);

      expect(svg).toContain('<svg');
      expect(svg).toContain('</svg>');
    });

    it('should contain viewBox attribute', async () => {
      const svg = await QrCodeService.generateQrCodeSvg(TEST_URL);

      expect(svg).toMatch(/viewBox="\d+ \d+ \d+ \d+"/);
    });
  });

  describe('generateQrCodeSvgWithLabel', () => {
    it('should contain label text in <text> element', async () => {
      const label = 'Invoice QR Code';
      const svg = await QrCodeService.generateQrCodeSvgWithLabel(TEST_URL, label);

      expect(svg).toContain('<svg');
      expect(svg).toContain('</svg>');
      expect(svg).toContain('<text');
      expect(svg).toContain(label);
    });

    it('should escape XML special characters in label', async () => {
      const label = 'Test <&> "Label"';
      const svg = await QrCodeService.generateQrCodeSvgWithLabel(TEST_URL, label);

      expect(svg).toContain('&lt;&amp;&gt;');
      expect(svg).toContain('&quot;Label&quot;');
    });

    it('should have an adjusted viewBox height for the label', async () => {
      const svgWithout = await QrCodeService.generateQrCodeSvg(TEST_URL);
      const svgWith = await QrCodeService.generateQrCodeSvgWithLabel(TEST_URL, 'Label');

      const vbWithout = svgWithout.match(/viewBox="\d+ \d+ (\d+(?:\.\d+)?) (\d+(?:\.\d+)?)"/);
      const vbWith = svgWith.match(/viewBox="\d+ \d+ (\d+(?:\.\d+)?) (\d+(?:\.\d+)?)"/);

      expect(vbWithout).not.toBeNull();
      expect(vbWith).not.toBeNull();
      // viewBox height should be larger when label is present
      expect(parseFloat(vbWith![2])).toBeGreaterThan(parseFloat(vbWithout![2]));
    });
  });

  describe('generateResult', () => {
    it('should return QrCodeResult with url and qrCode', async () => {
      const result = await QrCodeService.generateResult(TEST_URL);

      expect(result.url).toBe(TEST_URL);
      expect(typeof result.qrCode).toBe('string');
      expect(result.qrCode.startsWith('iVBOR')).toBe(true);
    });
  });

  describe('custom options', () => {
    it('should accept custom width, margin, and errorCorrectionLevel', async () => {
      const buffer = await QrCodeService.generateQrCode(TEST_URL, {
        width: 500,
        margin: 4,
        errorCorrectionLevel: 'H',
      });

      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer[0]).toBe(0x89); // still PNG
    });
  });
});
