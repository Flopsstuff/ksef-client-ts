# ksef-client-ts

TypeScript client for the Polish National e-Invoice System (KSeF) API v2.

**[Documentation](https://flopsstuff.github.io/ksef-client-ts)**

## Features

- **Complete API coverage** — auth, sessions, invoices, permissions, tokens, certificates, QR codes, and more
- **Full-featured CLI** — `ksef` with many command groups and subcommands for day-to-day KSeF workflows
- **Full documentation** — VitePress site: Quick Start, API reference, OpenAPI spec
- **OpenAPI aligned** — types checked against the official KSeF spec; full spec and domain chunks in `docs/`
- **Comprehensive test coverage** — Vitest across HTTP, crypto, services, builders; CI on every change
- **Zero HTTP dependencies** — native `fetch` (Node 18+); dual ESM/CJS via tsup
- **Built-in cryptography** — AES-256-CBC, RSA-OAEP, ECDH, XAdES-B, self-signed certs (Node crypto)
- **Automatic token management** — AuthManager: token injection, 401 refresh with dedup, `loginWithToken` / `loginWithCertificate`
- **Typed errors & fluent builders** — `KSeFError` hierarchy (401, 403, 429, validation) and request builders

Requires **Node.js 18+**. Package not yet published — clone and build locally:

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
ksef session open
ksef invoice send invoice.xml
ksef session close
```

See the [documentation](https://flopsstuff.github.io/ksef-client-ts) for full usage, [API reference](https://flopsstuff.github.io/ksef-client-ts/api-reference), and [CLI reference](https://flopsstuff.github.io/ksef-client-ts/cli).

## Development

```bash
yarn install      # Install dependencies (yarn 4.x via Corepack)
yarn build        # Build ESM + CJS + DTS via tsup
yarn lint         # Type-check (tsc --noEmit)
yarn test         # Run all tests (vitest)
```

## Related

- [KSeF official docs](https://github.com/CIRFMF/ksef-docs) — official documentation (Polish)
- [KSeF docs translated](https://flopsstuff.github.io/ksef-docs/) — translated documentation (EN/RU/UK)
- [ksef-client-csharp](https://github.com/CIRFMF/ksef-client-csharp) — official C# reference client
- [ksef-client-java](https://github.com/CIRFMF/ksef-client-java) — official Java reference client

## Status

[![Unit Tests](https://github.com/Flopsstuff/ksef-client-ts/actions/workflows/test.yml/badge.svg)](https://github.com/Flopsstuff/ksef-client-ts/actions/workflows/test.yml)

![Coverage](https://img.shields.io/endpoint?url=https://gist.githubusercontent.com/Fl0p/1558034ac67a11548c7f8f0c05e8d4c0/raw/ksef-client-ts-coverage.json&cacheSeconds=300)

## License

[MIT](LICENSE)
