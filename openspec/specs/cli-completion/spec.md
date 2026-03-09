## ADDED Requirements

### Requirement: Bash completion generation
The `ksef completion bash` command SHALL output a bash completion script to stdout. The script SHALL provide completion for all top-level commands and their subcommands.

#### Scenario: Generate bash completion
- **WHEN** user runs `ksef completion bash`
- **THEN** the CLI SHALL output a valid bash completion script that can be sourced with `eval "$(ksef completion bash)"`

### Requirement: Zsh completion generation
The `ksef completion zsh` command SHALL output a zsh completion script to stdout.

#### Scenario: Generate zsh completion
- **WHEN** user runs `ksef completion zsh`
- **THEN** the CLI SHALL output a valid zsh completion script that can be sourced with `eval "$(ksef completion zsh)"`

### Requirement: Fish completion generation
The `ksef completion fish` command SHALL output a fish completion script to stdout.

#### Scenario: Generate fish completion
- **WHEN** user runs `ksef completion fish`
- **THEN** the CLI SHALL output a valid fish completion script that can be sourced with `ksef completion fish | source`

### Requirement: Completion command registration
The `completionCommand` SHALL be exported from `src/cli/commands/completion.ts` and registered in `src/cli/index.ts` under the `completion` subcommand key.

#### Scenario: Help output
- **WHEN** user runs `ksef completion --help`
- **THEN** the CLI SHALL list subcommands: bash, zsh, fish

### Requirement: Command tree definition
The completion scripts SHALL cover all top-level commands and their subcommands. The command tree SHALL be defined as a constant data structure in the completion module so it is easy to update when new commands are added.

#### Scenario: All commands covered
- **WHEN** user sources the completion script and types `ksef <TAB>`
- **THEN** the shell SHALL suggest all top-level commands: config, auth, session, invoice, permission, token, cert, qr, lighthouse, test-data, doctor, completion

#### Scenario: Subcommands covered
- **WHEN** user types `ksef cert <TAB>`
- **THEN** the shell SHALL suggest: generate, enroll, status, list, revoke, limits
