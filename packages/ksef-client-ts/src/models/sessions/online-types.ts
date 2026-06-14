import type { EncryptionInfo, FormCode } from '../common.js';

export interface OpenOnlineSessionRequest {
  formCode: FormCode;
  encryption: EncryptionInfo;
}

export interface OpenOnlineSessionResponse {
  referenceNumber: string;
  validUntil: string;
}

export interface SendInvoiceRequest {
  invoiceHash: string;
  invoiceSize: number;
  encryptedInvoiceHash: string;
  encryptedInvoiceSize: number;
  encryptedInvoiceContent: string;
  offlineMode?: boolean;
  hashOfCorrectedInvoice?: string;
}

export interface SendInvoiceResponse {
  referenceNumber: string;
}
