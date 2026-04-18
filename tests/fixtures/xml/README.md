# Invoice XML fixtures

Source: CIRFMF/ksef-client-csharp (MIT License). Vendored for offline-reproducible XSD harness testing.

Files:

- `invoice-template-fa-2.xml` — canonical FA (2) template, with `#nip#` and `#invoice_number#` placeholders.
- `invoice-template-fa-3.xml` — canonical FA (3) template, with `#nip#` and `#invoice_number#` placeholders.

The placeholders are substituted at test load time (see `tests/unit/xml/xsd-validator.ts`) so the templates remain byte-identical to upstream. Do not edit these files by hand — re-vendor from the reference repository if the schemas update.
