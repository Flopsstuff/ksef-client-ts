import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { FIXTURE_DIR } from './env.js';
import type { KSeFClient } from '../../../src/client.js';
import type { SendInvoiceRequest } from '../../../src/models/sessions/online-types.js';
import type { FormCode } from '../../../src/models/common.js';

export type InvoiceFormVersion = 'FA_2' | 'FA_3';

export interface InvoicePlaceholders {
  nip: string;
  invoicingDate?: string;
  invoiceNumber?: string;
}

const TEMPLATE_FILES: Record<InvoiceFormVersion, string> = {
  FA_2: 'invoice-fa2.xml',
  FA_3: 'invoice-fa3.xml',
};

function todayString(): string {
  return new Date().toISOString().slice(0, 10);
}

export function loadInvoiceTemplate(version: InvoiceFormVersion): string {
  return readFileSync(join(FIXTURE_DIR, TEMPLATE_FILES[version]), 'utf-8');
}

export function prepareInvoiceXml(
  version: InvoiceFormVersion,
  placeholders: InvoicePlaceholders,
): string {
  let xml = loadInvoiceTemplate(version);
  xml = xml.replace(/#nip#/g, placeholders.nip);
  xml = xml.replace(/#invoicing_date#/g, placeholders.invoicingDate ?? todayString());
  xml = xml.replace(/#invoice_number#/g, placeholders.invoiceNumber ?? randomUUID());
  return xml;
}

export function getFormCode(version: InvoiceFormVersion): FormCode {
  switch (version) {
    case 'FA_2':
      return { systemCode: 'FA (2)', schemaVersion: '1-0E', value: 'FA' };
    case 'FA_3':
      return { systemCode: 'FA (3)', schemaVersion: '1-0E', value: 'FA' };
  }
}

export function prepareAndEncryptInvoice(
  client: KSeFClient,
  version: InvoiceFormVersion,
  nip: string,
  cipherKey: Uint8Array,
  cipherIv: Uint8Array,
): { invoiceXml: string; sendRequest: SendInvoiceRequest } {
  const invoiceXml = prepareInvoiceXml(version, { nip });
  const plainBytes = new TextEncoder().encode(invoiceXml);
  const encryptedBytes = client.crypto.encryptAES256(plainBytes, cipherKey, cipherIv);

  const plainMeta = client.crypto.getFileMetadata(plainBytes);
  const encryptedMeta = client.crypto.getFileMetadata(encryptedBytes);

  return {
    invoiceXml,
    sendRequest: {
      invoiceHash: plainMeta.hashSHA,
      invoiceSize: plainMeta.fileSize,
      encryptedInvoiceHash: encryptedMeta.hashSHA,
      encryptedInvoiceSize: encryptedMeta.fileSize,
      encryptedInvoiceContent: Buffer.from(encryptedBytes).toString('base64'),
    },
  };
}
