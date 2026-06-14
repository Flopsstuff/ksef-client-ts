# Migration Guide: v0.10.0

Version `0.10.0` introduces a significant refactoring to improve portability and reduce the bundle size for web and edge environments. This guide outlines the breaking changes and how to update your code.

## Node.js-specific Features Moved to a Separate Entry Point

To make the core `ksef-client-ts` library environment-agnostic (i.e., usable in browsers and edge functions without Node.js-specific dependencies), filesystem-dependent and other Node-only features have been moved to a separate entry point: `ksef-client-ts/node`.

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
