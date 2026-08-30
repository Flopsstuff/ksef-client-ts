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
| Standard invoice | `FA(2)`, `FA(3)` | `fa2-default`, `fa3-default` (plus `fa3-showcase`, a demo of the DSL) |
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

### `getBuiltinTemplate(name)` / `builtinTemplateNames()` — start from a built-in

Writing a full FA(3) layout by hand to change two colours is not a reasonable way to get a custom template. `getBuiltinTemplate` returns one as a plain object to adapt and pass to `renderInvoicePdfFromTemplate`; `builtinTemplateNames` lists what is available.

```ts
import { getBuiltinTemplate, renderInvoicePdfFromTemplate } from 'ksef-client-ts/pdf';

const template = getBuiltinTemplate('fa3-default')!;
template.styles = {
  ...template.styles,
  title: { ...template.styles?.title, color: '#1B4965' },
};
const pdf = await renderInvoicePdfFromTemplate(xml, template);
```

What comes back is a **copy**. The built-ins are validated once at import and held for the life of the process, so editing the returned object cannot repaint a later render by that name.

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
| `locale` | `'pl' \| 'en' \| 'uk'`, or any two joined by `+` | Label language. Default `'pl'`. |
| `totals` | `'none' \| 'buckets' \| 'summary' \| 'both'` | Which tax breakdown to print above the amount due. Default `'buckets'`. |
| `qr` | `boolean` | Embed the KSeF Code I verification QR derived from the invoice XML. |
| `ksefNumber` | `string` | KSeF number printed on the visualization; when absent the document is marked **OFFLINE**. |
| `env` | `'prod' \| 'test' \| 'demo'` | Environment used to derive the QR base URL. Default `'prod'`. |
| `baseQrUrl` | `string` | Override the QR base URL (offline / non-standard). |
| `logo` | `string` | Logo image as a `data:` URI. PNG or JPEG only. |
| `theme` | `{ accent?: string }` | Accent colour for the title and headings. |
| `bilingualSeparator` | `string` | Separator for the bilingual locales. Default `' / '`. |
| `strict` | `boolean` | Throw on a missing binding instead of rendering an empty string. |

`strict` polices the scalar bindings a template prints — a misspelled path throws instead of leaving a blank line. A binding the document may legitimately omit is exempted by marking it `optional` in the template, and the built-in templates mark exactly the paths the FA schema declares optional. `Fa.P_15` is not one of them: an invoice always states its amount due, so a strict render still catches a typo there.

It deliberately does not apply to `when` conditions, repeater `from` paths, `firstOf` alternatives or `sum` members: those are sets where absence is the normal case, not a mistake. Typos in them are caught for the built-in templates by a lint that resolves every such path against the reference fixtures.
| `invoiceHash` | `string` | Precomputed canonical invoice hash (base64), used verbatim for the QR. |
| `notes` | `{ head, body }[]` | Extra sections printed where the template puts its `notes` block. |

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
| `header` | Title and optional logo on the left; invoice number, issue date and KSeF number stacked on the right. With `offlineStyle` set, the OFFLINE marker takes the KSeF number's place when the document carries none |
| `parties` | Seller / buyer two-column panel; a line that resolves empty is skipped. A labelled group reads `from` an optional parent element — the buyer's address, say — and is dropped whole when the document carries none |
| `lines` | Invoice line-item table. Takes `when`, because an invoice does not always carry its items in the same place — see below |
| `totals` | Net / VAT / gross summary rows (a row reads one path or sums several) |
| `payment` | Payment details (status, dates, method, amounts), then the repeating sections of `groups` — the part payments and the bank accounts. A row takes `when`, so one figure can be listed once per reading and only the applicable label prints, and `from`, so a repeated element prints one line per entry |
| `annotations` | Miscellaneous labelled fields |
| `notes` | The caller's own sections, from `notes` — a heading over a body, each |
| `qr` | One KSeF verification QR — `code: "invoice"` (Code I, the default) or `code: "certificate"` (Code II) |
| `footer` | Footer note |

A template may also declare a running page footer, drawn in the bottom page margin on every page:

```json
"pageFooter": { "style": "footerNote" }
```

