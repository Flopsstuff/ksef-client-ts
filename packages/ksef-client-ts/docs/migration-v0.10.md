# Migration Guide: v0.10.0

Version `0.10.0` introduces a significant refactoring to improve portability and reduce the bundle size for web and edge environments. This guide outlines the breaking changes and how to update your code.

## Node.js-specific Features Moved to a Separate Entry Point

To keep the core `ksef-client-ts` library free of filesystem dependencies (so it runs on Deno and edge functions without Node-specific filesystem access), filesystem-dependent and other Node-only features have been moved to a separate entry point: `ksef-client-ts/node`.

If your application runs on Node.js and uses any of the features listed below, you will need to update your import paths.

### Affected Features

1. **Offline Invoice Storage:** The `FileOfflineInvoiceStorage` class, which uses the filesystem to store offline invoices, is now exposed via the `ksef-client-ts/node` entry point.

    **Before:**

    ```typescript
    import { FileOfflineInvoiceStorage } from 'ksef-client-ts';
    ```

    **After:**

    ```typescript
    import { FileOfflineInvoiceStorage } from 'ksef-client-ts/node';
    ```

2. **XSD Schema Validation:** The `validateAgainstXsd` function and its related helpers rely on `libxmljs2`, a native Node.js module. These are now available from the `ksef-client-ts/node` entry point.

    **Before:**

    ```typescript
    import { validateAgainstXsd } from 'ksef-client-ts';
    ```

    **After:**

    ```typescript
    import { validateAgainstXsd } from 'ksef-client-ts/node';
    ```

    This also applies to `FA_XSD_PATHS`, `PEF_XSD_PATHS`, `libxmljsAvailable`, `resolveXsdFor`, and `isMissingLibxmljsError`.

3. **High-Water-Mark Storage for Incremental Export:** The `FileHwmStore`, used for persisting the high-water-mark in incremental invoice exports, has been moved.

    **Before:**

    ```typescript
    import { FileHwmStore } from 'ksef-client-ts';
    ```

    **After:**

    ```typescript
    import { FileHwmStore } from 'ksef-client-ts/node';
    ```

### Rationale

This change allows developers to use `ksef-client-ts` in a wider range of JavaScript environments without including unnecessary Node.js-specific code, leading to smaller bundles and better performance, especially in serverless and edge computing contexts.

## Troubleshooting

The `ksef-client-ts/node` entry point is published as a [subpath export](https://nodejs.org/api/packages.html#subpath-exports). Two toolchain setups need attention after you update an import.

### TypeScript: `Cannot find module 'ksef-client-ts/node'` (TS2307)

If TypeScript reports `TS2307` for the new import even though the code runs fine at runtime, your project is using the legacy module resolution that does not read the package `exports` map. Set `moduleResolution` to a value that supports subpath exports:

```json
{
  "compilerOptions": {
    "module": "node16",
    "moduleResolution": "node16"
  }
}
```

`nodenext` or `bundler` work too. The legacy `node` (a.k.a. `node10`) resolution cannot resolve subpath exports and will keep failing.

### CommonJS: the moved symbol is `undefined`

Under CommonJS, importing a moved symbol from the root entry point no longer throws at `require` time — it silently resolves to `undefined`, and you only see the failure later when you use it:

```js
// ❌ FileHwmStore is undefined here — no error yet
const { FileHwmStore } = require('ksef-client-ts');
new FileHwmStore(); // TypeError: FileHwmStore is not a constructor

// ✅ require from the /node entry point instead
const { FileHwmStore } = require('ksef-client-ts/node');
```

If you hit a `TypeError: X is not a constructor` (or a call on `undefined`) for any of the moved symbols, update the `require` path to `ksef-client-ts/node`.
