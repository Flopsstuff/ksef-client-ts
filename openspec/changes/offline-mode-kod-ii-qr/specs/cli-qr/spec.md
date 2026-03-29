## ADDED Requirements

### Requirement: Generate offline dual QR set
The `ksef qr invoice` command SHALL accept an `--offline` flag. When `--offline` is set, the command SHALL additionally require `--certificate` (private key PEM path) and `--cert-serial` (certificate serial number), and optional `--context-type` (default: Nip) and `--context-id` (defaults to `--nip` value). When `--offline` is set, the command SHALL generate both KOD I (with label "OFFLINE") and KOD II (with label "CERTYFIKAT") QR codes.

#### Scenario: Generate offline dual QR set to files
- **WHEN** user runs `ksef qr invoice --nip 1234567890 --date 2026-03-15 --hash "abc123==" --offline --certificate key.pem --cert-serial CERT001 -o output-dir/`
- **THEN** the CLI SHALL generate KOD I PNG to `output-dir/kod-i.png` and KOD II PNG to `output-dir/kod-ii.png`, and display both verification URLs

#### Scenario: Offline flag without certificate
- **WHEN** user runs `ksef qr invoice --offline` without `--certificate` or `--cert-serial`
- **THEN** the CLI SHALL display an error indicating that `--certificate` and `--cert-serial` are required when `--offline` is set

#### Scenario: JSON output with offline
- **WHEN** user adds `--json --offline`
- **THEN** the CLI SHALL output JSON with `kodI: { url, qrCode }` and `kodII: { url, qrCode }` fields

#### Scenario: Offline without -o writes to stdout
- **WHEN** user runs with `--offline` and no `-o` flag
- **THEN** the CLI SHALL output JSON with both QR codes as base64 (since dual output cannot be a single binary to stdout)
