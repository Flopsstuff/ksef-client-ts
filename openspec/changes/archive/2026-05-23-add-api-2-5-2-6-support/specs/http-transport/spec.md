## ADDED Requirements

### Requirement: Surface system warning response header

The HTTP layer SHALL accept an optional `onSystemWarning` callback in its options. When a response
carries an `X-System-Warning` header, the system SHALL invoke this callback with the raw header value
and SHALL NOT alter the operation's result or raise an error. When no callback is configured, the
system SHALL log the warning at warn level. The header value SHALL be passed through unparsed.

#### Scenario: Callback invoked when header present
- **WHEN** a response includes an `X-System-Warning` header and an `onSystemWarning` callback is configured
- **THEN** the callback SHALL be invoked with the raw header value and the operation result SHALL be unaffected

#### Scenario: Logged when no callback configured
- **WHEN** a response includes an `X-System-Warning` header and no callback is configured
- **THEN** the system SHALL log the warning at warn level and the operation result SHALL be unaffected

#### Scenario: No warning, no invocation
- **WHEN** a response does not include an `X-System-Warning` header
- **THEN** the callback SHALL NOT be invoked
