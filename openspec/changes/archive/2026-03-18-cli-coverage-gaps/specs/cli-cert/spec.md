## ADDED Requirements

### Requirement: Get enrollment data
The CLI SHALL provide `ksef cert enrollment-data` to fetch the enrollment data template from KSeF. It MUST call `CertificateApiService.getEnrollmentData()` and display the response as key-value pairs: Common Name, Country, Given Name, Surname, Serial Number, Unique Identifier, Organization Name, Organization Identifier.

#### Scenario: Get enrollment data
- **WHEN** user runs `ksef cert enrollment-data`
- **THEN** CLI SHALL call `CertificateApiService.getEnrollmentData()` and display all non-null fields as key-value pairs

#### Scenario: JSON output
- **WHEN** user runs `ksef cert enrollment-data --json`
- **THEN** CLI SHALL output the full `CertificateEnrollmentDataResponse` as JSON

#### Scenario: No auth session
- **WHEN** user runs `ksef cert enrollment-data` without a stored auth session
- **THEN** CLI SHALL display an error suggesting `ksef auth login`

### Requirement: Retrieve certificates by serial numbers
The CLI SHALL provide `ksef cert retrieve` to retrieve full certificate data by serial numbers. It MUST accept one or more serial numbers via `--serial` flags (repeatable) or comma-separated. It MUST call `CertificateApiService.retrieve()`. Results SHALL be displayed as a table with columns: Serial, Name, Type.

#### Scenario: Retrieve single certificate
- **WHEN** user runs `ksef cert retrieve --serial ABC123`
- **THEN** CLI SHALL call `CertificateApiService.retrieve({ certificateSerialNumbers: ["ABC123"] })` and display the result

#### Scenario: Retrieve multiple certificates
- **WHEN** user runs `ksef cert retrieve --serial ABC123,DEF456`
- **THEN** CLI SHALL pass both serial numbers in the request and display results as a table

#### Scenario: JSON output
- **WHEN** user runs `ksef cert retrieve --serial ABC123 --json`
- **THEN** CLI SHALL output the full `RetrieveCertificatesResponse` as JSON

#### Scenario: No serials provided
- **WHEN** user runs `ksef cert retrieve` without `--serial`
- **THEN** CLI SHALL display an error requesting at least one serial number
