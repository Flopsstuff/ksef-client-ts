## Why

Currently, UPO (Urzedowe Poswiadczenie Odbioru) XML is fetched as a raw string (`UpoResult.upo: string`) with no structured access to its contents. Users must manually parse the XML to extract invoice KSeF numbers, hashes, session metadata, and authentication proof. All 4 reference implementations (smekcio has the most complete `parseUpoXml()`, lkow/C#/Java have partial parsing) provide typed UPO access. This is our second-largest low-effort gap after offline mode.

## What Changes

- Add a `parseUpoXml(xml)` function that parses UPO XML (v4-2/v4-3) into a typed `UpoPotwierdzenie` object
- Add typed interfaces for all UPO components: confirmation root, authentication block (4 context ID variants, 2 auth proof variants), optional pagination descriptor, and document records
- Use discriminated unions for mutually exclusive fields (context ID kind, auth proof kind)
- Validate required fields and throw `KSeFValidationError` on malformed input
- Handle single-document and multi-document (up to 10,000) UPOs uniformly
- Integrate parsing into existing workflows (`waitForUpo` can optionally return parsed result)
- Add CLI `--parsed` flag to `ksef session upo` for structured JSON output

## Capabilities

### New Capabilities
- `upo-parsing`: Parse KSeF UPO XML into typed TypeScript objects with validation. Covers the XML parser function, UPO type definitions, discriminated union types for context/auth variants, and integration points with existing services and workflows.

### Modified Capabilities
- `cli-session`: Add `--parsed` flag to the `session upo` subcommand to output parsed UPO as structured JSON instead of raw XML.

## Impact

- **New files**: `src/xml/upo-parser.ts` (parser + types), `tests/unit/xml/upo-parser.test.ts`
- **Modified files**: `src/workflows/online-session-workflow.ts`, `src/workflows/batch-session-workflow.ts`, `src/workflows/types.ts` (add parsed UPO variant), `src/cli/commands/session.ts` (add `--parsed` flag)
- **Dependencies**: No new dependencies. Uses existing `fast-xml-parser` (already in project for XML parsing elsewhere).
- **Models**: New types in `src/xml/upo-parser.ts` or `src/models/upo/types.ts` (to be decided in design)
- **Test fixtures**: UPO XML examples available at `ref/ksef-docs/faktury/upo/przyklady/v4-3/` (6 files covering all context variants)
- **Public API**: Exports `parseUpoXml()` function and all UPO types from package barrel
- **No breaking changes**
