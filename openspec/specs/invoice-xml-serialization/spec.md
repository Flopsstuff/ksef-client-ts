## ADDED Requirements

### Requirement: Programmatic invoice XML serialization API

The library SHALL expose a public serialization API consisting of:

- `serializeInvoiceXml(input, options?)` — polymorphic entry point returning a `Buffer`.
- `buildFakturaXml(faktura, options?)` — typed helper for FA2/FA3 returning a `string`.
- `buildPefXml(input, options?)` — typed helper for PEF/PEF_KOR returning a `string`.

`serializeInvoiceXml` MUST accept any of: `string`, `Buffer`, a pre-parsed `XmlDocument` tree, a `FakturaInput` object, or a `PefUblDocumentInput` object.

#### Scenario: Serialize a typed FakturaInput

- **WHEN** the caller invokes `serializeInvoiceXml(fakturaInput, { schema: 'FA3' })`
- **THEN** the function returns a `Buffer` containing a well-formed FA3 XML document rooted at `<Faktura>`

#### Scenario: Serialize a pre-built Buffer

- **WHEN** the caller invokes `serializeInvoiceXml(buffer)` with a `Buffer`
- **THEN** the function returns a `Buffer` whose bytes are identical to the input

#### Scenario: buildFakturaXml returns a string

- **WHEN** the caller invokes `buildFakturaXml(fakturaInput, { schema: 'FA3' })`
- **THEN** the return value is a `string` (not a `Buffer`)

### Requirement: FA2 and FA3 element ordering follows the KSeF XSD

The Faktura builder MUST emit child elements in the order declared by the KSeF FA2 and FA3 XSDs for every known parent element including `Faktura`, `Naglowek`, `Podmiot1`, `Podmiot2`, `Podmiot3`, `Fa`, `FaWiersz`, and `Stopka`. `P_*` keys inside `Fa` MUST be ordered first by the authoritative `ORDER_MAP`; any remaining `P_*` keys MUST be sorted by natural-numeric ordinal comparison (e.g., `P_13_1 < P_13_2 < P_13_10 < P_20_A < P_20_B`). Keys unknown to the schema MUST preserve input insertion order and MUST be appended after all ordered keys within their parent.

#### Scenario: Object-literal key order does not affect output

- **WHEN** two `FakturaInput` values carry the same key set in different insertion orders
- **THEN** the serialized XML is byte-identical for both

#### Scenario: P_13_10 follows P_13_9 numerically, not lexicographically

- **WHEN** `Fa` contains `P_13_1`, `P_13_2`, `P_13_9`, `P_13_10`
- **THEN** the serialized order is `P_13_1, P_13_2, P_13_9, P_13_10` (not `P_13_1, P_13_10, P_13_2, P_13_9`)

#### Scenario: Unknown custom key is appended last

- **WHEN** `Fa` contains a key absent from the `ORDER_MAP` and not matching `P_*`
- **THEN** that key appears after every ordered key, at the end of its parent element

### Requirement: FA3 multi-rate VAT amount elements interleave per tax group

When `Fa` contains `P_13_N`, `P_14_N`, or `P_14_NW` keys for multiple VAT rate groups, the output MUST interleave them per rate group as `P_13_1, P_14_1, P_14_1W, P_13_2, P_14_2, P_14_2W, P_13_3, P_14_3, P_14_3W, ...` rather than emitting all `P_13_*` elements before all `P_14_*`. Subsequent non-rate elements (`P_13_6_1` through `P_13_6_3`, `P_13_7` through `P_13_11`, `P_15`) MUST follow in XSD-declared order.

#### Scenario: Multi-rate interleaving matches XSD sequence

- **WHEN** `Fa` contains `P_13_1`, `P_14_1`, `P_14_1W`, `P_13_2`, `P_14_2`, `P_13_6_1`, `P_15`
- **THEN** the serialized order is `P_13_1`, `P_14_1`, `P_14_1W`, `P_13_2`, `P_14_2`, `P_13_6_1`, `P_15`

#### Scenario: Multi-rate output validates against FA3 XSD

- **WHEN** the multi-rate output is validated against `docs/schemas/FA/schemat_FA3_v1-0E.xsd`
- **THEN** XSD validation succeeds

### Requirement: FormCode renders as KodFormularza with attributes

When input includes a `KodFormularza` of shape `{ systemCode, schemaVersion, value }`, the output MUST render the element as `<KodFormularza kodSystemowy="{systemCode}" wersjaSchemy="{schemaVersion}">{value}</KodFormularza>`.

#### Scenario: FormCode renders with both attributes and text content

- **WHEN** input has `KodFormularza = { systemCode: 'FA (3)', schemaVersion: '1-0E', value: 'FA' }`
- **THEN** the output contains `<KodFormularza kodSystemowy="FA (3)" wersjaSchemy="1-0E">FA</KodFormularza>`

### Requirement: Namespace injection on Faktura root

The `<Faktura>` root MUST carry `xmlns` and `xmlns:etd` attributes. Defaults:

- FA2 — `xmlns="http://crd.gov.pl/wzor/2023/06/29/12648/"`, `xmlns:etd="http://crd.gov.pl/xml/schematy/2020/10/08/eDokumenty"`
- FA3 — `xmlns="http://crd.gov.pl/wzor/2025/06/25/13775/"`, `xmlns:etd="http://crd.gov.pl/xml/schematy/dziedzinowe/mf/2022/01/05/eD/DefinicjeTypy/"`

Callers MAY override via the `fakturaNamespace` and `etdNamespace` options.

#### Scenario: FA3 default namespaces are injected

