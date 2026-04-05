## ADDED Requirements

### Requirement: Storage interface
The system SHALL define `OfflineInvoiceStorage` interface with methods: `save(invoice: OfflineInvoiceMetadata): Promise<void>`, `get(id: string): Promise<OfflineInvoiceMetadata | null>`, `list(filter?: OfflineInvoiceFilter): Promise<OfflineInvoiceMetadata[]>`, `update(id: string, updates: Partial<OfflineInvoiceMetadata>): Promise<void>`, `delete(id: string): Promise<void>`.

#### Scenario: Interface contract
- **WHEN** a class implements `OfflineInvoiceStorage`
- **THEN** it SHALL implement all five methods with the specified signatures

### Requirement: Storage filter
The system SHALL define `OfflineInvoiceFilter` with optional fields: `status` (single status or array of statuses), `mode` (OfflineMode), `expiringBefore` (Date or ISO string for invoices expiring before that date), `sellerNip` (string).

#### Scenario: Filter by single status
- **WHEN** `list({ status: 'GENERATED' })` is called
- **THEN** it SHALL return only invoices with status `'GENERATED'`

#### Scenario: Filter by multiple statuses
- **WHEN** `list({ status: ['GENERATED', 'QUEUED'] })` is called
- **THEN** it SHALL return invoices with status `'GENERATED'` or `'QUEUED'`

#### Scenario: Filter by expiring before
- **WHEN** `list({ expiringBefore: '2026-04-10T00:00:00Z' })` is called
- **THEN** it SHALL return only invoices whose `submitBy` is before that timestamp

#### Scenario: Combined filters
- **WHEN** `list({ status: 'GENERATED', sellerNip: '1234567890' })` is called
- **THEN** it SHALL return invoices matching ALL filter criteria (AND logic)

#### Scenario: No filter
- **WHEN** `list()` is called without a filter
- **THEN** it SHALL return all stored invoices

### Requirement: In-memory storage implementation
The system SHALL provide `InMemoryOfflineInvoiceStorage` implementing `OfflineInvoiceStorage`. It SHALL store invoices in a `Map<string, OfflineInvoiceMetadata>`.

#### Scenario: Save and retrieve
- **WHEN** `save(invoice)` is called followed by `get(invoice.id)`
- **THEN** it SHALL return the saved invoice with identical fields

#### Scenario: Update partial fields
- **WHEN** `update(id, { status: 'QUEUED' })` is called
- **THEN** `get(id)` SHALL return the invoice with updated status and all other fields unchanged

#### Scenario: Update non-existent invoice
- **WHEN** `update('non-existent-id', { status: 'QUEUED' })` is called
- **THEN** it SHALL throw an error indicating the invoice was not found

#### Scenario: Delete
- **WHEN** `delete(id)` is called
- **THEN** `get(id)` SHALL return `null`

#### Scenario: List with filter
- **WHEN** storage contains 5 invoices with mixed statuses
- **AND** `list({ status: 'GENERATED' })` is called
- **THEN** it SHALL return only the invoices with GENERATED status

### Requirement: File-based storage implementation
The system SHALL provide `FileOfflineInvoiceStorage` implementing `OfflineInvoiceStorage`. It SHALL store each invoice as a separate JSON file named `{id}.json` in a configurable directory. The default directory SHALL be `~/.ksef/offline/`.

#### Scenario: Default directory
- **WHEN** `new FileOfflineInvoiceStorage()` is created without arguments
- **THEN** it SHALL use `~/.ksef/offline/` as the storage directory

#### Scenario: Custom directory
- **WHEN** `new FileOfflineInvoiceStorage('/tmp/ksef-offline')` is created
- **THEN** it SHALL use `/tmp/ksef-offline/` as the storage directory

#### Scenario: Directory creation
- **WHEN** `save(invoice)` is called and the storage directory does not exist
- **THEN** it SHALL create the directory (including parents) before writing

#### Scenario: Atomic write
- **WHEN** `save(invoice)` or `update(id, updates)` is called
- **THEN** it SHALL write to a temporary file first and rename to the final path to prevent corruption on crash

#### Scenario: List reads directory
- **WHEN** `list()` is called
- **THEN** it SHALL read all `.json` files in the directory, parse each, and apply filters

#### Scenario: Corrupt JSON file
- **WHEN** a `.json` file in the directory contains invalid JSON
- **THEN** `list()` SHALL skip that file and continue (not throw)
- **AND** `get(id)` for that file SHALL return `null`

#### Scenario: Save and retrieve round-trip
- **WHEN** an invoice is saved via `save()` and then retrieved via `get(id)`
- **THEN** all fields SHALL be identical to the original, including dates and nested objects
