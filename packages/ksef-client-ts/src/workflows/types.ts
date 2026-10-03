import type { UpoPotwierdzenie } from '../xml/index.js';
import type { OnlineSessionState } from '../models/sessions/session-state.js';
import type { CompressionType } from '../models/common.js';
import type { SessionInvoiceStatusResponse } from '../models/sessions/status-types.js';

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
  /**
   * Wait until KSeF finishes processing one sent invoice. Resolves with its status
   * (carrying `ksefNumber`) on success; throws `KSeFInvoiceRejectedError` when KSeF
   * rejects it, e.g. 440 for a duplicate. Can be called before or after `close()`.
   */
  waitForInvoice(invoiceReferenceNumber: string, options?: PollOptions): Promise<SessionInvoiceStatusResponse>;
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
  /** Archive format of the downloaded package, so callers know how to unpack it. */
  compressionType: CompressionType;
}

export interface ExportDownloadResult extends ExportResult {
  decryptedParts: Uint8Array[];
}

export interface ExportExtractedResult extends ExportResult {
  files: Map<string, Buffer>;
}
