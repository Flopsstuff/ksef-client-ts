# Running on Deno and Edge Runtimes

`ksef-client-ts` runs on Deno-based runtimes — including Supabase Edge Functions — from v0.8.0 onward. This page covers setup, what is and isn't available under Deno, and how to consume the library the same way a Node user would.

---

## Overview

The library targets Node.js as its primary runtime, but its public surface (authentication, session encryption, invoice send/query, QR codes, offline mode, Zod-based validation) uses only APIs that exist in both Node and Deno's Node compatibility layer. A single native dependency — `libxmljs2`, used only for optional XSD validation — is the one feature that does not cross over.

Three runtime-specific fixes landed across v0.7.2 and v0.8.0 to close the gaps that previously prevented the library from running on Deno: preserving the `node:` prefix on built-in imports in the bundled output, SPKI extraction before the RSA-OAEP call, and the RSA-OAEP call itself moving from `node:crypto.publicEncrypt` (whose hash option Deno silently ignores) to Web Crypto (`crypto.subtle.encrypt`).

---

## Installation

Deno resolves npm packages natively via the `npm:` specifier — no lockfile, no `package.json`, no `npm install` required. Import the library directly:

```ts
import { KSeFClient } from 'npm:ksef-client-ts@0.8.0-alpha.0';

const client = new KSeFClient({ environment: 'TEST' });
const challenge = await client.auth.getChallenge();
console.log(challenge.timestampMs);
```

Run it:

```bash
deno run --allow-net --allow-read --allow-env script.ts
```

Deno downloads the tarball and its transitive dependencies on first run and caches them at `~/Library/Caches/deno/npm/` (or the equivalent path on Linux/Windows). Subsequent runs are offline.

If you prefer pinning via a `deno.json`:

```json
{
  "imports": {
    "ksef-client-ts": "npm:ksef-client-ts@0.8.0-alpha.0"
  }
}
```

Then:

```ts
import { KSeFClient } from 'ksef-client-ts';
```

### Using a local `node_modules/` (optional)

When you already have a `node_modules/` populated by `npm` / `yarn` / `pnpm` (for example, in a polyglot project where the same codebase runs on both Node and Deno), tell Deno to resolve packages from it:

```json
{
  "nodeModulesDir": "manual"
}
```

This is the mode Supabase Edge Functions uses under the hood.

---

## What works

Everything the library exposes, with one exception listed in the next section:

| Feature | Works on Deno |
|---------|--------------|
| Authentication (`loginWithToken`, `loginWithCertificate`, `loginWithPkcs12`, external-signature flow) | ✅ |
| Session management (online and batch) | ✅ |
| Invoice send / query / download | ✅ |
| UPO (receipt) fetching and parsing | ✅ |
| Permission management | ✅ |
| Certificate enrollment | ✅ |
| QR code generation (PNG, SVG) | ✅ |
| Invoice XML serialization (FA2, FA3, PEF, PEF_KOR) | ✅ |
| Offline mode (in-memory storage) | ✅ |
| Zod-based invoice validation (`validate()`, `validateSchema()`) | ✅ |
| HTTP retry, rate-limit, and circuit-breaker policies | ✅ |

All cryptographic operations — RSA-OAEP token encryption, AES-256-CBC session encryption, ECDH+AES-GCM alternative, CSR and self-signed certificate generation — use the standard `node:crypto` and Web Crypto APIs and work identically on Deno.

---

## What doesn't work: `validateAgainstXsd`

The one API that does not work on Deno is `validateAgainstXsd(xml, xsdPath)`, used for strict XSD-level invoice validation against the official KSeF schemas. It depends on `libxmljs2`, which wraps the native `libxml2` C library via N-API. Deno's Node compatibility layer cannot load that binding (any attempt to `require('libxmljs2')` or `import('libxmljs2')` will segfault the runtime — an upstream Deno limitation, not something fixable in the library).

### What happens if you call it anyway

Assuming `libxmljs2` is **not** installed (the expected state on Deno — you should not install it, see below), the call throws a clear, catchable error:

```ts
try {
  validateAgainstXsd(xml, xsdPath);
} catch (err) {
  // Error: libxmljs2 is not installed; cannot run XSD validation.
  // Install it as an optional peer dependency (e.g. `yarn add -O libxmljs2` or `npm i -O libxmljs2`).
}
```

The library exports a helper to identify this specific failure so you can fall back gracefully:

```ts
import { validateAgainstXsd, validate, isMissingLibxmljsError } from 'npm:ksef-client-ts';

try {
  const result = validateAgainstXsd(xml, xsdPath);
  // ...
} catch (err) {
  if (isMissingLibxmljsError(err)) {
    // Fall back to Zod-based schema validation — pure JS, works on Deno.
    const result = await validate(xml);
    // ...
  } else {
    throw err;
  }
}
```

### Zod validation is usually enough

For the common case — "build an invoice XML, verify it's structurally correct before sending" — Zod-based validation (`validate()`, `validateSchema()`) is sufficient. It checks every required field, format (NIP, PESEL, KSeF numbers), enum values, multi-rate VAT group constraints, and business rules end-to-end. XSD validation adds pedantic structural checks against the official schema; it's useful for debugging hard-to-explain server-side rejections, not for routine validation.

### Why you should not `install` libxmljs2 on Deno

If `libxmljs2` somehow ends up in a `node_modules/` that Deno can see (for example, a shared folder with a Node project), the segfault happens **at library import time**, not at call time. Your whole app fails to start with a segmentation fault rather than a catchable error.

The library marks `libxmljs2` as an optional peer dependency, so a plain `deno add npm:ksef-client-ts` or `npm install ksef-client-ts` will never pull it in transitively. Only an explicit direct install will. On a Deno-only setup, there is no reason to do that.

---

## Supabase Edge Functions

Edge Functions use Deno 1.x with the Node compatibility layer enabled and resolve npm packages from a per-function `node_modules/` generated at deploy time. Nothing in this library requires special configuration for that environment.

### Example function

```ts
// supabase/functions/ksef-check/index.ts
import { KSeFClient } from 'npm:ksef-client-ts@0.8.0-alpha.0';

Deno.serve(async (_req) => {
  const nip = Deno.env.get('KSEF_NIP');
  const token = Deno.env.get('KSEF_TOKEN');
  if (!nip || !token) {
    return new Response('missing credentials', { status: 500 });
  }

  const client = new KSeFClient({ environment: 'PROD' });
  await client.loginWithToken(token, nip);

  const grants = await client.permissions.queryPersonalGrants();

  return Response.json({ permissions: grants.permissions });
});
```

Deploy:

```bash
supabase functions deploy ksef-check
```

Set secrets:

```bash
supabase secrets set KSEF_NIP=1234567890 KSEF_TOKEN=...
```

### Storage considerations

Edge Function file systems are ephemeral and read-only on the function path. The library's offline-mode file storage (`FileOfflineInvoiceStorage`, which writes to `~/.ksef/offline/`) does not work there — use `InMemoryOfflineInvoiceStorage` instead, or back offline state with a database/object store of your own.

---

## Troubleshooting

### `Import "fast-xml-parser" not a dependency`

Deno cannot find the npm dependency. Either:

1. Use the full `npm:` prefix in your import: `import { KSeFClient } from 'npm:ksef-client-ts'`
2. Add a `deno.json` with `{ "nodeModulesDir": "manual" }` and populate `node_modules/` via `npm`/`yarn` first

### Segfault during import

Almost always means `libxmljs2` is present in a `node_modules/` directory that Deno is resolving. Remove it:

```bash
rm -rf node_modules/libxmljs2
```

If you're on a dev machine that runs both Node (with `libxmljs2` for XSD validation) and Deno (for Edge Functions testing), keep them in separate project directories with separate `node_modules/`.

### HTTP 450 on `loginWithToken` under Supabase Edge Functions

If you see `status.details: ["Invalid token encryption."]` on auth status, you're on a pre-0.8.0 version. Earlier versions passed OAEP parameters through `node:crypto.publicEncrypt`, which Deno's Node-compat layer silently ignored — Deno emitted OAEP-SHA1 ciphertext that KSeF rejects, regardless of what the library requested. 0.8.0+ uses Web Crypto natively (`crypto.subtle.encrypt` with `{name: 'RSA-OAEP', hash: 'SHA-256'}`), which is runtime-portable by construction.

Check the installed version:

```ts
import pkg from 'npm:ksef-client-ts/package.json' with { type: 'json' };
console.log(pkg.version);  // must be ≥ 0.8.0
```

On older versions, no client-side workaround exists — `publicEncrypt` on Deno cannot be forced to emit OAEP-SHA256.
