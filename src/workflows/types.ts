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
}

export interface UpoInfo {
  pages: Array<{ referenceNumber: string; downloadUrl: string }>;
  invoiceCount?: number;
  successfulInvoiceCount?: number;
  failedInvoiceCount?: number;
}

export interface BatchUploadResult {
  sessionRef: string;
  upo: UpoInfo;
}

export interface ExportResult {
  parts: Array<{
    ordinalNumber: number;
    url: string;
    method: string;
    partSize: number;
    encryptedPartSize: number;
    encryptedPartHash: string;
    expirationDate: string;
  }>;
  invoiceCount: number;
  isTruncated: boolean;
  permanentStorageHwmDate?: string;
}

export interface ExportDownloadResult extends ExportResult {
  decryptedParts: Uint8Array[];
}
