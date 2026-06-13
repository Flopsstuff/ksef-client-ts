import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { FIXTURE_DIR } from './env.js';
import { KSeFApiError } from '../../../src/errors/ksef-api-error.js';
import type { KSeFClient } from '../../../src/client.js';
import type { InvoiceResult } from '../../../src/models/invoices/types.js';
import type { SendInvoiceRequest } from '../../../src/models/sessions/online-types.js';
import type { FormCode } from '../../../src/models/common.js';

export type InvoiceFormVersion = 'FA_2' | 'FA_3' | 'FA_3_SELF' | 'FA_RR';

export interface InvoicePlaceholders {
  nip: string;
  buyerNip?: string;
  invoicingDate?: string;
  invoiceNumber?: string;
}

const TEMPLATE_FILES: Record<InvoiceFormVersion, string> = {
  FA_2: 'invoice-fa2.xml',
  FA_3: 'invoice-fa3.xml',
  FA_3_SELF: 'invoice-fa3-self.xml',
  FA_RR: 'invoice-rr.xml',
};

function todayString(): string {
  return new Date().toISOString().slice(0, 10);
}

export function loadInvoiceTemplate(version: InvoiceFormVersion): string {
  return readFileSync(join(FIXTURE_DIR, TEMPLATE_FILES[version]), 'utf-8');
}

const TEMPLATES_REQUIRING_BUYER_NIP: ReadonlySet<InvoiceFormVersion> = new Set(['FA_RR', 'FA_3_SELF']);

export function prepareInvoiceXml(
  version: InvoiceFormVersion,
  placeholders: InvoicePlaceholders,
): string {
  if (TEMPLATES_REQUIRING_BUYER_NIP.has(version) && !placeholders.buyerNip) {
    throw new Error(`buyerNip is required for template ${version}`);
  }
  let xml = loadInvoiceTemplate(version);
  xml = xml.replace(/#nip#/g, placeholders.nip);
  xml = xml.replace(/#buyer_nip#/g, placeholders.buyerNip ?? '');
  xml = xml.replace(/#invoicing_date#/g, placeholders.invoicingDate ?? todayString());
  xml = xml.replace(/#invoice_number#/g, placeholders.invoiceNumber ?? randomUUID());
  return xml;
}

export function getFormCode(version: InvoiceFormVersion): FormCode {
  switch (version) {
    case 'FA_2':
      return { systemCode: 'FA (2)', schemaVersion: '1-0E', value: 'FA' };
    case 'FA_3':
    case 'FA_3_SELF':
      return { systemCode: 'FA (3)', schemaVersion: '1-0E', value: 'FA' };
    case 'FA_RR':
      return { systemCode: 'FA_RR (1)', schemaVersion: '1-1E', value: 'FA_RR' };
  }
}

export function prepareAndEncryptInvoice(
  client: KSeFClient,
  version: InvoiceFormVersion,
  nip: string,
  cipherKey: Uint8Array,
  cipherIv: Uint8Array,
  overrides?: Omit<InvoicePlaceholders, 'nip'>,
): { invoiceXml: string; sendRequest: SendInvoiceRequest } {
  const invoiceXml = prepareInvoiceXml(version, { nip, ...overrides });
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

/**
 * Fetch a freshly-sent invoice by KSeF number, retrying on the transient 400
 * the repository returns while the document is still propagating.
 *
 * `GET /invoices/ksef/{ksefNumber}` has no 404 in its contract, so a not-yet-
 * indexed document surfaces as a generic 400 right after the session closes.
 * The number itself is valid (it came from KSeF), so a 400 here is transient —
 * retry a few times with a short delay rather than failing the test on a race.
 */
export async function getInvoiceWithRetry(
  client: KSeFClient,
  ksefNumber: string,
  attempts = 3,
  delayMs = 2000,
): Promise<InvoiceResult> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await client.invoices.getInvoice(ksefNumber);
    } catch (err) {
      lastError = err;
      const isTransient = err instanceof KSeFApiError && err.statusCode === 400;
      if (!isTransient || attempt === attempts) throw err;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw lastError;
}