It prints the localized attribution on the left and a `Page 1 of 3` indicator on the right, aligned with `page.margins`. The page total is only known once pdfmake has laid the content out, so this cannot be a block. The attribution text is fixed by the renderer — a template may restyle the footer or omit it, but not reword the credit.

A `qr` block's `fit` is the printed side in points, quiet zone included, and it is exact — give two blocks the same `fit` and they come out the same size on the page, however much data each code carries. What differs instead is the module width, which is what a scanner cares about: Code I is 41 modules while Code II carries a signature and runs 57 over an EC key or 85 over RSA, so the same box makes Code II's modules roughly half as wide as Code I's. The renderer refuses a `fit` that would leave less than a point per module rather than printing a code nothing can read. The built-in templates use 104 for both.

**Primitive blocks** are layout building blocks: `text`, `columns`, `stack`, `each`, `table`, `image`, `divider`, `spacer`. A `divider` draws a hairline across the content width — whatever `page.size`, `page.orientation` and `page.margins` make that — and a `spacer` adds its `height` and nothing else; neither costs a line of leading.

`each` repeats a group of blocks once per entry of a collection, with the entry as the binding root, so its children use item-relative paths. Use it where a table cannot fit a record on one row — the built-in UPO templates lay out each confirmed document this way, because a 35-character KSeF number beside a 44-character hash will not share a page-wide row.

### How much has been paid

`Fa.Platnosc` states this through a choice, and a template has to bind both branches or it will show nothing for half of all invoices:

- **`Zaplacono`** — a bare `1` meaning settled in full, alongside `DataZaplaty`;
- **`ZnacznikZaplatyCzesciowej`** (`1` paid in part, `2` paid in full) alongside up to 100 **`ZaplataCzesciowa`** entries, each carrying an amount, a date and a payment form.

An invoice settled in instalments takes the second branch and so carries no `Zaplacono` at all. The `paidInFull` and `paidInPart` context flags cover both branches, and the status prints as a label on its own — the schema's `1` says nothing to a reader that the label does not already say.

The part payments themselves are a `groups` entry, so each one's amount, date and form stay together instead of being split into three separate lists. A group's field paths are entry-relative; write a leading `/` to reach the document root instead, which is how a part payment's amount keeps the currency the invoice states once at the top.

Two more repeating sections belong to the same story, and neither lives under `Platnosc`:

| Element | What it holds | Does it add up to `P_15`? |
|---------|---------------|---------------------------|
| `Fa.ZaliczkaCzesciowa` (≤ 31) | The payments an advance invoice documents having received — each `P_15Z` is a part *of* `P_15` | **Yes**, exactly |
| `Fa.Platnosc.ZaplataCzesciowa` (≤ 100) | Settlements against the receivable | No, not while `ZnacznikZaplatyCzesciowej` is `1` |
| `Fa.FakturaZaliczkowa` (≤ 100) | The advance invoices a settlement invoice is issued against, by KSeF number or by their own | — |

The two are easy to confuse and read very differently on the page, so the built-in templates print them under separate headings — `Otrzymane płatności` and `Zapłaty częściowe`.

### What `P_15` is called

`P_15` does not mean the same thing on every document, so a template cannot give it one fixed label. The FA schemas define it as the total receivable, with three exceptions:

- on an **advance invoice** (`RodzajFaktury` `ZAL` or `KOR_ZAL`) it is the payment the document records as *already received* — labelling it `Do zapłaty` tells the reader to pay it a second time;
- on a **settlement invoice** (`ROZ`, art. 106f ust. 3) it is what remains to be paid after the advances. Its lines and VAT buckets state the *whole* order, so this is the page where a flat `Do zapłaty` reads as a contradiction: line items of 615,00 above a demand for 165,00. Such an invoice comes in two shapes — see below;
- when the document states the figure itself — **`Fa.Rozliczenie.DoZaplaty`** (`P_15` plus surcharges minus deductions), **`Fa.Rozliczenie.DoRozliczenia`** (an overpayment to refund or carry forward), or a **part-payment marker** — that figure is what the reader acts on and `P_15` is only the total.

Exactly one of the `p15IsAmountDue`, `p15IsAdvancePaid`, `p15IsRemainder` and `p15IsAmountTotal` context flags is true for a given document.

