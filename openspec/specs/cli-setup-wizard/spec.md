### Requirement: Interactive setup wizard command

The CLI SHALL provide a `ksef setup` command that guides users through initial KSeF configuration via interactive prompts. The command SHALL require a TTY-attached stdin. The wizard SHALL consist of two phases: authentication (mandatory) and token generation (optional).

#### Scenario: Non-interactive terminal rejection
- **WHEN** `ksef setup` is run in a non-interactive terminal (`process.stdin.isTTY` is falsy)
- **THEN** the command SHALL exit with an error message suggesting flag-based commands (`ksef auth login-external`, `ksef token generate`)

#### Scenario: Ctrl+C cancellation
- **WHEN** the user presses Ctrl+C during any prompt
- **THEN** the command SHALL exit gracefully without saving partial state beyond what was already persisted

### Requirement: Phase 1 — NIP and environment configuration

The wizard SHALL prompt the user for their NIP (validated with `isValidNip()`). The environment SHALL default to the current config value (prod if unconfigured) and MAY be overridden via the `--env` CLI argument. The wizard SHALL save NIP and environment to config immediately after input, before proceeding to authentication.

#### Scenario: Valid NIP entry
- **WHEN** the user enters a valid 10-digit NIP
- **THEN** the wizard SHALL accept the input and proceed to authentication

#### Scenario: Invalid NIP entry
- **WHEN** the user enters an invalid NIP (wrong length or checksum)
- **THEN** the wizard SHALL reject the input and re-prompt

#### Scenario: Default environment used
- **WHEN** `ksef setup` is run without `--env`
- **THEN** the wizard SHALL use the environment from the current config (default: prod)

#### Scenario: Environment override via argument
- **WHEN** `ksef setup --env test` is run
- **THEN** the wizard SHALL use `test` as the environment and persist it to config

#### Scenario: Config saved before auth
- **WHEN** the user completes the NIP prompt
- **THEN** NIP and environment SHALL be persisted to `~/.ksef/config.json` before the challenge request, so they survive if authentication fails later

#### Scenario: Existing session detected
- **WHEN** the user has an existing session or stored token
- **THEN** the wizard SHALL inform the user and ask for confirmation to overwrite before proceeding

### Requirement: Phase 1 — Authentication flow

After configuration, the wizard SHALL authenticate with KSeF. In the test environment, the wizard SHALL offer a quick path via a self-signed certificate. Otherwise (or if declined), the wizard SHALL use the external signature flow: get a challenge from KSeF API, build unsigned XML via `buildUnsignedAuthTokenRequestXml()`, save it to `~/.ksef/auth.xml`, save the pending challenge metadata, open the `~/.ksef/` folder, print signing instructions with the podpis.gov.pl URL, and prompt the user for the path to the signed XML file.

#### Scenario: Self-signed certificate auth in test environment
- **WHEN** the environment is `test`
- **THEN** the wizard SHALL prompt the user to use a self-signed certificate for quick authentication
- **AND** if accepted, SHALL generate a company seal certificate via `CertificateService.generateCompanySeal()`, authenticate with `loginWithCertificate()`, and save the session — without any external signing steps

#### Scenario: Self-signed certificate not offered outside test
- **WHEN** the environment is `demo` or `prod`
- **THEN** the wizard SHALL NOT offer self-signed certificate authentication and SHALL proceed directly to external signature flow

#### Scenario: Unsigned XML saved and folder opened
- **WHEN** the challenge is received and unsigned XML is built
- **THEN** the wizard SHALL write the XML to `~/.ksef/auth.xml` and attempt to open the containing folder

#### Scenario: Signed XML path prompt with tilde expansion
- **WHEN** the user enters a path containing `~` (e.g. `~/Downloads/signed.xml`)
- **THEN** the wizard SHALL expand `~` to `os.homedir()` before validating

#### Scenario: Signed XML path validation
- **WHEN** the user enters a path to a non-existent file
- **THEN** the wizard SHALL display an error and re-prompt

#### Scenario: Successful authentication
- **WHEN** the user provides valid signed XML
- **THEN** the wizard SHALL submit it, poll for auth completion, redeem access/refresh tokens, and save the session

#### Scenario: Challenge expired during signing
- **WHEN** the KSeF API rejects the signed XML because the challenge expired
- **THEN** the wizard SHALL catch the error and offer to restart Phase 1 (get a new challenge)

### Requirement: Phase 2 — Optional token generation

After successful authentication, the wizard SHALL ask if the user wants to generate a long-lived API token. If yes, it SHALL prompt for permissions (multiselect) and description (text, default: "KSeF CLI API Token {YYYY-MM-DD}"), generate the token via the API, and save it to the credentials store.

#### Scenario: User opts into token generation
- **WHEN** the user confirms token generation
- **THEN** the wizard SHALL prompt for permissions and description, call the token generation API, save the token to the credentials store, and re-login using the generated token

#### Scenario: Re-login with generated token
- **WHEN** the token is generated and saved successfully
- **THEN** the wizard SHALL call `loginWithToken()` using the new token and NIP, and save the new session (replacing the external signature session)

#### Scenario: User skips token generation
- **WHEN** the user declines token generation
- **THEN** the wizard SHALL skip Phase 2 and show the completion summary

#### Scenario: Token generation fails after auth succeeds
- **WHEN** token generation fails but Phase 1 completed successfully
- **THEN** the session SHALL remain saved, and the wizard SHALL display an error with a hint to run `ksef token generate` manually

#### Scenario: Re-login fails after token generation succeeds
- **WHEN** re-login with the generated token fails
- **THEN** the token SHALL remain saved in credentials store, the previous session SHALL remain active, and the wizard SHALL display a warning suggesting `ksef auth login` manually

### Requirement: Completion summary

After all phases complete, the wizard SHALL display a summary showing the configured environment, NIP, session status, and (if generated) the token. The summary SHALL include quick-start hints for common next commands.

#### Scenario: Summary after full setup
- **WHEN** both Phase 1 and Phase 2 complete successfully
- **THEN** the wizard SHALL display environment, NIP, auth status, token presence, and example commands (e.g. `ksef invoice send`, `ksef session open`)
