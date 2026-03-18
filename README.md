# ksef-client-ts

TypeScript client for the Polish National e-Invoice System (KSeF) API v2.

**[Documentation](https://flopsstuff.github.io/ksef-client-ts)**

## Features

- Full KSeF API v2 coverage: authentication, sessions, invoices, permissions, tokens, certificates
- AES-256-CBC / RSA-OAEP / ECDH+AES-GCM encryption, XAdES-B XML signatures
- Self-signed certificate generation, CSR generation (RSA-2048 / ECDSA P-256)
- QR code generation and invoice/certificate verification links
- Fluent builders for auth requests, invoice queries, and permission grants
- CLI tool (`ksef`) for terminal usage
- Dual ESM/CJS output, zero HTTP dependencies (native `fetch`, Node.js 18+)

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
