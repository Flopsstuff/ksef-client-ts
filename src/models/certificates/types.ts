export type CertificateType = 'Authentication' | 'Signing';
export type CertificateStatus = 'Active' | 'Revoked' | 'Expired';

export interface SendCertificateEnrollmentRequest {
  certificateData: string;
  certificateType: CertificateType;
  description?: string;
}

export interface CertificateListRequest {
  certificateType?: CertificateType;
  certificateStatus?: CertificateStatus;
  pageOffset?: number;
  pageSize?: number;
}

export interface CertificateRevokeRequest {
  reason?: string;
}

export interface CertificateMetadataListRequest {
  pageOffset?: number;
  pageSize?: number;
}

export interface CertificateLimitResponse {
  limit: number;
  used: number;
  available: number;
}

export interface CertificateEnrollmentInfo {
  referenceNumber: string;
  serialNumber: string;
  certificateType: CertificateType;
  status: CertificateStatus;
  description?: string;
  createdAt: string;
  validFrom: string;
  validTo: string;
  revokedAt?: string;
}

export interface CertificateEnrollmentsInfoResponse {
  enrollmentData: string;
}

export interface CertificateEnrollmentResponse {
  referenceNumber: string;
}

export interface CertificateEnrollmentStatusResponse {
  processingCode: number;
  processingDescription: string;
  serialNumber?: string;
}

export interface CertificateListResponse {
  certificates: CertificateEnrollmentInfo[];
  hasMore: boolean;
}

export interface CertificateMetadataListResponse {
  metadata: CertificateEnrollmentInfo[];
  hasMore: boolean;
}
