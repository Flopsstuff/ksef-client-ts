### Requirement: KSeFUnauthorizedError construction and fields
`KSeFUnauthorizedError` SHALL accept an `UnauthorizedProblemDetails` object and store all fields: `detail`, `traceId`, `instance`.

#### Scenario: Full problem details
- **WHEN** constructed with `{ title: 'Unauthorized', status: 401, detail: 'Token expired', traceId: 'trace-1', instance: '/api/auth' }`
- **THEN** `message` equals `'Token expired'`, `statusCode` equals `401`, `detail` equals `'Token expired'`, `traceId` equals `'trace-1'`, `instance` equals `'/api/auth'`

#### Scenario: Minimal problem details (no optional fields)
- **WHEN** constructed with `{ title: 'Unauthorized', status: 401, detail: 'Bad token' }`
- **THEN** `message` equals `'Bad token'`, `traceId` is `undefined`, `instance` is `undefined`

#### Scenario: Empty detail string
- **WHEN** constructed with `{ title: 'Unauthorized', status: 401, detail: '' }`
- **THEN** `message` equals `'Unauthorized'` (fallback)

### Requirement: KSeFUnauthorizedError name property
`KSeFUnauthorizedError` SHALL set `name` to `'KSeFUnauthorizedError'`.

#### Scenario: Name is set
- **WHEN** an instance is created
- **THEN** `err.name` equals `'KSeFUnauthorizedError'`

### Requirement: KSeFUnauthorizedError inheritance
`KSeFUnauthorizedError` SHALL extend `KSeFError` (not `KSeFApiError`).

#### Scenario: Inheritance chain
- **WHEN** an instance is created
- **THEN** it is `instanceof KSeFError` and `instanceof Error`, but NOT `instanceof KSeFApiError`

### Requirement: KSeFForbiddenError construction and fields
`KSeFForbiddenError` SHALL accept a `ForbiddenProblemDetails` object and store all fields: `detail`, `reasonCode`, `instance`, `security`, `traceId`.

#### Scenario: Full problem details
- **WHEN** constructed with `{ title: 'Forbidden', status: 403, detail: 'No permission', reasonCode: 'missing-permissions', instance: '/api/invoices', security: { scope: 'read' }, traceId: 'trace-2' }`
- **THEN** all fields are stored: `detail`, `reasonCode`, `instance`, `security`, `traceId`

#### Scenario: Minimal problem details (required fields only)
- **WHEN** constructed with `{ title: 'Forbidden', status: 403, detail: 'Blocked', reasonCode: 'security-service-blocked' }`
- **THEN** `instance` is `undefined`, `security` is `undefined`, `traceId` is `undefined`

#### Scenario: Empty detail string
- **WHEN** constructed with `{ title: 'Forbidden', status: 403, detail: '', reasonCode: 'ip-not-allowed' }`
- **THEN** `message` equals `'Forbidden'` (fallback)

### Requirement: KSeFForbiddenError accepts all reason codes
`KSeFForbiddenError` SHALL accept all 5 `ForbiddenReasonCode` values without error.

#### Scenario: missing-permissions
- **WHEN** constructed with `reasonCode: 'missing-permissions'`
- **THEN** `err.reasonCode` equals `'missing-permissions'`

#### Scenario: ip-not-allowed
- **WHEN** constructed with `reasonCode: 'ip-not-allowed'`
- **THEN** `err.reasonCode` equals `'ip-not-allowed'`

#### Scenario: insufficient-resource-access
- **WHEN** constructed with `reasonCode: 'insufficient-resource-access'`
- **THEN** `err.reasonCode` equals `'insufficient-resource-access'`

#### Scenario: auth-method-not-allowed
- **WHEN** constructed with `reasonCode: 'auth-method-not-allowed'`
- **THEN** `err.reasonCode` equals `'auth-method-not-allowed'`

#### Scenario: security-service-blocked
- **WHEN** constructed with `reasonCode: 'security-service-blocked'`
- **THEN** `err.reasonCode` equals `'security-service-blocked'`

### Requirement: KSeFForbiddenError name property
`KSeFForbiddenError` SHALL set `name` to `'KSeFForbiddenError'`.

#### Scenario: Name is set
- **WHEN** an instance is created
- **THEN** `err.name` equals `'KSeFForbiddenError'`

### Requirement: KSeFForbiddenError inheritance
`KSeFForbiddenError` SHALL extend `KSeFError` (not `KSeFApiError`).

#### Scenario: Inheritance chain
- **WHEN** an instance is created
- **THEN** it is `instanceof KSeFError` and `instanceof Error`, but NOT `instanceof KSeFApiError`
