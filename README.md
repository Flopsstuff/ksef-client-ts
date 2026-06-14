# ksef-client-ts (monorepo)

Yarn 4.x workspace monorepo for `ksef-client-ts` and future companion packages.

## Packages

| Package | Description |
|---------|-------------|
| [`packages/ksef-client-ts`](./packages/ksef-client-ts) | TypeScript client library for the Polish National e-Invoice System (KSeF) API v2 |

## Development

All root-level `yarn` commands delegate to the library package:

```bash
yarn build          # Build ESM + CJS + DTS
yarn test           # Unit tests
yarn test:e2e       # End-to-end tests
yarn lint           # Type-check
yarn lint:md        # Lint Markdown docs
yarn docs:dev       # VitePress dev server
yarn check-api      # OpenAPI coverage check
yarn split-openapi  # Split open-api.json into per-domain chunks
yarn sync-schemas   # Download XSD schemas from CIRFMF/ksef-docs
yarn generate-schemas # Generate Zod schemas from XSD
```

See [`packages/ksef-client-ts/README.md`](./packages/ksef-client-ts/README.md) for full documentation.