A settlement invoice is where this matters most on the page. Its **line items state the whole order**, but its **tax summary and `P_15` cover only what is left**: the advance invoice already declared the tax on its own share, and declaring the full amount again would tax the deal twice. So an FA(3) settlement of a 615,00 order against a 450,00 advance carries line items worth 500,00 net while `P_13_1` is 134,15, `P_14_1` is 30,85 and `P_15` is 165,00 — figures that look inconsistent until you know which base each one uses.

#### The two shapes of a settlement invoice

An issuer may state what is left in either of two ways, and both have to render correctly:

| | `P_15` | What is owed |
|---|---|---|
| Leaves the advances on the invoice it references | The remainder | `P_15`, stated |
| Restates the payments received (`Fa.ZaliczkaCzesciowa`) | The whole amount | `P_15` less the sum of the `P_15Z` fields |

The schema defines the second outright: *«różnica kwoty w polu P_15 i sumy poszczególnych pól P_15Z stanowi kwotę pozostałą»*. No field carries that number, so a page that will not compute it cannot show it — which is what `less` is for. The `settlementRemainder` flag gates the computed row.

The same applies to an invoice being paid down: nothing states what has been paid or what is left, so the built-in templates compute both with `sumFrom` and `less`, gated on `paidInPart`. The built-in templates list one row per reading and print the settled payable alongside it when the document states one; a custom template that binds `Fa.P_15` unconditionally should gate it the same way.

> **Not yet covered:** the schema gives `P_15` a fourth reading on the correcting types (`KOR`, `KOR_ZAL`, `KOR_ROZ`), where it is a *correction of* the amount on the invoice being corrected rather than an absolute — possibly negative. The built-in templates currently label a correction's `P_15` as though it were an absolute figure. A template that renders corrections should say so in its own labels until this is handled.

An advance invoice (`RodzajFaktury` `ZAL` or `KOR_ZAL`) records the goods and services it covers under `Fa.Zamowienie`, and may carry no `Fa.FaWiersz` at all. A repeater with no entries still draws its header row, so a template that binds both gives each one a `when` — this is what the built-in templates do, and it is why an advance invoice shows its order rows under their own heading instead of an empty item table.

### Bindings, labels, conditions, and formats

