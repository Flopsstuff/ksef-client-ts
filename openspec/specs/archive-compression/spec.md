# archive-compression

## Purpose

Support selectable archive compression (`Zip` default, `TarGz`) for batch upload and invoice export, producing valid archives and declaring the chosen type to KSeF.

## Requirements

### Requirement: Compression type option with Zip default

Batch upload and invoice export SHALL accept an optional compression type of `Zip` or `TarGz`. When the
caller does not specify one, the client SHALL behave as `Zip`, preserving existing behavior. The chosen
compression type SHALL be communicated to KSeF in the corresponding request.

#### Scenario: Default is Zip
- **WHEN** a batch upload or invoice export is requested without specifying a compression type
- **THEN** the client SHALL package and declare the archive as `Zip`

#### Scenario: TarGz is selectable
- **WHEN** a caller selects `TarGz`
- **THEN** the request SHALL declare `TarGz` as its compression type

### Requirement: TarGz archive production

When `TarGz` is selected, the client SHALL produce a gzip-compressed tar archive of the document
payload. The archive SHALL be a valid tar stream wrapped in gzip such that KSeF and standard tar/gzip
tools can extract the original documents.

#### Scenario: Valid gzip-wrapped tar is produced
- **WHEN** the client packages documents with `TarGz`
- **THEN** the output SHALL be a valid gzip stream whose decompressed content is a valid tar archive containing the original document entries

#### Scenario: Size and hash reflect the produced archive
- **WHEN** the client packages documents with `TarGz`
- **THEN** the file size and hash reported in the request SHALL be computed over the produced gzip-wrapped tar bytes

### Requirement: Batch upload honors compression type

Batch session open SHALL include the selected compression type in its batch file metadata, and the
uploaded archive SHALL match that type.

#### Scenario: Batch open declares the compression type
- **WHEN** a batch session is opened with a selected compression type
- **THEN** the batch file metadata in the open request SHALL declare that compression type

### Requirement: Invoice export honors compression type

Invoice export SHALL include the selected compression type in its export request, and the produced
export package SHALL match that type.

#### Scenario: Export request declares the compression type
- **WHEN** an invoice export is requested with a selected compression type
- **THEN** the export request SHALL declare that compression type
