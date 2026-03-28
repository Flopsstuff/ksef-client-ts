## MODIFIED Requirements

### Requirement: Download UPO
The CLI SHALL provide `ksef session upo <session-ref>` to download UPO (Urzedowe Poswiadczenie Odbioru). It MUST support three retrieval modes via flags. It MUST support a `--parsed` flag that outputs the UPO as a structured JSON object instead of raw XML.

#### Scenario: Download UPO by session UPO reference
- **WHEN** user runs `ksef session upo <session-ref> --upo-ref <upo-ref>`
- **THEN** CLI calls `getSessionUpo()` and outputs the UPO XML to stdout

#### Scenario: Download UPO by KSeF number
- **WHEN** user runs `ksef session upo <session-ref> --ksef-number <num>`
- **THEN** CLI calls `getInvoiceUpoByKsefNumber()` and outputs the UPO XML

#### Scenario: Download UPO by invoice reference
- **WHEN** user runs `ksef session upo <session-ref> --invoice-ref <iref>`
- **THEN** CLI calls `getInvoiceUpoByReference()` and outputs the UPO XML

#### Scenario: Save UPO to file
- **WHEN** user runs `ksef session upo <session-ref> --ksef-number <num> -o upo.xml`
- **THEN** CLI writes the UPO XML to the specified file path

#### Scenario: No retrieval mode specified
- **WHEN** user runs `ksef session upo <session-ref>` without `--upo-ref`, `--ksef-number`, or `--invoice-ref`
- **THEN** CLI SHALL display an error requesting one of the three flags

#### Scenario: Parsed UPO output as JSON
- **WHEN** user runs `ksef session upo <session-ref> --ksef-number <num> --parsed`
- **THEN** CLI fetches the UPO XML, parses it with `parseUpoXml()`, and outputs the `UpoPotwierdzenie` object as formatted JSON to stdout

#### Scenario: Parsed UPO saved to file
- **WHEN** user runs `ksef session upo <session-ref> --ksef-number <num> --parsed -o upo.json`
- **THEN** CLI writes the parsed `UpoPotwierdzenie` as formatted JSON to the specified file path

#### Scenario: Parsed flag implies JSON format
- **WHEN** user runs `ksef session upo <session-ref> --upo-ref <ref> --parsed`
- **THEN** output MUST be JSON regardless of whether `--json` flag is also provided
