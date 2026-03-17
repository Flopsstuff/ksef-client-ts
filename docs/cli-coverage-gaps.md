# CLI Coverage Gaps

CLI covers ~91% of the API client (112/123 methods). Below are the 11 missing methods grouped by priority.

## Priority 1 — Full services missing from CLI

### ActiveSessions (3 methods)

Entire `ActiveSessionsService` has no CLI commands.

| Method | API Endpoint | Proposed CLI Command |
|--------|-------------|---------------------|
| `getActiveSessions()` | GET /active-sessions | `ksef session active` |
| `revokeCurrentSession()` | DELETE /active-sessions/current | `ksef session revoke --current` |
| `revokeSession(ref)` | DELETE /active-sessions/{ref} | `ksef session revoke <ref>` |

### Limits (3 methods)

Entire `LimitsService` has no CLI commands. Note: `TestDataService` covers limit *modification* on test env, but there's no way to *read* current limits.

| Method | API Endpoint | Proposed CLI Command |
|--------|-------------|---------------------|
| `getContextLimits()` | GET /limits/current-context | `ksef limits context` |
| `getSubjectLimits()` | GET /limits/current-subject | `ksef limits subject` |
| `getRateLimits()` | GET /limits/rate-limits | `ksef limits rate` |

## Priority 2 — Individual methods missing

### Peppol (1 method)

| Method | API Endpoint | Proposed CLI Command |
|--------|-------------|---------------------|
| `queryProviders()` | GET /peppol/query | `ksef peppol providers` |

### Certificates (2 methods)

| Method | API Endpoint | Proposed CLI Command |
|--------|-------------|---------------------|
| `getEnrollmentData()` | GET /certificates/enrollment-data | `ksef cert enrollment-data` |
| `retrieve()` | POST /certificates/retrieve | `ksef cert retrieve` |

### SessionStatus (1 method)

| Method | API Endpoint | Proposed CLI Command |
|--------|-------------|---------------------|
| `getSessionInvoice()` | GET /sessions/{ref}/invoices/{invoiceRef} | `ksef session invoices --ref <invoiceRef>` |

### Permissions (1 method)

| Method | API Endpoint | Proposed CLI Command |
|--------|-------------|---------------------|
| `getAttachmentStatus()` | GET /permissions/attachments/status | `ksef permission attachment-status` |
