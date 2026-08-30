# Invoice XML unit tests

## XSD harness architecture

The tests in `xsd-validation.test.ts` validate the serializer's output against the real KSeF FA2/FA3 XSDs vendored under `docs/schemas/FA/`. Validation runs through `libxmljs2`, a native Node binding to libxml2, via the helper in `xsd-validator.ts`. That helper loads the target XSD, rewrites the upstream `<xsd:import schemaLocation="http://crd.gov.pl/...">` URL to a local `file://` path pointing at `docs/schemas/FA/bazowe/StrukturyDanych_v10-0E.xsd`, and uses libxmljs2's `baseUrl` option so that further relative `<xsd:include>` directives (e.g. `KodyKrajow_v10-0E.xsd` inside `bazowe/`) resolve offline. Canonical fixtures are vendored into `tests/fixtures/xml/` from the MIT-licensed `ksef-client-csharp` reference — no network calls are made at test time.

## Graceful fallback

`libxmljs2` is a native module that occasionally fails to compile on specific Node minor versions or uncommon platforms. To keep CI green regardless, `xsd-validator.ts` wraps the `require('libxmljs2')` call in a try/catch and exports a runtime flag `libxmljsAvailable`. Every XSD test file opens with `describe.skipIf(!libxmljsAvailable)` so that when the native module is absent, the entire suite skips cleanly instead of failing. A CI entry that cannot build the module will still report a green run with the XSD tests marked skipped.

## Escalation plan

If install flakiness exceeds ~5% of CI runs across the Node 20 / 22 / 24 matrix, the plan is to swap `libxmljs2` for a `child_process.spawnSync('xmllint', ['--schema', xsdPath, '-'])` invocation. `xmllint` is available on every GitHub-hosted runner image and requires no native build step. The validator module's public surface (`validateAgainstXsd(xml, xsdPath)` returning `{ valid, errors }`) is deliberately shaped so either backend can satisfy it without touching the test files.
