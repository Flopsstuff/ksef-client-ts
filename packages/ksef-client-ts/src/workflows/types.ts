import type { UpoPotwierdzenie } from '../xml/index.js';
import type { OnlineSessionState } from '../models/sessions/session-state.js';

export interface PollOptions {
  intervalMs?: number;
  maxAttempts?: number;
  onProgress?: (attempt: number, maxAttempts: number) => void;
}

export interface OnlineSessionHandle {
  readonly sessionRef: string;
  readonly validUntil: string;
  sendInvoice(invoiceXml: string | Uint8Array): Promise<string>;
  close(): Promise<void>;
  waitForUpo(options?: PollOptions): Promise<UpoInfo>;
  waitForUpoParsed(options?: PollOptions): Promise<ParsedUpoInfo>;
  /** Serialize session state for persistence. Restore with `resumeOnlineSession()`. */
  getState(): OnlineSessionState;
}

export interface UpoInfo {
  pages: Array<{ referenceNumber: string; downloadUrl: string }>;
  invoiceCount?: number;
  successfulInvoiceCount?: number;
  failedInvoiceCount?: number;
}

export interface ParsedUpoInfo extends UpoInfo {
  parsed: UpoPotwierdzenie[];
}

export interface BatchUploadResult {
  sessionRef: string;
  upo: UpoInfo;
}

export interface ParsedBatchUploadResult {
  sessionRef: string;
  upo: ParsedUpoInfo;
}

export interface ExportResult {
  parts: Array<{
    ordinalNumber: number;
    url: string;
    method: string;
    partSize: number;
    partHash: string;
    encryptedPartSize: number;
    encryptedPartHash: string;
    expirationDate: string;
  }>;
  invoiceCount: number;
  isTruncated: boolean;
  permanentStorageHwmDate?: string;
  lastPermanentStorageDate?: string;
}

export interface ExportDownloadResult extends ExportResult {
  decryptedParts: Uint8Array[];
}

export interface ExportExtractedResult extends ExportResult {
  files: Map<string, Buffer>;
}
