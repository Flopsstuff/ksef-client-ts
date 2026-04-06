// Core patterns (used in composition)
const NIP_PATTERN_CORE = '[1-9]((\\d[1-9])|([1-9]\\d))\\d{7}';
const VAT_UE_PATTERN_CORE = '(ATU\\d{8}|BE[01]{1}\\d{9}|BG\\d{9,10}|CY\\d{8}[A-Z]|CZ\\d{8,10}|DE\\d{9}|DK\\d{8}|EE\\d{9}|EL\\d{9}|ES([A-Z]\\d{8}|\\d{8}[A-Z]|[A-Z]\\d{7}[A-Z])|FI\\d{8}|FR[A-Z0-9]{2}\\d{9}|HR\\d{11}|HU\\d{8}|IE(\\d{7}[A-Z]{2}|\\d[A-Z0-9+*]\\d{5}[A-Z])|IT\\d{11}|LT(\\d{9}|\\d{12})|LU\\d{8}|LV\\d{11}|MT\\d{8}|NL[A-Z0-9+*]{12}|PT\\d{9}|RO\\d{2,10}|SE\\d{12}|SI\\d{8}|SK\\d{10}|XI((\\d{9}|\\d{12})|(GD|HA)\\d{3}))';

export const Nip = new RegExp(`^${NIP_PATTERN_CORE}$`);
export const VatUe = new RegExp(`^${VAT_UE_PATTERN_CORE}$`);
export const NipVatUe = new RegExp(`^${NIP_PATTERN_CORE}-${VAT_UE_PATTERN_CORE}$`);
export const InternalId = /^[1-9]((\d[1-9])|([1-9]\d))\d{7}-\d{5}$/;
export const PeppolId = /^P[A-Z]{2}[0-9]{6}$/;
export const ReferenceNumber = /^(20[2-9][0-9]|2[1-9][0-9]{2}|[3-9][0-9]{3})(0[1-9]|1[0-2])(0[1-9]|[1-2][0-9]|3[0-1])-([0-9A-Z]{2})-([0-9A-F]{10})-([0-9A-F]{10})-([0-9A-F]{2})$/;
export const KsefNumber = /^([1-9](\d[1-9]|[1-9]\d)\d{7})-(20[2-9][0-9]|2[1-9]\d{2}|[3-9]\d{3})(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])-([0-9A-F]{6})-?([0-9A-F]{6})-([0-9A-F]{2})$/;
export const KsefNumberV35 = /^([1-9]((\d[1-9])|([1-9]\d))\d{7}|M\d{9}|[A-Z]{3}\d{7})-(20[2-9][0-9]|2[1-9][0-9]{2}|[3-9][0-9]{3})(0[1-9]|1[0-2])(0[1-9]|[1-2][0-9]|3[0-1])-([0-9A-F]{6})([0-9A-F]{6})-([0-9A-F]{2})$/;
export const KsefNumberV36 = /^([1-9]((\d[1-9])|([1-9]\d))\d{7}|M\d{9}|[A-Z]{3}\d{7})-(20[2-9][0-9]|2[1-9][0-9]{2}|[3-9][0-9]{3})(0[1-9]|1[0-2])(0[1-9]|[1-2][0-9]|3[0-1])-([0-9A-F]{6})-([0-9A-F]{6})-([0-9A-F]{2})$/;
export const CertificateName = /^[a-zA-Z0-9_\- ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]+$/;
export const Pesel = /^\d{2}(?:0[1-9]|1[0-2]|2[1-9]|3[0-2]|4[1-9]|5[0-2]|6[1-9]|7[0-2]|8[1-9]|9[0-2])\d{7}$/;
export const CertificateFingerprint = /^[0-9A-F]{64}$/;
export const Base64String = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
export const Ip4Address = /^((25[0-5]|(2[0-4]|1\d|[1-9]|)\d)\.?\b){4}$/;
export const Ip4Range = /^((25[0-5]|(2[0-4]|1\d|[1-9]|)\d)\.?\b){4}-((25[0-5]|(2[0-4]|1\d|[1-9]|)\d)\.?\b){4}$/;
export const Ip4Mask = /^((25[0-5]|(2[0-4]|1\d|[1-9]|)\d)\.?\b){4}\/(0|[1-9]|1[0-9]|2[0-9]|3[0-2])$/;
export const Sha256Base64 = /^[A-Za-z0-9+/]{43}=$/;

// Checksum weights
const NIP_WEIGHTS = [6, 5, 7, 2, 3, 4, 5, 6, 7];
const PESEL_WEIGHTS = [1, 3, 7, 9, 1, 3, 7, 9, 1, 3];

// CRC-8 (KSeF number checksum — polynomial 0x07, init 0x00)
const CRC8_POLY = 0x07;

function computeCrc8Hex(data: string): string {
  let crc = 0x00;
  const bytes = new TextEncoder().encode(data);
  for (const byte of bytes) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) {
      crc = (crc & 0x80) !== 0
        ? ((crc << 1) ^ CRC8_POLY) & 0xff
        : (crc << 1) & 0xff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(2, '0');
}

// Validator helpers
export function isValidNip(value: string): boolean {
  if (!Nip.test(value)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += Number(value[i]) * NIP_WEIGHTS[i]!;
  }
  const checksum = sum % 11;
  return checksum !== 10 && checksum === Number(value[9]);
}
export function isValidVatUe(value: string): boolean { return VatUe.test(value); }
export function isValidNipVatUe(value: string): boolean {
  if (!NipVatUe.test(value)) return false;
  const nip = value.split('-')[0]!;
  return isValidNip(nip);
}
export function isValidInternalId(value: string): boolean { return InternalId.test(value); }
export function isValidPeppolId(value: string): boolean { return PeppolId.test(value); }
export function isValidReferenceNumber(value: string): boolean { return ReferenceNumber.test(value); }
export function isValidKsefNumber(value: string): boolean {
  if (!KsefNumber.test(value)) return false;
  let normalized = value;
  if (value.length === 36) {
    const parts = value.split('-');
    if (parts.length === 5) normalized = `${parts[0]}-${parts[1]}-${parts[2]}${parts[3]}-${parts[4]}`;
    else return false;
  }
  if (normalized.length !== 35) return false;
  return computeCrc8Hex(normalized.slice(0, 32)) === normalized.slice(-2);
}
export function isValidKsefNumberV35(value: string): boolean {
  if (!KsefNumberV35.test(value)) return false;
  return computeCrc8Hex(value.slice(0, 32)) === value.slice(-2);
}
export function isValidKsefNumberV36(value: string): boolean {
  if (!KsefNumberV36.test(value)) return false;
  const parts = value.split('-');
  if (parts.length !== 5) return false;
  const normalized = `${parts[0]}-${parts[1]}-${parts[2]}${parts[3]}-${parts[4]}`;
  return computeCrc8Hex(normalized.slice(0, 32)) === normalized.slice(-2);
}
export function isValidPesel(value: string): boolean {
  if (!Pesel.test(value)) return false;
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += Number(value[i]) * PESEL_WEIGHTS[i]!;
  }
  const checksum = (10 - (sum % 10)) % 10;
  return checksum === Number(value[10]);
}
export function isValidCertificateName(value: string): boolean { return CertificateName.test(value); }
export function isValidCertificateFingerprint(value: string): boolean { return CertificateFingerprint.test(value); }
export function isValidBase64(value: string): boolean { return Base64String.test(value); }
export function isValidIp4Address(value: string): boolean { return Ip4Address.test(value); }
export function isValidSha256Base64(value: string): boolean { return Sha256Base64.test(value); }
