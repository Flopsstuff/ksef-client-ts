## ADDED Requirements

### Requirement: Get single invoice status in session
The CLI SHALL provide `ksef session invoice <invoiceRef>` to get the status of a single invoice within a session. It MUST accept an optional `[sessionRef]` positional or use the stored `onlineSessionRef`. It MUST call `SessionStatusService.getSessionInvoice(sessionRef, invoiceRef)`.

#### Scenario: Get invoice by reference in current session
- **WHEN** user runs `ksef session invoice <invoiceRef>` with a stored session ref
- **THEN** CLI SHALL call `SessionStatusService.getSessionInvoice()` with the stored session ref and provided invoice ref, and display key-value pairs: Ordinal, Invoice Number, KSeF Number, Reference, Hash, Status, Invoicing Date, Invoicing Mode

#### Scenario: Get invoice with explicit session ref
- **WHEN** user runs `ksef session invoice <invoiceRef> --ref <sessionRef>`
- **THEN** CLI SHALL use the provided session ref instead of the stored one

#### Scenario: No session ref available
- **WHEN** user runs `ksef session invoice <invoiceRef>` with no stored session ref and no `--ref` flag
- **THEN** CLI SHALL display an error indicating no active session

#### Scenario: JSON output
- **WHEN** user runs `ksef session invoice <invoiceRef> --json`
- **THEN** CLI SHALL output the full `SessionInvoiceStatusResponse` as JSON