- **Binding paths** are dot-paths into the document body — e.g. `Fa.P_2` (invoice number), `Podmiot1.DaneIdentyfikacyjne.Nazwa` (seller name). Paths are relative to the body element, not the document wrapper.
- **`label`** references an i18n label key resolved per locale; **`text`** is a literal string printed as-is.
- **`when`** conditionally renders a block against a presence test. It accepts a binding path (e.g. `Fa.Platnosc`) or a context flag: `qr`, `offline`, `hasKsefNumber`, `notes`, `totalsBuckets`, `totalsSummary`, `p15IsAmountDue`, `p15IsAdvancePaid`, `p15IsRemainder`, `p15IsAmountTotal`, `paidInFull`, `paidInPart`. A `divider` and a `lines` table take it too, so a rule can disappear with whatever it separates — the built-in templates close their `notes` block with `{ "type": "divider", "when": "notes" }`, which leaves no stray line on an invoice that carries none.
- **`less`** and **`sumFrom`** (totals and payment rows) compute a figure the document does not state: `sumFrom` takes the sum of one binding over every entry of a collection, and `less` subtracts such a sum from the row's own value. `sum` cannot do this — it adds a fixed list of paths, and the entries of a repeater are not known to the template. Both print blank rather than a wrong number when anything they read is unparseable. Like every computed figure here, they are only as sound as the document.
- **`format`** names a value formatter: `money`, `date`, `number`, or `nip`.
- **`optional`** marks a binding the document may legitimately omit, exempting it from `strict`. Mark exactly what the schema declares optional — everything left unmarked is a field the document must carry.
- **The document titles itself.** A `header` block with no `title` heads the page by what the document *is* — `Faktura zaliczkowa` for an advance invoice (`ZAL`), `Faktura rozliczająca` for a settlement (`ROZ`), plain `Faktura` otherwise, corrections included: `KOR_ZAL` corrects an advance invoice, it is not one. A template that names its own `title` keeps it. The built-ins name none.
- **`headingStyle`** (`parties`, `payment`, `annotations`, `notes`) names the style for the heading those blocks print themselves — `Sprzedawca`, `Płatność`. It reaches that first line only: labels nested inside a block (`Adres`, `Dane kontaktowe`, `Rachunek bankowy`) are a level down and stay on `h2`, so section headings can be lifted without dragging every label along. Both default to `h2`; the built-in templates name `h1` for the block headings and leave the nested ones on `h2`. The `header` block's title works the same way through plain `style`, defaulting to `title`. A `styles` map that omits `h2` or `title` loses those headings with nothing in the JSON to point at.
- **`style`** (party panels) names a style for a panel's value lines. A labelled group inherits it unless it declares its own, so the built-in templates set `partyIdentity` on the panel — the counterparty's name and tax number — and let the address and contact groups drop to the smaller `partyDetails`. Headings keep the panel's heading style either way.
- **`firstOf`** (party fields only) prints the first of several paths that resolves. KSeF identifies a counterparty by exactly one of `NIP`, `NrVatUE` or `NrID` depending on where they are established, so the built-in templates bind the buyer's identifier this way; a panel bound to `NIP` alone has nothing to print for a foreign buyer. An alternative may be written as `{ "path": …, "prefixPath": … }` to keep the qualifier the schema pairs it with — `KodUE` before `NrVatUE`, `KodKraju` before `NrID` — so `DE 123456789` prints as one identifier. The prefix is read leniently and dropped when the document omits it.
- **`style`** names a style for one row: a totals row (covering both its label and its figure — they are one line to a reader) or a payment/annotation field. The built-in templates use it to set the amount due and its currency in bold, in the totals and again under the payment terms.
- **`suffixPath`** appends a second binding after the value, separated by a space — an amount and its currency are one fact and print as `800,00 EUR` rather than as a number in one row and a code in another. It is dropped when it resolves empty, never read when the value itself is absent, and read at the same strictness as the value it follows.
- **`sub`** (table columns only) prints a second, smaller line under the cell's value, joining `label value` pairs and dropping every entry the row leaves empty. It exists for the line-item classifiers — `Indeks`, `GTIN`, `PKWiU`, `CN`, `PKOB` — which are all optional and of which a real invoice carries one or two: a column's width is fixed for the whole table, so giving each its own column would leave most invoices with several empty ones. `subStyle` names the style for that line and `subSeparator` replaces the default `' · '`.
- **`width`** (table columns only) sizes a column: a number of points, `'auto'` to fit the content, or `'*'` to share out what is left (the default). Sizing is worth setting explicitly — pdfmake gives every `'*'` column the *same* width and never shrinks it below the widest minimum content width among them, so a single long unbreakable token silently widens the whole table past the page edge.
- **`sum`** (totals rows only) adds several binding paths instead of reading one. A KSeF invoice has no single net or VAT total — the amounts are split across the `P_13_*` and `P_14_*` rate buckets, with zero-rated sales split three further ways (`P_13_6_1` domestic, `P_13_6_2` intra-EU supply, `P_13_6_3` export) — so the built-in templates aggregate them. Absent buckets are skipped, and the addition is decimal-exact. A totals row takes either `path` or `sum`, never both.

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
      "right": { "label": "buyer",  "fields": [
        "Podmiot2.DaneIdentyfikacyjne.Nazwa",
        {
          "firstOf": [
            "Podmiot2.DaneIdentyfikacyjne.NIP",
            { "path": "Podmiot2.DaneIdentyfikacyjne.NrVatUE", "prefixPath": "Podmiot2.DaneIdentyfikacyjne.KodUE" },
            { "path": "Podmiot2.DaneIdentyfikacyjne.NrID", "prefixPath": "Podmiot2.DaneIdentyfikacyjne.KodKraju" }
          ]
        }
      ] }
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

There is also `fa3-showcase`, an FA(3) template built to exercise the DSL rather than to be shipped on a real invoice: a full palette, letter-spaced headings, highlighted text, its own label wording, and full-width colour bars drawn as data-URI images (a solid PNG stretched to the content width, since the DSL has no drawing primitive). Useful as a reference for what a template can reach — and, by its omissions, for what it cannot: the line-item table's header fill and rule colours belong to the renderer, and Roboto is the only bundled font.

