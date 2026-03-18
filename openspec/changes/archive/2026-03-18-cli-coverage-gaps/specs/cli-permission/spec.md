## ADDED Requirements

### Requirement: Check attachment permission status
The CLI SHALL provide `ksef permission attachment-status` to check whether attachment permissions are allowed for the current context. It MUST call `PermissionsService.getAttachmentStatus()` and display the result.

#### Scenario: Attachments allowed
- **WHEN** user runs `ksef permission attachment-status` and the response `allowed` is `true`
- **THEN** CLI SHALL display "Attachments: Allowed"

#### Scenario: Attachments not allowed
- **WHEN** user runs `ksef permission attachment-status` and the response `allowed` is `false`
- **THEN** CLI SHALL display "Attachments: Not Allowed"

#### Scenario: JSON output
- **WHEN** user runs `ksef permission attachment-status --json`
- **THEN** CLI SHALL output the full `PermissionsAttachmentAllowedResponse` as JSON

#### Scenario: No auth session
- **WHEN** user runs `ksef permission attachment-status` without a stored auth session
- **THEN** CLI SHALL display an error suggesting `ksef auth login`
