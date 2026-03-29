## ADDED Requirements

### Requirement: Storage interface
The system SHALL define an `OfflineInvoiceStorage` interface with the following methods: `save(metadata: OfflineInvoiceMetadata): Promise<void>`, `get(id: string): Promise<OfflineInvoiceMetadata | null>`, `list(filter?: OfflineInvoiceFilter): Promise<OfflineInvoiceMetadata[]>`, `update(id: string, updates: Partial<OfflineInvoiceMetadata>): Promise<void>`, `delete(id: string): Promise<void>`.

#### Scenario: Save and retrieve metadata
- **WHEN** calling `save()` with valid `OfflineInvoiceMetadata` then `get()` with the same `id`
- **THEN** the returned metadata SHALL be identical to what was saved

#### Scenario: Get non-existent invoice
- **WHEN** calling `get()` with an ID that does not exist
- **THEN** the result SHALL be `null`

#### Scenario: Update metadata fields
- **WHEN** calling `update(id, { status: 'Queued' })`
- **THEN** the stored metadata SHALL have `status: 'Queued'` and all other fields unchanged

#### Scenario: Delete metadata
- **WHEN** calling `delete(id)` then `get(id)`
- **THEN** the result SHALL be `null`

### Requirement: Storage filter
The system SHALL define an `OfflineInvoiceFilter` interface with optional fields: `status` (OfflineInvoiceStatus), `mode` (OfflineMode), `expiringBefore` (ISO 8601 string).

#### Scenario: Filter by status
- **WHEN** calling `list({ status: 'Generated' })` with 3 Generated and 2 Queued invoices stored
- **THEN** the result SHALL contain exactly the 3 invoices with `status: 'Generated'`

#### Scenario: Filter by mode
- **WHEN** calling `list({ mode: 'offline24' })` with invoices in multiple modes
- **THEN** the result SHALL contain only invoices with `mode: 'offline24'`

#### Scenario: Filter by expiration
- **WHEN** calling `list({ expiringBefore: '2026-03-16T00:00:00Z' })` with invoices having deadlines both before and after that date
- **THEN** the result SHALL contain only invoices whose `submitBy` is before the specified date

#### Scenario: Combined filters
- **WHEN** calling `list({ status: 'Generated', mode: 'offline24' })`
- **THEN** the result SHALL contain only invoices matching BOTH criteria

#### Scenario: Empty filter returns all
- **WHEN** calling `list()` or `list({})` with 5 invoices stored
- **THEN** the result SHALL contain all 5 invoices

### Requirement: In-memory storage implementation
The system SHALL provide `InMemoryOfflineInvoiceStorage` implementing `OfflineInvoiceStorage`. It SHALL store metadata in a `Map<string, OfflineInvoiceMetadata>`. It is intended as a reference implementation for testing and development, not production use.

#### Scenario: Basic CRUD operations
- **WHEN** saving 3 invoices, updating 1, deleting 1, then listing all
- **THEN** the list SHALL contain 2 invoices with the updated one reflecting changes

#### Scenario: Filter by expiringBefore with null submitBy
- **WHEN** listing with `expiringBefore` filter and some invoices have `submitBy: null` (awaria_calkowita)
- **THEN** invoices with `submitBy: null` SHALL be excluded from the filtered results (they never expire)

#### Scenario: Update non-existent invoice
- **WHEN** calling `update()` with an ID that does not exist
- **THEN** the method SHALL throw an error indicating the invoice was not found