```bash
ksef invoice pdf invoice.xml --template fa3-showcase --qr --qr-links
```

Note that its `labels` overrides make it Polish in every locale — an override replaces the bundle in all of them.

---

## Totals

A KSeF invoice records no single net or VAT total. Net sales are split across the `P_13_*` rate buckets and the tax across `P_14_*`; the only total the document actually states is `P_15`, the amount due. `totals` chooses what to print above it — the amount due itself is always shown.

| Mode | Prints |
|------|--------|
| `none` | The amount due, nothing else. |
| `buckets` | One row per rate bucket the invoice carries, each a direct reading of a `P_13_*`/`P_14_*` field. Nothing is computed. Default. |
| `summary` | Net and VAT totals, added up from every bucket. |
| `both` | The breakdown, then the computed totals. |

`summary` and `both` print two figures that exist nowhere in the document: the renderer adds them up. On an invoice whose buckets do not reconcile, those figures will not match what the issuer intended, and nothing on the page distinguishes them from `P_15`, which is read straight from the XML. `buckets` never has that problem — every number on the page traces to a field.

Rows whose value is absent are skipped, so a template may list every bucket the schema allows and only the ones this invoice uses appear. The built-in templates do exactly that, gating the two groups on the `totalsBuckets` and `totalsSummary` context flags; a custom template can regroup them freely.

---

## Locales

Labels are localizable, driven by the `locale` option:

| Locale | Output |
|--------|--------|
| `pl` (default) | Polish labels |
| `en` | English labels |
| `uk` | Ukrainian labels |
| `pl+en`, `en+pl` | Both, in the order named |
| `pl+uk`, `uk+pl` | Both, in the order named |
| `en+uk`, `uk+en` | Both, in the order named |

Any two of the three languages combine, in either order. For a bilingual locale each label is the two texts joined by `bilingualSeparator` (default `' / '`), in the order the locale name spells out. A template can also override individual labels via its `labels` map — useful for company-specific wording; an override replaces **both** halves of a bilingual label.

One thing stays Polish in every locale: the `FormaPlatnosci` payment forms. They decode from a Polish fiscal enum, and the official visualizations print them untranslated.

```ts
const pdf = await renderInvoicePdf(xml, 'fa3-default', {
  locale: 'pl+en',
  bilingualSeparator: ' | ',
});
```

---

## Notes

Some of what belongs on an invoice is not in the invoice: delivery terms, a payment reminder, a line the accountant wants on every document. `notes` takes those as an array of sections and prints them where the template puts its `notes` block — in the built-in templates, between the payment details and the verification codes.

```ts
const pdf = await renderInvoicePdf(xml, 'fa3-default', {
  notes: [
    { head: 'Warunki dostawy', body: 'Towar wydany w magazynie sprzedawcy.' },
    { head: 'Uwaga', body: 'Prosimy o podanie numeru faktury w tytule przelewu.' },
  ],
});
```

Both halves are plain text — no bindings, no markup, and a `\n` is a line break. A note therefore cannot reach into the document or disturb the layout around it. An entry blank on both halves is dropped, one with only a head or only a body prints that half, and a render with no notes leaves no trace of the block at all.

The section carries its own heading — `Pozostałe informacje` — so the notes read as part of the document rather than as text that fell off the end of it. That heading takes the block's `headingStyle`, which the built-in templates set to `h1`, the same level as `Płatność`; each note's own title sits a level below it on `h2`, as sub-headings do in every block. The bodies are body text. From the CLI the sections come from a JSON file:

```bash
ksef invoice pdf invoice.xml --notes ./notes.json
```

```json
[
  { "head": "Warunki dostawy", "body": "Towar wydany w magazynie sprzedawcy." }
]
```

---

## Verification QR codes

KSeF defines two verification codes, and the built-in templates print both when both are available.

**Code I** verifies the invoice. Set `qr: true` and it is derived from the XML — you do not supply a URL. The verification hash is computed over the original invoice bytes so it matches the value KSeF registered. Use `env` to pick the correct portal (`prod` by default), or `baseQrUrl` to override it for offline / non-standard cases. Pass `qrUrl` to skip derivation and print a URL you built yourself.

