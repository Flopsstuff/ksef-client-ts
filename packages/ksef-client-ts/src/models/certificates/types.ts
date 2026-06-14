export type CertificateType = 'Authentication' | 'Offline';
export type CertificateStatus = 'Active' | 'Blocked' | 'Revoked' | 'Expired';
export type CertificateSubjectIdentifierType = 'Nip' | 'Pesel' | 'Fingerprint';

// --- Limits ---

export interface CertificateLimit {
  limit: number;
  remaining: number;
}

export interface CertificateLimitsResponse {
  canRequest: boolean;
  enrollment: CertificateLimit;
  certificate: CertificateLimit;
}

// --- Enrollment Data ---

export interface CertificateEnrollmentDataResponse {
  commonName: string;
  countryName: string;
  givenName?: string;
  surname?: string;
  serialNumber?: string;
  uniqueIdentifier?: string;
  organizationName?: string;
  organizationIdentifier?: string;
}

// --- Enroll ---

export interface EnrollCertificateRequest {
  certificateName: string;
  certificateType: CertificateType;
  csr: string;
  validFrom?: string;
}

export interface EnrollCertificateResponse {
  referenceNumber: string;
  timestamp: string;
}

// --- Enrollment Status ---

export interface StatusInfo {
  code: number;
  description: string;
  details?: string[];
}

export interface CertificateEnrollmentStatusResponse {
  requestDate: string;
  status: StatusInfo;
  certificateSerialNumber?: string;
}

// --- Retrieve ---

export interface RetrieveCertificatesRequest {
  certificateSerialNumbers: string[];
}

export interface RetrieveCertificatesListItem {
  certificate: string;
  certificateName: string;
  certificateSerialNumber: string;
  certificateType: CertificateType;
}

export interface RetrieveCertificatesResponse {
  certificates: RetrieveCertificatesListItem[];
}

// --- Query ---

export interface QueryCertificatesRequest {
  certificateSerialNumber?: string;
  name?: string;
  type?: CertificateType;
  status?: CertificateStatus;
  expiresAfter?: string;
}

export interface CertificateSubjectIdentifier {
  type: CertificateSubjectIdentifierType;
  value: string;
}

export interface CertificateListItem {
  certificateSerialNumber: string;
  name: string;
  type: CertificateType;
  commonName: string;
  status: CertificateStatus;
  subjectIdentifier: CertificateSubjectIdentifier;
  validFrom: string;
  validTo: string;
  lastUseDate?: string;
  requestDate: string;
}

export interface QueryCertificatesResponse {
  certificates: CertificateListItem[];
  hasMore: boolean;
}

// --- Revoke ---

export interface RevokeCertificateRequest {
  revocationReason?: CertificateRevocationReason | null;
}

export type CertificateRevocationReason = 'Unspecified' | 'Superseded' | 'KeyCompromise';
