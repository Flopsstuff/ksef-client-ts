## 1. Session Store & Types Updates

- [x] 1.1 Add `onlineSessionRef` field to `SessionData` in `src/cli/types.ts`
- [x] 1.2 Add helper functions `saveOnlineSessionRef(ref)` and `clearOnlineSessionRef()` in `src/cli/session-store.ts`
- [x] 1.3 Add `requireOnlineSession(globalOpts)` to `src/cli/client-factory.ts` that returns client + session + onlineSessionRef (throws if no online session ref stored)

## 2. Session Commands

- [x] 2.1 Create `src/cli/commands/session.ts` with `getGlobalOpts` helper and `sessionCommand` export
- [x] 2.2 Implement `session open` subcommand — online mode (calls `OnlineSessionService.openSession()`, stores ref, requires NIP)
- [x] 2.3 Implement `session open --batch` — batch mode (calls `BatchSessionService.openSession()`, stores ref)
- [x] 2.4 Implement `session close [ref]` — closes session (uses stored ref as default, clears stored ref on success)
- [x] 2.5 Implement `session status [ref]` — displays session status with key-value output
- [x] 2.6 Implement `session list` — table output with `--type online|batch` and `--page-size` flags
- [x] 2.7 Implement `session invoices [ref]` — table of invoices with `--page-size` flag
- [x] 2.8 Implement `session failed [ref]` — table of failed invoices with `--page-size` flag
- [x] 2.9 Implement `session upo <session-ref>` — UPO download with `--upo-ref`, `--ksef-number`, `--invoice-ref` modes and `-o` file output

## 3. Invoice Commands

- [x] 3.1 Create `src/cli/commands/invoice.ts` with `getGlobalOpts` helper and `invoiceCommand` export
- [x] 3.2 Implement `invoice send <file.xml>` — single file send (read XML, crypto init, encrypt, send via online session)
- [x] 3.3 Implement `invoice send <dir/>` — directory batch send (detect dir, open batch session, read all *.xml, send parts, close)
- [x] 3.4 Implement `invoice get <ksef-number>` — download invoice XML to stdout or `-o` file
- [x] 3.5 Implement `invoice query` — build `InvoiceQueryFilters` from flags (`--from` required, `--to`, `--subject-type`, `--date-type`, `--seller-nip`, `--buyer-nip`, `--amount-from`, `--amount-to`, `--amount-type`, `--currency`, `--page`, `--size`), display as table
- [x] 3.6 Implement `invoice export` — init crypto, build `InvoiceExportRequest` with same filters as query, display operation ref
- [x] 3.7 Implement `invoice export-status <ref>` — display export status, package info, and download URLs when complete

## 4. CLI Registration

- [x] 4.1 Register `sessionCommand` and `invoiceCommand` in `src/cli/index.ts` subCommands

## 5. Verification

- [x] 5.1 Run `yarn build` — verify no TypeScript errors
- [x] 5.2 Run `yarn lint` — verify type checking passes
- [x] 5.3 Manual smoke test: `ksef session --help`, `ksef invoice --help` — verify all subcommands listed
- [x] 5.4 Verify `--json` flag outputs valid JSON for all commands
