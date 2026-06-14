import type { CompressionType, EncryptionInfo, FileMetadata, FormCode } from '../common.js';

export interface BatchFilePartInfo {
  ordinalNumber: number;
  fileSize: number;
  fileHash: string;
}

export interface BatchFileInfo {
  fileSize: number;
  fileHash: string;
  /** Archive compression type (KSeF API v2.6.0). Omitted/`Zip` keeps the legacy behavior. */
  compressionType?: CompressionType;
  fileParts: BatchFilePartInfo[];
}

export interface OpenBatchSessionRequest {
  formCode: FormCode;
  batchFile: BatchFileInfo;
  encryption: EncryptionInfo;
  offlineMode?: boolean;
}

export interface PartUploadRequest {
  method: string;
  ordinalNumber: number;
  url: string;
  headers: Record<string, string | null>;
}

export interface OpenBatchSessionResponse {
  referenceNumber: string;
  partUploadRequests: PartUploadRequest[];
}

export interface BatchPartSendingInfo {
  data: ArrayBuffer;
  metadata: FileMetadata;
  ordinalNumber: number;
}

export interface BatchPartStreamSendingInfo {
  dataStream: ReadableStream<Uint8Array>;
  metadata: FileMetadata;
  ordinalNumber: number;
}