- **WHEN** `buildFakturaXml(fakturaInput, { schema: 'FA3' })` is called without overrides
- **THEN** the `<Faktura>` element carries `xmlns="http://crd.gov.pl/wzor/2025/06/25/13775/"` and `xmlns:etd="http://crd.gov.pl/xml/schematy/dziedzinowe/mf/2022/01/05/eD/DefinicjeTypy/"`

#### Scenario: Explicit namespace override replaces the default

- **WHEN** the caller passes `fakturaNamespace: 'http://example/custom'`
- **THEN** the output `<Faktura>` element carries `xmlns="http://example/custom"`

### Requirement: PEF UBL document serialization

The PEF builder MUST accept an input of shape `{ Invoice: ... }` or `{ CreditNote: ... }`, detect the root by element name, and inject the UBL namespace set (`xmlns`, `xmlns:ext`, `xmlns:cbc`, `xmlns:cac`, `xmlns:cbc-pl`, `xmlns:cac-pl`) on the root. The main `xmlns` MUST be `urn:oasis:names:specification:ubl:schema:xsd:Invoice-2` for `Invoice` and `urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2` for `CreditNote`.

#### Scenario: Invoice input produces PEF Invoice-2 document

- **WHEN** `buildPefXml({ Invoice: { ... } })` is called
- **THEN** the output root is `<Invoice>` with `xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"`

#### Scenario: CreditNote input produces PEF CreditNote-2 document

- **WHEN** `buildPefXml({ CreditNote: { ... } })` is called
- **THEN** the output root is `<CreditNote>` with `xmlns="urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2"`

### Requirement: PEF input validation

The PEF builder MUST throw `KSeFValidationError` when the input contains neither or both of `Invoice` and `CreditNote`, and when the caller's `schema` option (`PEF` or `PEF_KOR`) does not match the root element detected from the input.

#### Scenario: Input with both Invoice and CreditNote is rejected

- **WHEN** `buildPefXml({ Invoice: {...}, CreditNote: {...} })` is called
- **THEN** the call throws `KSeFValidationError`

#### Scenario: schema option mismatches detected root

- **WHEN** `buildPefXml({ Invoice: {...} }, { schema: 'PEF_KOR' })` is called
- **THEN** the call throws `KSeFValidationError` identifying the mismatch

#### Scenario: Matching schema and root succeeds

- **WHEN** `buildPefXml({ Invoice: {...} }, { schema: 'PEF' })` is called
- **THEN** the call returns the serialized string

### Requirement: Pre-built XML pass-through

When `serializeInvoiceXml` receives a `string` or `Buffer`, it MUST NOT reorder elements, inject namespaces, or otherwise transform the payload. A UTF-8 BOM (`\uFEFF`) at the start of a `string` input MUST be stripped before encoding to `Buffer`. `Buffer` inputs MUST be returned byte-for-byte.

#### Scenario: String with BOM returns Buffer without BOM

- **WHEN** `serializeInvoiceXml('\uFEFF<Faktura/>')` is called
- **THEN** the returned `Buffer` contains the bytes of `<Faktura/>` with no leading BOM

#### Scenario: Buffer is returned unchanged

- **WHEN** `serializeInvoiceXml(bufferOfXml)` is called
- **THEN** the returned `Buffer` is byte-for-byte identical to the input

### Requirement: Structured input shape validation

Duck-typed shape checks MUST classify structured input as `FakturaInput` or `PefUblDocumentInput`. When a structured object matches neither shape (e.g., a Faktura-like object missing `Naglowek`, `Podmiot1`, or `Fa`; or a PEF-like object with neither `Invoice` nor `CreditNote`), the serializer MUST throw `KSeFValidationError` whose message identifies at least one missing or conflicting key.

#### Scenario: Faktura-like object missing Naglowek is rejected

- **WHEN** `serializeInvoiceXml({ Podmiot1: {...}, Fa: {...} })` is called
- **THEN** the call throws `KSeFValidationError` whose message names `Naglowek`

#### Scenario: Object matches Faktura shape and dispatches to the builder

- **WHEN** `serializeInvoiceXml({ Naglowek: {...}, Podmiot1: {...}, Fa: {...} })` is called
- **THEN** the serializer invokes `buildFakturaXml` and returns a `Buffer` with `<Faktura>` root

### Requirement: Deterministic serialization output

For identical input values and options the serializer MUST produce byte-identical output. Element order, namespace attributes, and whitespace MUST NOT depend on process state, wall-clock time, randomness, or input key-insertion order.

#### Scenario: Repeated serialization yields identical bytes

- **WHEN** `serializeInvoiceXml(input, options)` is called twice with the same arguments
- **THEN** both returned `Buffer` values have identical bytes

#### Scenario: Equivalent inputs with different key order yield identical output

- **WHEN** two `FakturaInput` values have equivalent content but different object-literal key order
- **THEN** their serialized output is byte-identical

### Requirement: Undefined fields are omitted; null renders as empty element; arrays repeat

The normaliser MUST omit any key whose value is `undefined`. A key whose value is `null` MUST render as an empty element (`<Key/>` or `<Key></Key>`). Keys whose values are arrays MUST render each item as a separate repeated element in input order.

#### Scenario: undefined-valued key is omitted

- **WHEN** `Fa.P_6 = undefined`
- **THEN** the output contains no `<P_6>` element

#### Scenario: Array value renders as repeated elements in order

- **WHEN** `Fa.FaWiersz = [row1, row2]`
- **THEN** the output contains two `<FaWiersz>` elements in the same order as the input array
