# ksef-client-ts

TypeScript client for the Polish National e-Invoice System (KSeF) API v2.

**[Documentation](https://flopsstuff.github.io/ksef-client-ts)** · **[GitHub](https://github.com/Flopsstuff/ksef-client-ts)**

## Install

```bash
npm i ksef-client-ts      # library
npm i -g ksef-client-ts   # ksef CLI
```

Requires **Node.js 20+**. Dual ESM/CJS output via tsup.

## Quick start

```ts
import { KSeFClient } from 'ksef-client-ts';

const client = new KSeFClient({ environment: 'TEST' });
await client.crypto.init();

const challenge = await client.auth.getChallenge();
// ... authenticate, open a session, send invoices
```

```bash
ksef auth login --token "$KSEF_TOKEN" --nip "$KSEF_NIP"
ksef session open              # 1. Open online session (required)
ksef invoice send invoice.xml  # 2. Send invoice
ksef session invoices          # 3. Verify invoice status
```

Node-only helpers (filesystem storage, native XSD validation) are available from the `ksef-client-ts/node` entry point.

## Documentation

The full feature list, guides, API and CLI reference, and the v0.10 migration guide live in the **[documentation](https://flopsstuff.github.io/ksef-client-ts)** and the **[GitHub README](https://github.com/Flopsstuff/ksef-client-ts)**:

- [Quick start](https://flopsstuff.github.io/ksef-client-ts/quick-start)
- [API reference](https://flopsstuff.github.io/ksef-client-ts/api-reference)
- [CLI reference](https://flopsstuff.github.io/ksef-client-ts/cli)
- [Migration guide (v0.10)](https://flopsstuff.github.io/ksef-client-ts/migration-v0.10)

## License

[MIT](LICENSE)
