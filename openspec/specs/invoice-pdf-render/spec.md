# invoice-pdf-render Specification

## Purpose
Render a KSeF invoice or UPO receipt XML into a PDF via the node-only `ksef-client-ts/pdf` subpath. The capability covers a template-driven block DSL (bindings, repeaters, conditions, formatters) over an accessor layer that smooths compact XML parsing, built-in version-specific templates for FA(2)/FA(3)/UPO(4.2)/UPO(4.3), `pl`/`en`/`pl+en` label localization, automatic KSeF Code I QR derivation whose hash is taken over the original input bytes, custom-template loading with validation and version matching, and an optional lazily-loaded `pdfmake` peer so the core install stays clean.
## Requirements
### Requirement: Render invoice XML to PDF via the `ksef-client-ts/pdf` subpath

The library SHALL expose a node-only subpath entry point `ksef-client-ts/pdf` that renders a KSeF invoice XML document into a PDF and returns it as a `Uint8Array`. The entry point MUST accept the XML as either a `string` or a `Uint8Array`. The subpath MUST be isolated from the primary `.` entry point so that importing `.` never loads the PDF stack and never violates the fs-free invariant of `.`.

#### Scenario: Render an FA(3) invoice to PDF bytes

- **WHEN** a caller imports `renderInvoicePdf` from `ksef-client-ts/pdf` and calls it with a valid FA(3) XML and a built-in template name
- **THEN** the call resolves to a non-empty `Uint8Array` whose bytes begin with `%PDF-` and end with `%%EOF`

#### Scenario: Primary entry point stays free of the PDF stack

- **WHEN** a consumer imports only the primary `.` entry point
- **THEN** the PDF stack (and `pdfmake`) MUST NOT be loaded and the fs-free invariant of `.` MUST hold

### Requirement: Three template-source entry points

The module SHALL provide three separate render functions distinguished by template source, so the caller never has to disambiguate "is this a name or a path": a built-in template selected by name, a custom template loaded from a file path, and a custom template passed as a DSL object. The module SHALL additionally provide a dedicated UPO renderer.

#### Scenario: Render with a built-in template by name

- **WHEN** the caller invokes the by-name render function with `'fa3-default'`
- **THEN** the module resolves the corresponding built-in template and renders the invoice

#### Scenario: Render with a custom template from a file

- **WHEN** the caller invokes the from-file render function with a path to a `.json` template
- **THEN** the module reads the file, validates it, and renders the invoice

#### Scenario: Render with a custom template object

- **WHEN** the caller invokes the from-template render function with a DSL template object
- **THEN** the module validates the object and renders the invoice without reading the filesystem

### Requirement: Invoice and UPO version detection

The module SHALL detect the document version from the XML. It MUST distinguish `FA(2)` and `FA(3)` invoices and `UPO(4.2)` and `UPO(4.3)` receipts, and MUST return a null-like result for unrecognized documents. FA(1) MUST NOT be supported.

#### Scenario: Detect FA(3)

- **WHEN** `detectInvoiceVersion` is called with an FA(3) invoice XML
- **THEN** it returns `FA(3)`

#### Scenario: Detect UPO version

- **WHEN** `detectUpoVersion` is called with a UPO(4.3) receipt XML
- **THEN** it returns `UPO(4.3)`

#### Scenario: Unrecognized document

- **WHEN** a version-detection function is called with XML that is neither a supported invoice nor a supported UPO
- **THEN** it returns a null-like result rather than throwing

### Requirement: Built-in templates for supported versions

The module SHALL ship built-in templates for at least `fa2-default`, `fa3-default`, `upo-4_2`, and `upo-4_3`. Built-in templates MUST be bundled into the distributed output (not read from the filesystem at runtime).

#### Scenario: Built-in template renders without runtime filesystem access

- **WHEN** a built-in template is selected by name in an environment where the package's own template files are not readable from disk
- **THEN** rendering still succeeds because the template is bundled into the distributed module

#### Scenario: Built-in templates are self-consistent

- **WHEN** each built-in template is rendered in strict mode against a fixture that populates every optional field
- **THEN** rendering succeeds with no unresolved binding, so a typo in a built-in template's dot-path surfaces as an error rather than an empty string

### Requirement: Template DSL interpretation

The module SHALL interpret a declarative, version-specific block DSL into a PDF layout. The DSL MUST support semantic blocks and layout-primitive blocks, dot-path bindings into the parsed XML, repeaters that iterate a collection, conditions that show a block only when a field is present or truthy, and value formatters (money / date / number / nip). The DSL MUST NOT provide general scripting. Container blocks MUST nest recursively up to a bounded depth.

#### Scenario: Repeater over invoice lines

- **WHEN** a template contains a repeater block bound to the invoice-lines collection
- **THEN** the interpreter emits one rendered row per line

#### Scenario: Conditional block

- **WHEN** a block declares a condition on a field that is absent
- **THEN** the interpreter omits that block from the output

#### Scenario: Value formatter

- **WHEN** a binding declares a `money` formatter over a numeric field
- **THEN** the rendered value is formatted as a monetary amount rather than the raw string

#### Scenario: Nesting depth limit exceeded

- **WHEN** a template nests container blocks beyond the allowed depth
- **THEN** interpretation fails with a clear error

### Requirement: Accessor layer over compact XML parsing

Field access from templates SHALL go through an accessor layer that smooths compact-parse artifacts, not directly against the parsed object. A repeater's collection MUST always be read as an array, so a single-element collection that the parser collapsed into an object is handled identically to a multi-element collection. Field access MUST descend safely (a missing intermediate segment yields an absent value, not a throw), MUST unwrap mixed-content text nodes, and MUST support reading an attribute segment.

