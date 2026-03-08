## 1. Permission command

- [x] 1.1 Create `src/cli/commands/permission.ts` with `getGlobalOpts` helper and global args (env, json, timeout, nip)
- [x] 1.2 Implement `grant` subcommand with `--type` flag (person, entity, authorization, indirect, subunit, eu-entity-admin, eu-entity-representative), `--identifier`, `--identifier-type`, `--target-nip`, `--permissions` (comma-separated), dispatch to the correct `PermissionsService.grant*` method
- [x] 1.3 Implement `revoke` subcommand with positional `<grant-id>` and `--authorization` flag, dispatching to `revokeCommonGrant` or `revokeAuthorizationGrant`
- [x] 1.4 Implement `search` subcommand with `--type` flag (personal, persons, subunits, entities, entities-grants, subordinate-entities, authorizations, eu-entities), `--identifier`, `--identifier-type`, `--page`, `--page-size`, table output for results
- [x] 1.5 Implement `status` subcommand with positional `<ref>`, displaying operation status as key-value pairs
- [x] 1.6 Export `permissionCommand` grouping grant, revoke, search, status subcommands

## 2. Token command

- [x] 2.1 Create `src/cli/commands/token.ts` with `getGlobalOpts` helper and global args
- [x] 2.2 Implement `generate` subcommand with `--permissions` (comma-separated, required), `--description`, `--valid-to`, display reference number and token value
- [x] 2.3 Implement `list` subcommand with `--status` (comma-separated), `--description`, `--author`, `--author-type`, `--page`, `--page-size`, table output with columns: Reference, Description, Status, Permissions, Created
- [x] 2.4 Implement `get` subcommand with positional `<ref>`, displaying token details as key-value pairs
- [x] 2.5 Implement `revoke` subcommand with positional `<ref>`, display success message
- [x] 2.6 Export `tokenCommand` grouping generate, list, get, revoke subcommands

## 3. Registration and verification

- [x] 3.1 Register `permissionCommand` and `tokenCommand` in `src/cli/index.ts` under `permission` and `token` keys
- [x] 3.2 Run `yarn build` and verify no type errors
- [x] 3.3 Verify `ksef permission --help` and `ksef token --help` list all subcommands
