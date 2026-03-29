## ADDED Requirements

### Requirement: Dual QR code set generation
The system SHALL provide a `generateOfflineQRCodes` function that generates both KOD I and KOD II QR codes for an offline invoice. It SHALL accept: `invoiceHashBase64` (string), `sellerNip` (string), `issueDate` (Date or string), `contextIdentifier` (ContextIdentifier), `certSerial` (string), `privateKeyPem` (string), and optional `qrOptions` (QrCodeOptions). It SHALL return an `OfflineInvoiceQRCodes` object with `kodI` and `kodII` fields.

#### Scenario: Generate both QR codes
- **WHEN** calling `generateOfflineQRCodes()` with valid invoice hash, NIP, date, context, certificate serial, and private key
- **THEN** the result SHALL contain `kodI` with invoice verification URL + QR image, and `kodII` with certificate verification URL + QR image

#### Scenario: KOD I label is OFFLINE
- **WHEN** generating offline QR codes before the invoice is submitted to KSeF
- **THEN** the KOD I QR code SHALL have the label `"OFFLINE"`

#### Scenario: KOD II label is CERTYFIKAT
- **WHEN** generating offline QR codes
- **THEN** the KOD II QR code SHALL have the label `"CERTYFIKAT"`

### Requirement: Offline QR code result type
The system SHALL define an `OfflineInvoiceQRCodes` interface with: `kodI` containing `{ url: string; png: Buffer; label: string }` and `kodII` containing `{ url: string; png: Buffer; label: string }`.

#### Scenario: Access KOD I URL
- **WHEN** accessing `result.kodI.url` from the generated QR codes
- **THEN** it SHALL be a valid invoice verification URL in the format `{baseQrUrl}/invoice/{NIP}/{DD-MM-YYYY}/{hash_base64url}`

#### Scenario: Access KOD II URL
- **WHEN** accessing `result.kodII.url` from the generated QR codes
- **THEN** it SHALL be a valid certificate verification URL in the format `{baseQrUrl}/certificate/{contextType}/{contextId}/{sellerNip}/{certSerial}/{hash_base64url}/{signature_base64url}`

### Requirement: Certificate type validation
The `generateOfflineQRCodes` function SHALL validate that the certificate used for KOD II signing is of type `'Offline'`, not `'Authentication'`. If an optional `certificateType` parameter is provided and its value is `'Authentication'`, the function SHALL throw a `KSeFValidationError`.

#### Scenario: Reject Authentication certificate
- **WHEN** calling `generateOfflineQRCodes()` with `certificateType: 'Authentication'`
- **THEN** it SHALL throw a `KSeFValidationError` with a message indicating that KOD II requires an Offline-type certificate

#### Scenario: Accept Offline certificate
- **WHEN** calling `generateOfflineQRCodes()` with `certificateType: 'Offline'`
- **THEN** it SHALL proceed with QR generation without error

#### Scenario: No certificate type provided
- **WHEN** calling `generateOfflineQRCodes()` without the `certificateType` parameter
- **THEN** it SHALL proceed without validation (caller is responsible)

### Requirement: Key type auto-detection for KOD II signing
The existing `VerificationLinkService.buildCertificateVerificationUrl()` SHALL auto-detect the private key type from PEM content: RSA keys use RSA-PSS with SHA-256 (salt length 32), EC keys use ECDSA with SHA-256 in IEEE P1363 format. Unsupported key types SHALL throw an error.

#### Scenario: RSA private key
- **WHEN** providing an RSA private key PEM
- **THEN** the KOD II URL SHALL be signed using RSA-PSS with SHA-256 and salt length 32

#### Scenario: EC private key (P-256)
- **WHEN** providing an ECDSA P-256 private key PEM
- **THEN** the KOD II URL SHALL be signed using ECDSA with SHA-256 in IEEE P1363 format (64-byte fixed-length signature)

#### Scenario: Unsupported key type
- **WHEN** providing a private key PEM with an unsupported algorithm (e.g., Ed25519)
- **THEN** the function SHALL throw an error with the message `Unsupported key type: <type>`

### Requirement: Base64URL encoding in QR URLs
All hash and signature values in QR URLs SHALL use Base64URL encoding: `+` replaced with `-`, `/` replaced with `_`, trailing `=` padding removed.

#### Scenario: Hash encoding
- **WHEN** the invoice hash in standard Base64 is `abc+def/ghi==`
- **THEN** the hash in the QR URL SHALL be `abc-def_ghi`

#### Scenario: Signature encoding
- **WHEN** the RSA-PSS signature produces standard Base64 output
- **THEN** the signature in the QR URL SHALL use Base64URL encoding without padding

### Requirement: Signing input format
The signing input for KOD II SHALL be the certificate verification URL path WITHOUT the `https://` prefix and WITHOUT a trailing `/`. The SHA-256 hash of this string is what gets signed.

#### Scenario: Signing input extraction
- **WHEN** the full URL is `https://qr-test.ksef.mf.gov.pl/certificate/Nip/1234567890/1234567890/CERT001/hashvalue`
- **THEN** the signing input SHALL be `qr-test.ksef.mf.gov.pl/certificate/Nip/1234567890/1234567890/CERT001/hashvalue`
