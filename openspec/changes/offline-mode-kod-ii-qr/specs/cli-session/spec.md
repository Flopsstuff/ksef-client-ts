## ADDED Requirements

### Requirement: Offline mode flag on session send
The `ksef session send` command (for sending invoices in an active online session) SHALL accept an `--offline-mode` flag. When set, the `SendInvoiceRequest.offlineMode` field SHALL be set to `true`. This enables submitting previously-offline invoices through an existing online session.

#### Scenario: Send invoice with offline mode
- **WHEN** user runs `ksef session send invoice.xml --offline-mode`
- **THEN** the CLI SHALL send the invoice with `offlineMode: true` in the request

#### Scenario: Send invoice without offline mode
- **WHEN** user runs `ksef session send invoice.xml` without `--offline-mode`
- **THEN** the `offlineMode` field SHALL be omitted or `false` (default behavior unchanged)

### Requirement: Offline mode flag on session open
The `ksef session open` command SHALL accept an `--offline-mode` flag. When set, it SHALL be stored alongside the session ref so that subsequent `ksef session send` commands within this session automatically use `offlineMode: true`.

#### Scenario: Open session with offline mode
- **WHEN** user runs `ksef session open --offline-mode`
- **THEN** the session SHALL open normally and the offline mode flag SHALL be persisted in session store

#### Scenario: Auto-apply offline mode on send
- **WHEN** a session was opened with `--offline-mode` and user runs `ksef session send invoice.xml`
- **THEN** `offlineMode: true` SHALL be applied automatically without requiring the `--offline-mode` flag on send

#### Scenario: Override offline mode on send
- **WHEN** a session was opened with `--offline-mode` and user runs `ksef session send invoice.xml --no-offline-mode`
- **THEN** the send SHALL use `offlineMode: false`, overriding the session-level default
