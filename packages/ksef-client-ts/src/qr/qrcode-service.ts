import * as QRCode from 'qrcode';
import type { QrCodeOptions, QrCodeResult } from '../models/qrcode/types.js';

export class QrCodeService {
  static async generateQrCode(url: string, options?: QrCodeOptions): Promise<Buffer> {
    return QRCode.toBuffer(url, {
      width: options?.width ?? 300,
      margin: options?.margin ?? 2,
      errorCorrectionLevel: options?.errorCorrectionLevel ?? 'M',
    });
  }

  static async generateQrCodeBase64(url: string, options?: QrCodeOptions): Promise<string> {
    const buffer = await QrCodeService.generateQrCode(url, options);
    return buffer.toString('base64');
  }

  static async generateQrCodeSvg(url: string, options?: QrCodeOptions): Promise<string> {
    return QRCode.toString(url, {
      type: 'svg',
      width: options?.width ?? 300,
      margin: options?.margin ?? 2,
      errorCorrectionLevel: options?.errorCorrectionLevel ?? 'M',
    });
  }

  static async generateQrCodeSvgWithLabel(
    url: string,
    label: string,
    options?: QrCodeOptions,
  ): Promise<string> {
    const svg = await QrCodeService.generateQrCodeSvg(url, options);

    // The qrcode library outputs SVG with viewBox in module units (e.g. "0 0 25 25")
    // and width/height in pixels (e.g. width="300" height="300").
    // We need to adjust both to accommodate the label.
    const viewBoxMatch = svg.match(/viewBox="(\d+)\s+(\d+)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)"/);
    const heightMatch = svg.match(/height="(\d+)"/);

    if (!viewBoxMatch || !heightMatch) {
      // Fallback: just append text before closing tag
      return svg.replace(
        '</svg>',
        `<text x="50%" y="95%" text-anchor="middle" font-family="Arial, sans-serif" font-size="14">${escapeXml(label)}</text></svg>`,
      );
    }

    const vbWidth = parseFloat(viewBoxMatch[3]!);
    const vbHeight = parseFloat(viewBoxMatch[4]!);
    const pixelHeight = parseInt(heightMatch[1]!, 10);

    // Add label space in viewBox units (proportional to viewBox size)
    const labelVbHeight = vbHeight * 0.12; // ~12% of QR height for label
    const newVbHeight = vbHeight + labelVbHeight;

    // Scale pixel height proportionally
    const newPixelHeight = Math.round(pixelHeight * (newVbHeight / vbHeight));

    const labelledSvg = svg
      .replace(
        /viewBox="(\d+)\s+(\d+)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)"/,
        `viewBox="${viewBoxMatch[1]} ${viewBoxMatch[2]} ${vbWidth} ${newVbHeight}"`,
      )
      .replace(
        /height="\d+"/,
        `height="${newPixelHeight}"`,
      )
      .replace(
        '</svg>',
        `<text x="${vbWidth / 2}" y="${vbHeight + labelVbHeight * 0.75}" text-anchor="middle" font-family="Arial, sans-serif" font-size="${vbHeight * 0.06}">${escapeXml(label)}</text></svg>`,
      );

    return labelledSvg;
  }

  static async generateResult(url: string, options?: QrCodeOptions): Promise<QrCodeResult> {
    const qrCode = await QrCodeService.generateQrCodeBase64(url, options);
    return { url, qrCode };
  }
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
