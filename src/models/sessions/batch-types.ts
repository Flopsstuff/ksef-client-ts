import type { EncryptionInfo, FileMetadata, FormCode } from '../common.js';

export interface BatchFilePartInfo {
  ordinalNumber: number;
  fileSize: number;
  fileHash: string;
}

export interface BatchFileInfo {
  fileSize: number;
  fileHash: string;
  fileParts: BatchFilePartInfo[];
}

export interface OpenBatchSessionRequest {
  formCode: FormCode;
  batchFile: BatchFileInfo;
  encryption: EncryptionInfo;
  offlineMode?: boolean;
}

export interface PackagePartSignatureInitResponse {
  method: string;
  ordinalNumber: number;
  url: string;
  headers: Record<string, string>;
}

export interface OpenBatchSessionResponse {
  referenceNumber: string;
  partUploadRequests: PackagePartSignatureInitResponse[];
}

export interface BatchPartSendingInfo {
  data: ArrayBuffer;
  metadata: FileMetadata;
  ordinalNumber: number;
}