**Code II** verifies the *issuer* and only exists for invoices issued offline. It cannot be derived here: the link carries a signature made with the private key of a KSeF offline certificate, which a PDF renderer has no business holding. Build it with `VerificationLinkService.buildCertificateVerificationUrl` (or `ksef qr certificate`) and pass the result as `certificateQrUrl`.

```ts
import { VerificationLinkService } from 'ksef-client-ts';

const certificateQrUrl = new VerificationLinkService('https://qr.ksef.mf.gov.pl')
  .buildCertificateVerificationUrl('Nip', nip, sellerNip, certSerial, invoiceHash, privateKeyPem);

const pdf = await renderInvoicePdf(xml, 'fa3-default', {
  qr: true,           // Code I, derived from the document
  certificateQrUrl,   // Code II, supplied
  qrLinks: true,      // a clickable link under each code
  env: 'test',
});
```

`qrLinks` repeats each URL under its code as a clickable link, for readers who have the PDF on screen rather than on paper.

Both codes are encoded here and handed to pdfmake as vector SVG rather than through its own QR node, which sizes a code at whole points per module and so can only produce a handful of sizes — two codes of different data lengths cannot be made to match under that rule. Drawing the modules ourselves makes the size exact and gets the standard's quiet zone, which that node omits. Error correction is 15% (`M`), the level KSeF's own reference clients use: an invoice gets folded, and the 7% default leaves no margin for a crease.

At the built-in `fit` of 104 (37 mm square) the modules come out at 0.75 mm for Code I and 0.56 mm for a Code II signed with an EC key. An RSA signature is four times longer and drops that to 0.39 mm — legal (both key types are), but at the edge of what prints and scans reliably, so raise `fit` if your certificate is RSA.

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

# Your own logo and accent colour
ksef invoice pdf invoice.xml --logo ./brand/logo.png --accent '#5AB595'
```

| Flag | Description |
|------|-------------|
| `--template <name>` | Built-in template name (mutually exclusive with `--template-file`) |
| `--template-file <path>` | Custom JSON template path (mutually exclusive with `--template`) |
| `--locale <pl\|en\|uk\|pl+en\|…>` | Label language, single or any two joined by `+` (default `pl`) |
| `--qr` | Embed the KSeF Code I QR derived from the XML |
| `--qr-url <url>` | Code I URL used verbatim, instead of deriving one |
| `--qr-cert-url <url>` | Code II (offline certificate) URL — build it with `ksef qr certificate` |
| `--qr-links` | Print a clickable link under each QR code |
| `--ksef-number <number>` | KSeF number to print (absent → marked OFFLINE) |
| `--totals <none\|buckets\|summary\|both>` | Tax breakdown above the amount due (default `buckets`) |
| `--notes <path>` | JSON file of extra sections: `[{ "head": …, "body": … }]` |
| `--logo <path>` | Logo image printed in the header — PNG or JPEG |
| `--accent <hex>` | Accent colour for the title and headings, e.g. `#5AB595` |
| `--upo` | Treat the input as a UPO document (otherwise auto-detected); ignored when a template is named explicitly |
| `--env <prod\|test\|demo>` | Environment for the QR base URL |
| `--out <path>` | Output PDF path (default: alongside the source) |

`--accent` takes a hex colour only. pdfmake silently ignores a value it does not recognize — the document then renders exactly as if no accent had been given — so a misspelled colour name is rejected here rather than turning into a PDF that is quietly unthemed. Named CSS colours still work through the `theme` option in code.

`--template` and `--template-file` are mutually exclusive — pass at most one. An explicit template takes precedence over document auto-detection, so a custom UPO layout is selected the same way an invoice one is; the renderer still rejects a template whose `schema` does not match the document. If `pdfmake` is not installed, the command exits with the same friendly install hint shown above.

---

## See also

- [QR Codes & Verification Links](./qr-codes.md) — the Code I / Code II verification URLs behind the embedded QR.
- [XML Serialization](./xml-serialization.md) — build the invoice XML that feeds the PDF renderer.
- [CLI](./cli.md) — the full command reference.