#### Scenario: Single-line invoice does not break the repeater

- **WHEN** an invoice has exactly one line and the parser collapsed the lines collection into a single object
- **THEN** the repeater still iterates exactly once, as if the collection were an array

#### Scenario: Safe descent through a missing field

- **WHEN** a binding path descends through a segment that is absent in the document
- **THEN** the accessor yields an empty/absent value without throwing (subject to strict mode)

### Requirement: Missing-binding behavior is configurable via strict mode

By default a missing binding SHALL resolve to an empty string, because KSeF invoices contain many optional fields. When strict mode is enabled, a missing binding MUST instead throw a clear error identifying the failing path.

#### Scenario: Lenient default

- **WHEN** a template binds a field that is absent and strict mode is not enabled
- **THEN** the field renders as an empty string and rendering succeeds

#### Scenario: Strict mode surfaces the missing path

- **WHEN** a template binds a field that is absent and strict mode is enabled
- **THEN** rendering fails with an error naming the missing binding path

### Requirement: Multi-language labels

The module SHALL support label localization in `pl`, `en`, and `pl+en`, selected per render call and defaulting to `pl`. Only `pl` and `en` label bundles are maintained; `pl+en` MUST be produced by concatenating the two with a configurable separator (defaulting to `' / '`). A custom template MAY override individual labels; a missing label key MUST fall back to `pl`.

#### Scenario: English labels

- **WHEN** a render is requested with locale `en`
- **THEN** block labels are printed from the English bundle

#### Scenario: Bilingual labels with a custom separator

- **WHEN** a render is requested with locale `pl+en` and a newline separator
- **THEN** each label prints the Polish and English text joined by the newline

### Requirement: Automatic QR (Code I) derivation

When QR output is requested, the module SHALL build the KSeF Code I verification URL from the invoice XML using the core verification-link service, and render it as a QR code in the PDF. The seller NIP and issue date used for the URL MAY be read from the parsed XML. The base verification URL MUST derive from an explicit override or from the selected environment, defaulting to production.

#### Scenario: QR requested builds the same URL as the core service

- **WHEN** QR output is requested for an invoice
- **THEN** the URL encoded in the QR equals the URL the core verification-link service produces for the same NIP, issue date, and hash

#### Scenario: QR disabled

- **WHEN** QR output is not requested
- **THEN** no QR code is rendered and no verification URL is built

### Requirement: QR hash is computed over the original input bytes

The invoice hash used for the QR verification URL SHALL be computed over the original input bytes, bypassing the XML parser and any normalization. Field extraction and hashing MUST be two independent consumptions of the input. A `Uint8Array` input MUST be hashed directly. A `string` input MUST be hashed as its UTF-8 bytes with no BOM stripping, re-encoding, or line-ending normalization. A caller-supplied canonical hash MUST be used verbatim without recomputation.

#### Scenario: Byte-identical inputs produce the same hash

- **WHEN** the same document is rendered once as a `Uint8Array` and once as the equivalent UTF-8 `string` with no BOM and no reformatting
- **THEN** both produce the same QR hash

#### Scenario: Byte-level changes change the hash

- **WHEN** the same logical document is hashed with an added BOM, CRLF line endings, or pretty-printing
- **THEN** the resulting hash differs, proving the hash is taken over raw bytes rather than reparsed XML

#### Scenario: Caller-supplied hash overrides recomputation

- **WHEN** a caller passes a known canonical hash
- **THEN** the module uses it verbatim and does not recompute a hash from the input

### Requirement: Custom template validation and version matching

The module SHALL validate custom templates before rendering. An unknown block type or structurally invalid template MUST produce a clear error. A template whose declared schema does not match the detected XML version MUST be rejected with a version-mismatch error.

#### Scenario: Unknown block type

- **WHEN** a custom template contains an unknown block type
- **THEN** validation fails with a clear error identifying the problem

#### Scenario: Template/version mismatch

- **WHEN** an FA(2) template is used to render an FA(3) invoice
- **THEN** the module rejects the render with a version-mismatch error

### Requirement: Optional `pdfmake` peer dependency loaded lazily

The module SHALL treat `pdfmake` as an optional peer dependency pinned to `^0.2.20` and load it lazily only when a render function is called. Importing or requiring the subpath without `pdfmake` installed MUST NOT throw; the absence MUST surface only on a render call, as a friendly error advising `npm i "pdfmake@^0.2.20"`. After the lazy load, the module MUST verify the resolved `pdfmake` version satisfies `^0.2.20` and MUST reject an incompatible version (including 0.3.x) with a clear error. The subpath's public types MUST NOT require consumers to have `pdfmake` types installed.

#### Scenario: Import without pdfmake does not throw

- **WHEN** the subpath is imported (ESM) or required (CJS) while `pdfmake` is not installed
- **THEN** the module loads successfully and does not throw at import/require time

#### Scenario: Render without pdfmake gives a friendly error

- **WHEN** a render function is called while `pdfmake` is not installed
- **THEN** the call fails with a friendly error advising installation of `pdfmake@^0.2.20`, not a raw module-not-found or transitive-dependency crash

#### Scenario: Incompatible pdfmake version is rejected

- **WHEN** a render function is called with an installed `pdfmake` version outside `^0.2.20` (for example 0.3.x)
- **THEN** the call fails with a clear error stating the required range and the version found

### Requirement: Render UPO receipts to PDF

The module SHALL render UPO(4.2) and UPO(4.3) receipt XML to a PDF using the same engine and the built-in UPO templates.

#### Scenario: Render a UPO receipt

- **WHEN** the UPO render function is called with a valid UPO receipt XML
- **THEN** it resolves to a non-empty `Uint8Array` beginning with `%PDF-`

