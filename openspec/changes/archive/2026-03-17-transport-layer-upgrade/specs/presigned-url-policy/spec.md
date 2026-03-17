## ADDED Requirements

### Requirement: HTTPS enforcement
The system SHALL reject presigned URLs that use the `http://` protocol when `requireHttps` is `true` (default). The system SHALL throw `KSeFValidationError` with a descriptive message.

#### Scenario: HTTP URL rejected
- **WHEN** a presigned request targets `http://storage.ksef.mf.gov.pl/download/abc`
- **AND** `requireHttps` is `true`
- **THEN** the system SHALL throw `KSeFValidationError` with a message indicating HTTPS is required

#### Scenario: HTTPS URL accepted
- **WHEN** a presigned request targets `https://storage.ksef.mf.gov.pl/download/abc`
- **THEN** the HTTPS check SHALL pass

#### Scenario: HTTP allowed when disabled
- **WHEN** `requireHttps` is `false`
- **AND** a presigned request targets `http://storage.ksef.mf.gov.pl/download/abc`
- **THEN** the HTTPS check SHALL pass

### Requirement: Host whitelist with wildcard support
The system SHALL validate presigned URL hostnames against `allowedHosts`. Wildcard patterns (`*.domain.com`) SHALL match any subdomain. Exact matches SHALL also be supported. URLs with non-matching hosts SHALL be rejected with `KSeFValidationError`.

#### Scenario: Exact host match
- **WHEN** `allowedHosts` includes `storage.ksef.mf.gov.pl`
- **AND** a presigned request targets `https://storage.ksef.mf.gov.pl/download/abc`
- **THEN** the host check SHALL pass

#### Scenario: Wildcard host match
- **WHEN** `allowedHosts` includes `*.ksef.mf.gov.pl`
- **AND** a presigned request targets `https://download.ksef.mf.gov.pl/file/xyz`
- **THEN** the host check SHALL pass

#### Scenario: Non-matching host rejected
- **WHEN** `allowedHosts` includes `*.ksef.mf.gov.pl`
- **AND** a presigned request targets `https://evil.example.com/steal`
- **THEN** the system SHALL throw `KSeFValidationError`

#### Scenario: Wildcard does not match bare domain
- **WHEN** `allowedHosts` includes `*.ksef.mf.gov.pl`
- **AND** a presigned request targets `https://ksef.mf.gov.pl/download/abc`
- **THEN** the host check SHALL NOT pass (wildcard requires a subdomain)

### Requirement: Redirect parameter blocking
The system SHALL reject presigned URLs containing query parameters commonly used for redirects when `blockRedirectParams` is `true` (default). Blocked parameter names: `redirect`, `callback`, `return_url`, `next`. The check SHALL be case-insensitive.

#### Scenario: URL with redirect parameter rejected
- **WHEN** a presigned URL contains query parameter `redirect=https://evil.com`
- **AND** `blockRedirectParams` is `true`
- **THEN** the system SHALL throw `KSeFValidationError`

#### Scenario: URL with callback parameter rejected
- **WHEN** a presigned URL contains query parameter `callback=https://evil.com`
- **THEN** the system SHALL throw `KSeFValidationError`

#### Scenario: URL without redirect parameters accepted
- **WHEN** a presigned URL contains only parameters like `token=abc&expires=123`
- **THEN** the redirect parameter check SHALL pass

#### Scenario: Redirect blocking disabled
- **WHEN** `blockRedirectParams` is `false`
- **AND** a presigned URL contains `redirect=https://evil.com`
- **THEN** the redirect parameter check SHALL pass

### Requirement: Private IP rejection
The system SHALL reject presigned URLs that resolve to private or reserved IP addresses when `rejectPrivateIps` is `true` (default). Rejected ranges: IPv4 loopback (127.0.0.0/8), private (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16), link-local (169.254.0.0/16); IPv6 loopback (::1), private (fc00::/7), link-local (fe80::/10).

#### Scenario: Loopback IP rejected
- **WHEN** a presigned URL targets `https://127.0.0.1/download/abc`
- **AND** `rejectPrivateIps` is `true`
- **THEN** the system SHALL throw `KSeFValidationError`

#### Scenario: Private 10.x IP rejected
- **WHEN** a presigned URL targets `https://10.0.0.5/download/abc`
- **THEN** the system SHALL throw `KSeFValidationError`

#### Scenario: Private 192.168.x IP rejected
- **WHEN** a presigned URL targets `https://192.168.1.1/download/abc`
- **THEN** the system SHALL throw `KSeFValidationError`

#### Scenario: IPv6 loopback rejected
- **WHEN** a presigned URL targets `https://[::1]/download/abc`
- **THEN** the system SHALL throw `KSeFValidationError`

#### Scenario: Public IP accepted
- **WHEN** a presigned URL targets `https://52.123.45.67/download/abc`
- **AND** the host is in `allowedHosts`
- **THEN** the private IP check SHALL pass

#### Scenario: Private IP allowed when disabled
- **WHEN** `rejectPrivateIps` is `false`
- **AND** a presigned URL targets `https://10.0.0.5/download/abc`
- **THEN** the private IP check SHALL pass

### Requirement: RestRequest presigned flag
`RestRequest` SHALL support a `presigned()` method on its fluent builder that marks the request for presigned URL validation. The flag SHALL default to `false`.

#### Scenario: Presigned flag set
- **WHEN** a request is built with `.presigned()`
- **THEN** the request SHALL be flagged as presigned

#### Scenario: Non-presigned requests skip validation
- **WHEN** a request is built without `.presigned()`
- **THEN** no presigned URL validation SHALL be performed

### Requirement: Presigned validation integration
The system SHALL validate presigned-flagged requests through `PresignedUrlPolicy` before sending. All checks (HTTPS, host whitelist, redirect params, private IPs) SHALL run in order. The first failing check SHALL throw `KSeFValidationError`.

#### Scenario: All checks pass
- **WHEN** a presigned request targets `https://storage.ksef.mf.gov.pl/download/abc?token=xyz`
- **AND** `storage.ksef.mf.gov.pl` is in `allowedHosts`
- **THEN** all checks SHALL pass and the request SHALL be sent

#### Scenario: First failing check throws
- **WHEN** a presigned request targets `http://evil.com/steal?redirect=https://attacker.com`
- **THEN** the system SHALL throw `KSeFValidationError` for the HTTPS check (first failure)

### Requirement: Default presigned URL policy factory
The system SHALL export a `defaultPresignedUrlPolicy()` factory with KSeF-specific defaults: `requireHttps: true`, `blockRedirectParams: true`, `rejectPrivateIps: true`, `allowedHosts: ['*.ksef.mf.gov.pl']`.

#### Scenario: Default policy values
- **WHEN** `defaultPresignedUrlPolicy()` is called
- **THEN** it SHALL return a policy with the specified KSeF-specific defaults
