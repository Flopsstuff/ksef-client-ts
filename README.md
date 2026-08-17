# ksef-client-ts

TypeScript client for the Polish National e-Invoice System (KSeF) API v2.

**[Documentation](https://flopsstuff.github.io/ksef-client-ts)** · **[NPM](https://www.npmjs.com/package/ksef-client-ts)**

## Features

- **Broad API coverage** — KSeF API v2.7.0 except the collective-identifier endpoints, types aligned with the official OpenAPI spec
- **Offline invoice mode** — full lifecycle for all 4 KSeF offline modes with QR KOD I + KOD II signing, deadline tracking, local storage, and technical correction
- **Full-featured CLI** — `ksef` with 15 command groups for auth, sessions, invoices, offline, batch upload, export, and more
- **High-level workflows** — auth, online/batch sessions, invoice export — full lifecycle in a single call
- **Built-in cryptography** — AES-256-CBC, RSA-OAEP, ECDH, XAdES-B signatures, self-signed certs (Node crypto)
- **External signing** — HSM, EPUAP, and smart card authentication via callback-based signing
- **Automatic token management** — AuthManager: token injection, 401 refresh with dedup
- **Opt-in circuit breaker** — pauses outgoing requests for a short cooldown window after consecutive upstream failures
- **Streaming batch uploads** — constant-memory batch upload via Web Streams API with ZIP bomb protection
- **Incremental export** — HWM-based paginated export with file-based state persistence
- **Multiple document structures** — FA, PEF, PEF_KOR, FA_RR with typed FormCode constants and UPO parsing
- **Invoice XML serialization (FA2/FA3/PEF/PEF_KOR)** — build XSD-compliant invoice XML from typed TypeScript objects with correct element ordering (including the FA3 per-VAT-rate interleave) and namespace injection; `ksef invoice build` exposes the same pipeline to shell workflows with JSON/YAML input and optional XSD validation
- **Invoice XML validation** — three-level client-side validation (well-formedness, XSD schema via Zod, NIP/PESEL checksums, future date rejection) with auto-detection for all 6 invoice types
- **PDF visualization** — render FA(2)/FA(3) invoices and UPO(4.2)/(4.3) receipts to print-ready PDF offline from version-specific, declarative templates, with Polish/English/bilingual labels and the embedded KSeF Code I verification QR; `ksef invoice pdf` brings the same rendering to shell workflows. Requires the optional `pdfmake` peer (`npm i "pdfmake@^0.2.20"`), so the core install stays dependency-free
- **Typed errors with RFC 7807 Problem Details** — `KSeFError` hierarchy with dedicated classes for 400/401/403/410/429 carrying structured diagnostic context; exhaustive dispatch via the `KSeFApiProblem` union and `assertNever`; fluent request builders
- **Comprehensive test coverage** — unit + E2E tests across HTTP, crypto, services, workflows; CI on every change
- **Interactive setup wizard** — `ksef setup` guides through environment selection, authentication, and token generation in one flow
- **Zero HTTP dependencies** — native `fetch` (Node 18+); dual ESM/CJS via tsup
- **fs-free core** — the main entry point is free of filesystem access, so it runs on Node, Deno, and edge runtimes; Node-only features (filesystem storage, XSD validation) are available via the `ksef-client-ts/node` export

Requires **Node.js 18+**.

## Install

Install CLI globally:

```bash
npm i -g ksef-client-ts
ksef --help
```

Install in a project:

```bash
# Choose one package manager:
# npm
npm i ksef-client-ts
# Yarn
yarn add ksef-client-ts
# pnpm
pnpm add ksef-client-ts
```

For local development, clone and build:

```bash
git clone https://github.com/Flopsstuff/ksef-client-ts.git
cd ksef-client-ts
yarn install && yarn build
```

```ts
import { KSeFClient } from 'ksef-client-ts';

const client = new KSeFClient({ environment: 'TEST' });
await client.crypto.init();

const challenge = await client.auth.getChallenge();
// ... authenticate, open session, send invoices
```

```bash
ksef auth login --token "$KSEF_TOKEN" --nip "$KSEF_NIP"
ksef session open              # 1. Open online session (required)
ksef invoice send invoice.xml  # 2. Send invoice
ksef session invoices          # 3. Verify invoice status
ksef session close             # 4. Close session (optional)
```

### Node-only features

Filesystem-backed helpers and native XSD validation live behind a separate `ksef-client-ts/node` entry point, keeping the core import [fs-free](https://flopsstuff.github.io/ksef-client-ts/migration-v0.10):

```ts
import { FileOfflineInvoiceStorage, FileHwmStore, validateAgainstXsd } from 'ksef-client-ts/node';
```

See the [documentation](https://flopsstuff.github.io/ksef-client-ts) for full usage, [API reference](https://flopsstuff.github.io/ksef-client-ts/api-reference), and [CLI reference](https://flopsstuff.github.io/ksef-client-ts/cli).

## Repository layout

This repository is a Yarn 4.x workspace monorepo. The library and CLI live in the `ksef-client-ts` workspace; root-level `yarn` commands delegate to it.

| Package | Description |
|---------|-------------|
| [`packages/ksef-client-ts`](./packages/ksef-client-ts) | The `ksef-client-ts` library + `ksef` CLI (published to npm) |

## Development

Run these from the repo root (they delegate to the `ksef-client-ts` workspace):

```bash
yarn install      # Install dependencies (yarn 4.x via Corepack)
yarn build        # Build ESM + CJS + DTS via tsup
yarn lint         # Type-check (tsc --noEmit)
yarn test         # Run unit tests
yarn test:e2e     # Run E2E tests
yarn lint:md      # Lint Markdown docs
yarn docs:dev     # VitePress docs dev server
yarn check-api    # OpenAPI coverage check
```

## Related

- [KSeF Web Portal](https://ap.ksef.mf.gov.pl/web/) — official KSeF web application (token management, permissions, invoices)
- [KSeF official docs](https://github.com/CIRFMF/ksef-docs) — official documentation (Polish)
- [KSeF docs translated](https://flopsstuff.github.io/ksef-docs/) — translated documentation (EN/RU/UK), [source on GitHub](https://github.com/Flopsstuff/ksef-docs)
- [ksef-client-csharp](https://github.com/CIRFMF/ksef-client-csharp) — official C# reference client
- [ksef-client-java](https://github.com/CIRFMF/ksef-client-java) — official Java reference client

## License

[MIT](LICENSE)

---

[![Tests](https://github.com/Flopsstuff/ksef-client-ts/actions/workflows/ci.yml/badge.svg)](https://github.com/Flopsstuff/ksef-client-ts/actions/workflows/ci.yml)
![Coverage](https://img.shields.io/endpoint?url=https://gist.githubusercontent.com/Fl0p/1558034ac67a11548c7f8f0c05e8d4c0/raw/ksef-client-ts-coverage.json&cacheSeconds=300)
![NPM Version](https://img.shields.io/npm/v/ksef-client-ts?color=green)
![NPM Downloads](https://img.shields.io/npm/dm/ksef-client-ts)
![GitHub Stars](https://img.shields.io/github/stars/Flopsstuff/ksef-client-ts)
![GitHub Forks](https://img.shields.io/github/forks/Flopsstuff/ksef-client-ts)
![GitHub License](https://img.shields.io/github/license/Flopsstuff/ksef-client-ts)
