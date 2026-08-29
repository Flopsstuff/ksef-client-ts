# PDF Export

Render KSeF invoice and UPO receipt XML to a print-ready PDF, entirely offline, from a declarative template. Covers installing the optional `pdfmake` peer, the render functions, choosing and authoring a template, labels and locales, the verification QR code, and the CLI command.

---

## Overview

The `ksef-client-ts/pdf` subpath turns a KSeF document (invoice or UPO receipt) into a PDF visualization. Rendering is driven by a **template** — a declarative JSON block layout that maps XML fields onto page elements — so the visual output is fully customizable without touching library code.

The PDF layer handles two concerns:

1. **Layout** — a version-specific template describes the page as a tree of semantic blocks (header, parties, lines, totals, …) and primitives (text, columns, table, …).
2. **Rendering** — the template is interpreted into a PDF document and returned as raw bytes (`Uint8Array`) that you write to disk or stream to a client.

Supported documents:

| Document | Versions | Default built-in template |
|----------|----------|---------------------------|
| Standard invoice | `FA(2)`, `FA(3)` | `fa2-default`, `fa3-default` |
| UPO receipt | `UPO(4.2)`, `UPO(4.3)` | `upo-4_2`, `upo-4_3` |

`FA(1)` is not supported.

::: tip Node-only subpath
`ksef-client-ts/pdf` is a Node.js subpath — it reads bytes and returns bytes, and is not part of the fs-free core entry point. Importing it never pulls `pdfmake` into your bundle; the dependency is loaded lazily only when a render function actually runs.
:::

---

## Install the pdfmake peer

