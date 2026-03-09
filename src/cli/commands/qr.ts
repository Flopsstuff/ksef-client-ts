import * as fs from 'node:fs';
import { defineCommand } from 'citty';
import { createClient } from '../client-factory.js';
import { outputResult, outputSuccess } from '../output.js';
import { withErrorHandler } from '../error-handler.js';
import type { GlobalOptions } from '../types.js';
import { QrCodeService } from '../../qr/qrcode-service.js';

function getGlobalOpts(args: Record<string, unknown>): GlobalOptions {
  return {
    env: args.env as string | undefined,
    json: args.json as boolean | undefined,
    verbose: args.verbose as boolean | undefined,
    timeout: args.timeout as string | undefined,
    nip: args.nip as string | undefined,
  };
}

const invoice = defineCommand({
  meta: { name: 'invoice', description: 'Generate invoice QR code' },
  args: {
    nip: { type: 'string', description: 'NIP number', required: true },
    date: { type: 'string', description: 'Invoice issue date (ISO date string)', required: true },
    hash: { type: 'string', description: 'Invoice hash (base64)', required: true },
    format: { type: 'string', description: 'Output format: png or svg (default: png)' },
    size: { type: 'string', description: 'QR code size in pixels (default: 300)' },
    label: { type: 'string', description: 'Label text (SVG only)' },
    o: { type: 'string', description: 'Output file path' },
    env: { type: 'string', description: 'Environment (test/demo/prod)' },
    json: { type: 'boolean', description: 'Output as JSON' },
    verbose: { type: 'boolean', description: 'Show HTTP request/response details' },
    timeout: { type: 'string', description: 'Request timeout (ms)' },
  },
  run({ args }) {
    return withErrorHandler(async () => {
      const globalOpts = getGlobalOpts(args);
      const client = createClient(globalOpts);
      const size = args.size ? parseInt(args.size, 10) : 300;
      const format = args.format ?? 'png';

      const url = client.qr.buildInvoiceVerificationUrl(args.nip, args.date, args.hash);

      if (args.json) {
        const result = await QrCodeService.generateResult(url, { width: size });
        outputResult(result, { json: true });
        return;
      }

      if (format === 'svg') {
        const svg = args.label
          ? await QrCodeService.generateQrCodeSvgWithLabel(url, args.label, { width: size })
          : await QrCodeService.generateQrCodeSvg(url, { width: size });

        if (args.o) {
          fs.writeFileSync(args.o, svg);
          outputSuccess(`QR code saved to ${args.o}\nURL: ${url}`);
        } else {
          console.log(svg);
        }
      } else {
        const buffer = await QrCodeService.generateQrCode(url, { width: size });

        if (args.o) {
          fs.writeFileSync(args.o, buffer);
          outputSuccess(`QR code saved to ${args.o}\nURL: ${url}`);
        } else {
          console.log(buffer.toString('base64'));
        }
      }
    });
  },
});

const certificate = defineCommand({
  meta: { name: 'certificate', description: 'Generate certificate QR code' },
  args: {
    'context-type': { type: 'string', description: 'Context identifier type', required: true },
    'context-id': { type: 'string', description: 'Context identifier value', required: true },
    'seller-nip': { type: 'string', description: 'Seller NIP number', required: true },
    'cert-serial': { type: 'string', description: 'Certificate serial number', required: true },
    hash: { type: 'string', description: 'Certificate hash (base64)', required: true },
    key: { type: 'string', description: 'Path to PEM private key file', required: true },
    format: { type: 'string', description: 'Output format: png or svg (default: png)' },
    size: { type: 'string', description: 'QR code size in pixels (default: 300)' },
    label: { type: 'string', description: 'Label text (SVG only)' },
    o: { type: 'string', description: 'Output file path' },
    env: { type: 'string', description: 'Environment (test/demo/prod)' },
    json: { type: 'boolean', description: 'Output as JSON' },
    verbose: { type: 'boolean', description: 'Show HTTP request/response details' },
    timeout: { type: 'string', description: 'Request timeout (ms)' },
    nip: { type: 'string', description: 'NIP number' },
  },
  run({ args }) {
    return withErrorHandler(async () => {
      const globalOpts = getGlobalOpts(args);
      const client = createClient(globalOpts);
      const size = args.size ? parseInt(args.size, 10) : 300;
      const format = args.format ?? 'png';

      const privateKeyPem = fs.readFileSync(args.key, 'utf-8');

      const url = client.qr.buildCertificateVerificationUrl(
        args['context-type'],
        args['context-id'],
        args['seller-nip'],
        args['cert-serial'],
        args.hash,
        privateKeyPem,
      );

      if (args.json) {
        const result = await QrCodeService.generateResult(url, { width: size });
        outputResult(result, { json: true });
        return;
      }

      if (format === 'svg') {
        const svg = args.label
          ? await QrCodeService.generateQrCodeSvgWithLabel(url, args.label, { width: size })
          : await QrCodeService.generateQrCodeSvg(url, { width: size });

        if (args.o) {
          fs.writeFileSync(args.o, svg);
          outputSuccess(`QR code saved to ${args.o}\nURL: ${url}`);
        } else {
          console.log(svg);
        }
      } else {
        const buffer = await QrCodeService.generateQrCode(url, { width: size });

        if (args.o) {
          fs.writeFileSync(args.o, buffer);
          outputSuccess(`QR code saved to ${args.o}\nURL: ${url}`);
        } else {
          console.log(buffer.toString('base64'));
        }
      }
    });
  },
});

const url = defineCommand({
  meta: { name: 'url', description: 'Print invoice verification URL (no QR image)' },
  args: {
    nip: { type: 'string', description: 'NIP number', required: true },
    date: { type: 'string', description: 'Invoice issue date (ISO date string)', required: true },
    hash: { type: 'string', description: 'Invoice hash (base64)', required: true },
    env: { type: 'string', description: 'Environment (test/demo/prod)' },
    json: { type: 'boolean', description: 'Output as JSON' },
    verbose: { type: 'boolean', description: 'Show HTTP request/response details' },
    timeout: { type: 'string', description: 'Request timeout (ms)' },
  },
  run({ args }) {
    return withErrorHandler(async () => {
      const globalOpts = getGlobalOpts(args);
      const client = createClient(globalOpts);

      const verificationUrl = client.qr.buildInvoiceVerificationUrl(args.nip, args.date, args.hash);

      if (args.json) {
        outputResult({ url: verificationUrl }, { json: true });
      } else {
        console.log(verificationUrl);
      }
    });
  },
});

export const qrCommand = defineCommand({
  meta: { name: 'qr', description: 'QR code generation commands' },
  subCommands: { invoice, certificate, url },
});
