## ADDED Requirements

### Requirement: Authentication error hints
When a `KSeFApiError` with HTTP status 401 or 403 is caught, the error handler SHALL display a hint: "Run `ksef auth login` to authenticate."

#### Scenario: 401 Unauthorized
- **WHEN** a command fails with `KSeFApiError` and status code 401
- **THEN** the CLI SHALL display the error message AND a hint suggesting `ksef auth login`

#### Scenario: 403 Forbidden
- **WHEN** a command fails with `KSeFApiError` and status code 403
- **THEN** the CLI SHALL display the error message AND a hint suggesting `ksef auth login`

### Requirement: Not found error hints
When a `KSeFApiError` with HTTP status 404 is caught, the error handler SHALL display a hint: "Check if the resource reference is correct."

#### Scenario: 404 Not Found
- **WHEN** a command fails with `KSeFApiError` and status code 404
- **THEN** the CLI SHALL display the error message AND a hint about checking the reference

### Requirement: Network error hints
When a network error is caught (fetch failed, ECONNREFUSED, ETIMEDOUT, ENOTFOUND), the error handler SHALL display a hint: "Check your network connection and environment. Run `ksef doctor` to diagnose."

#### Scenario: Connection refused
- **WHEN** a command fails with ECONNREFUSED
- **THEN** the CLI SHALL display the error AND a hint suggesting `ksef doctor`

#### Scenario: DNS resolution failure
- **WHEN** a command fails with ENOTFOUND
- **THEN** the CLI SHALL display the error AND a hint suggesting `ksef doctor`

### Requirement: Rate limit error hints
When a `KSeFRateLimitError` is caught, the error handler SHALL display the recommended delay in a human-readable format.

#### Scenario: Rate limited with delay
- **WHEN** a command fails with `KSeFRateLimitError` with `recommendedDelay` of 30
- **THEN** the CLI SHALL display "Rate limited. Retry after 30s."

### Requirement: Hint formatting
All hints SHALL be displayed using `consola.info` with a "Hint:" prefix, appearing on a separate line after the error message. Hints SHALL NOT appear in `--json` mode.

#### Scenario: Hint format
- **WHEN** an error with a hint is caught
- **THEN** the output SHALL show the error line first, then "Hint: <suggestion>" on the next line

#### Scenario: JSON mode suppresses hints
- **WHEN** an error with a hint is caught and `--json` was passed
- **THEN** the CLI SHALL output the error as JSON without hint text
