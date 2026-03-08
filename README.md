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

## Installation

```bash
npm install ksef-client-ts
# or
yarn add ksef-client-ts
```

Requires **Node.js 18+**.

## Quick Start

```ts
import { KSeFClient } from 'ksef-client-ts';

const client = new KSeFClient({ environment: 'TEST' });
await client.crypto.init();

const challenge = await client.auth.getChallenge();
// ... authenticate, open session, send invoices
```

See the [examples](https://flopsstuff.github.io/ksef-client-ts/examples) and [API reference](https://flopsstuff.github.io/ksef-client-ts/api-reference) for full usage.

## CLI

```bash
ksef auth login --token "$KSEF_TOKEN" --nip "$KSEF_NIP"
ksef session open
ksef invoice send invoice.xml
ksef session close
```

See the [CLI reference](https://flopsstuff.github.io/ksef-client-ts/cli) for all commands and options.

## Development

```bash
yarn install      # Install dependencies (yarn 4.x via Corepack)
yarn build        # Build ESM + CJS + DTS via tsup
yarn lint         # Type-check (tsc --noEmit)
yarn test         # Run all tests (vitest)
```

## License

[MIT](LICENSE)