PDF rendering uses [`pdfmake`](https://www.npmjs.com/package/pdfmake) as an **optional peer dependency**. It is never installed automatically, so the core `ksef-client-ts` install stays dependency-free. To enable PDF output, install it explicitly:

```bash
npm i "pdfmake@^0.2.20"
```

Pin the `^0.2.20` range. **pdfmake 0.3.x is not supported** (its import and font-storage shape differ). Importing `ksef-client-ts/pdf` without `pdfmake` present still succeeds — only calling a render function throws a friendly, actionable install error:

```text
PDF rendering requires the optional peer dependency "pdfmake" (^0.2.20),
which is not installed. Install it with: npm i "pdfmake@^0.2.20"
```

---

## Render functions

All four render functions accept the XML as a `string` or a `Uint8Array`, take an optional `RenderOptions` object, and resolve to a `Uint8Array` of PDF bytes.

> Passing the **raw file bytes** (`Uint8Array`) rather than a decoded string is recommended when embedding the QR code: the verification hash is computed over the original bytes, so it matches the value registered by KSeF exactly.

### `renderInvoicePdf(xml, name, opts?)` — built-in template

Render an invoice with one of the built-in templates, selected by name.

```ts
import { readFile, writeFile } from 'node:fs/promises';
import { renderInvoicePdf } from 'ksef-client-ts/pdf';

const xml = await readFile('invoice.xml'); // Buffer is a Uint8Array
const pdf = await renderInvoicePdf(xml, 'fa3-default', { locale: 'pl+en', qr: true });
await writeFile('invoice.pdf', pdf);
```

### `renderInvoicePdfFromFile(xml, path, opts?)` — custom template file

Render with a custom template loaded from a `.json` file. The template is validated before rendering; a structural problem throws with a path-tagged message.

```ts
import { renderInvoicePdfFromFile } from 'ksef-client-ts/pdf';

const pdf = await renderInvoicePdfFromFile(xml, './templates/my-invoice.json', {
  locale: 'pl',
});
```

### `renderInvoicePdfFromTemplate(xml, template, opts?)` — custom template object

Render with a template you build in code (for example, generated at runtime).

```ts
import { renderInvoicePdfFromTemplate, type InvoiceTemplate } from 'ksef-client-ts/pdf';

const template: InvoiceTemplate = {
  schema: 'FA(3)',
  blocks: [
    { type: 'header', title: { label: 'invoice' }, number: 'Fa.P_2', date: 'Fa.P_1' },
    { type: 'totals', rows: [{ label: 'totalDue', path: 'Fa.P_15', format: 'money' }] },
  ],
};

const pdf = await renderInvoicePdfFromTemplate(xml, template);
```

### `renderUpoPdf(xml, opts?)` — UPO receipt

Render a UPO receipt. The version (`UPO(4.2)` / `UPO(4.3)`) is auto-detected and the matching built-in template is used.

```ts
import { renderUpoPdf } from 'ksef-client-ts/pdf';

const pdf = await renderUpoPdf(await readFile('upo.xml'));
```

### Version detection helpers

`detectInvoiceVersion` and `detectUpoVersion` inspect the XML and return the detected version or `null`.

```ts
import { detectInvoiceVersion, detectUpoVersion } from 'ksef-client-ts/pdf';

detectInvoiceVersion(xml); // 'FA(2)' | 'FA(3)' | null
detectUpoVersion(xml);     // 'UPO(4.2)' | 'UPO(4.3)' | null
```

---

## Render options

`RenderOptions` (all optional) is the last argument of every render function:

| Option | Type | Purpose |
|--------|------|---------|
| `locale` | `'pl' \| 'en' \| 'pl+en'` | Label language. Default `'pl'`. |
| `qr` | `boolean` | Embed the KSeF Code I verification QR derived from the invoice XML. |
| `ksefNumber` | `string` | KSeF number printed on the visualization; when absent the document is marked **OFFLINE**. |
| `env` | `'prod' \| 'test' \| 'demo'` | Environment used to derive the QR base URL. Default `'prod'`. |
| `baseQrUrl` | `string` | Override the QR base URL (offline / non-standard). |
| `logo` | `string` | Logo image as a `data:` URI. |
| `theme` | `{ accent?: string }` | Accent colour. |
| `bilingualSeparator` | `string` | Separator for the `pl+en` locale. Default `' / '`. |
| `strict` | `boolean` | Throw on a missing binding instead of rendering an empty string. |

`strict` covers the scalar bindings a template *prints*. It deliberately does not apply to `when` conditions or repeater `from` paths: the KSeF schemas make `Platnosc` and `RachunekBankowy` optional, so an absent node there is a cash-paid invoice rather than a template mistake, and throwing would reject valid documents. Typos in those paths are caught for the built-in templates by a lint that resolves every `when` and `from` against the reference fixtures.
| `invoiceHash` | `string` | Precomputed canonical invoice hash (base64), used verbatim for the QR. |

---

## Templates

A template is a declarative JSON document. It is deliberately **not** a scripting language — there are blocks, field bindings, conditions, repeaters, and formatters, and nothing else. Custom layouts compose the built-in blocks rather than register code.

### Structure

```text
{
  "schema":       "FA(3)",          // targets one XML kind (required)
  "page":         { … },            // size, orientation, margins
  "defaultStyle": { … },            // pdfmake style props applied everywhere
  "styles":       { "title": … },   // named, reusable style bags
  "labels":       { "seller": … },  // per-template label overrides
  "blocks":       [ … ]             // the page content (required)
}
```

The `schema` field binds a template to a single document kind. If you render an `FA(2)` document with an `FA(3)` template (or vice versa), the engine rejects the mismatch rather than producing a broken PDF.

### Blocks

**Semantic blocks** carry meaning and lay themselves out:

| Block | Renders |
|-------|---------|
| `header` | Title and optional logo on the left; invoice number, issue date and KSeF number stacked on the right |
| `parties` | Seller / buyer two-column panel |
| `lines` | Invoice line-item table |
| `totals` | Net / VAT / gross summary rows (a row reads one path or sums several) |
| `payment` | Payment details (amount paid, date, method) |
| `annotations` | Miscellaneous labelled fields |
| `qr` | The verification QR image |
| `footer` | Footer note |

**Primitive blocks** are layout building blocks: `text`, `columns`, `stack`, `each`, `table`, `image`, `divider`, `spacer`.

`each` repeats a group of blocks once per entry of a collection, with the entry as the binding root, so its children use item-relative paths. Use it where a table cannot fit a record on one row — the built-in UPO templates lay out each confirmed document this way, because a 35-character KSeF number beside a 44-character hash will not share a page-wide row.

### Bindings, labels, conditions, and formats

- **Binding paths** are dot-paths into the document body — e.g. `Fa.P_2` (invoice number), `Podmiot1.DaneIdentyfikacyjne.Nazwa` (seller name). Paths are relative to the body element, not the document wrapper.
- **`label`** references an i18n label key resolved per locale; **`text`** is a literal string printed as-is.
- **`when`** conditionally renders a block against a presence test. It accepts a binding path (e.g. `Fa.Platnosc`) or a context flag: `qr`, `offline`, `hasKsefNumber`.
- **`format`** names a value formatter: `money`, `date`, `number`, or `nip`.
- **`width`** (table columns only) sizes a column: a number of points, `'auto'` to fit the content, or `'*'` to share out what is left (the default). Sizing is worth setting explicitly — pdfmake gives every `'*'` column the *same* width and never shrinks it below the widest minimum content width among them, so a single long unbreakable token silently widens the whole table past the page edge.
- **`sum`** (totals rows only) adds several binding paths instead of reading one. A KSeF invoice has no single net or VAT total — the amounts are split across the `P_13_*` and `P_14_*` rate buckets — so the built-in templates aggregate them. Absent buckets are skipped, and the addition is decimal-exact. A totals row takes either `path` or `sum`, never both.

### Minimal example

A trimmed `FA(3)` template with a header, a seller/buyer panel, a line table, a total, and a conditional QR:

```json
{
  "schema": "FA(3)",
  "page": { "size": "A4", "margins": [40, 40, 40, 50] },
  "styles": {
    "title": { "fontSize": 20, "bold": true },
    "muted": { "color": "#666666", "fontSize": 8 }
  },
  "blocks": [
    { "type": "header", "title": { "label": "invoice" }, "number": "Fa.P_2", "date": "Fa.P_1", "ksefNumber": "opts.ksefNumber" },
    { "type": "divider" },
    {
      "type": "parties",
      "left":  { "label": "seller", "fields": ["Podmiot1.DaneIdentyfikacyjne.Nazwa", "Podmiot1.DaneIdentyfikacyjne.NIP"] },
      "right": { "label": "buyer",  "fields": ["Podmiot2.DaneIdentyfikacyjne.Nazwa", "Podmiot2.DaneIdentyfikacyjne.NIP"] }
    },
    {
      "type": "lines",
      "from": "Fa.FaWiersz",
      "columns": [
        { "label": "name", "path": "P_7",  "width": "*" },
        { "label": "qty",  "path": "P_8B", "width": 44, "format": "number" },
        { "label": "net",  "path": "P_11", "width": 70, "format": "money" }
      ]
    },
    {
      "type": "totals",
      "rows": [
        { "label": "totalNet", "sum": ["Fa.P_13_1", "Fa.P_13_2", "Fa.P_13_7"], "format": "money" },
        { "label": "totalDue", "path": "Fa.P_15", "format": "money" }
      ]
    },
    { "type": "qr", "when": "qr", "fit": 90 },
    { "type": "footer", "text": "ksef-client-ts", "style": "muted" }
  ]
}
```

The bundled `fa3-default` template is a good, complete starting point to copy and adapt.

---

## Locales

Labels are localizable, driven by the `locale` option:

| Locale | Output |
|--------|--------|
| `pl` (default) | Polish labels |
| `en` | English labels |
| `pl+en` | Both, concatenated per label |

For `pl+en`, each label is the Polish and English text joined by `bilingualSeparator` (default `' / '`). A template can also override individual labels via its `labels` map — useful for company-specific wording.

```ts
const pdf = await renderInvoicePdf(xml, 'fa3-default', {
  locale: 'pl+en',
  bilingualSeparator: ' | ',
});
```

---

## Verification QR (Code I)

Set `qr: true` to embed the KSeF **Code I** verification QR. It is derived automatically from the invoice XML — you do not supply a URL. The verification hash is computed over the original invoice bytes so it matches the value KSeF registered. Use `env` to pick the correct portal (`prod` by default), or `baseQrUrl` to override it for offline / non-standard cases.

```ts
const pdf = await renderInvoicePdf(xml, 'fa3-default', {
  qr: true,
  env: 'test',
  ksefNumber: '1234567890-20260705-ABCDEF012345-01',
});
```

When no `ksefNumber` is provided the visualization is marked **OFFLINE**. UPO receipts do not carry a QR code.

---

## CLI

The same rendering is available from the command line:

```bash
ksef invoice pdf invoice.xml
```

By default the invoice version is auto-detected and the matching built-in template (`fa2-default` / `fa3-default`) is used; UPO documents are auto-detected too. The PDF is written next to the source file with a `.pdf` extension.

```bash
# Built-in template, bilingual labels, with QR
ksef invoice pdf invoice.xml --locale pl+en --qr --ksef-number 1234567890-20260705-ABCDEF012345-01

# Custom template, explicit output path
ksef invoice pdf invoice.xml --template-file ./templates/my-invoice.json --out ./out/invoice.pdf

# UPO receipt (auto-detected, or force with --upo)
ksef invoice pdf upo.xml --upo

# UPO receipt with a custom layout
ksef invoice pdf upo.xml --template-file ./templates/my-upo.json
```

| Flag | Description |
|------|-------------|
| `--template <name>` | Built-in template name (mutually exclusive with `--template-file`) |
| `--template-file <path>` | Custom JSON template path (mutually exclusive with `--template`) |
| `--locale <pl\|en\|pl+en>` | Label language (default `pl`) |
| `--qr` | Embed the KSeF Code I QR derived from the XML |
| `--ksef-number <number>` | KSeF number to print (absent → marked OFFLINE) |
| `--upo` | Treat the input as a UPO document (otherwise auto-detected); ignored when a template is named explicitly |
| `--env <prod\|test\|demo>` | Environment for the QR base URL |
| `--out <path>` | Output PDF path (default: alongside the source) |

`--template` and `--template-file` are mutually exclusive — pass at most one. An explicit template takes precedence over document auto-detection, so a custom UPO layout is selected the same way an invoice one is; the renderer still rejects a template whose `schema` does not match the document. If `pdfmake` is not installed, the command exits with the same friendly install hint shown above.

---

## See also

- [QR Codes & Verification Links](./qr-codes.md) — the Code I / Code II verification URLs behind the embedded QR.
- [XML Serialization](./xml-serialization.md) — build the invoice XML that feeds the PDF renderer.
- [CLI](./cli.md) — the full command reference.
