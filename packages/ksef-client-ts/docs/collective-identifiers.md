# Collective Identifiers

A **collective identifier** (*identyfikator zbiorczy*) groups invoices a seller issued in KSeF under a single reference, so a buyer can settle the whole batch against one payment reference instead of paying invoice by invoice.

Available from KSeF API v2.7.0 via `client.collectiveIdentifiers` and the `ksef collective-identifier` CLI group.

## Permissions

Every operation in this domain requires **one of**: `InvoiceRead`, `InvoiceWrite`, or `CollectiveIdentifierManage`.

## Identifier format

```text
9999999999-IZRRRRMM-FFFFFFFFFFFF-FF
```

| Part | Meaning |
| ---- | ------- |
| `9999999999` | 10-digit NIP of the seller |
| `IZ` | Fixed prefix |
| `RRRRMM` | Year and month the identifier was created |
| `FFFFFFFFFFFF` | 12 uppercase hex characters (`0-9A-F`) |
| `FF` | CRC-8 checksum, 2 uppercase hex characters |

The checksum uses CRC-8 with polynomial `0x07` and initial value `0x00`. The whole string is always 35 characters, e.g. `1111111111-IZ202607-65ED02180000-E7`.

## Rules and limits

- **Between 2 and 500 invoices** per collective identifier. Two is a hard minimum — an identifier that groups nothing is rejected by the API schema — while 500 is the default ceiling, which the session limits for a context can raise as far as 5000. The client rejects a list below the minimum or above 5000 with a `KSeFValidationError` before sending; between the two it defers to whatever limit the context actually has in force.
- **At most 132 collective identifiers** per invoice within one context.
- **Same seller only** — every invoice in one collective identifier must have been issued by the same seller.
- **Each KSeF number once** — a number repeated in the list is refused.
- A per-invoice `description` is **at most 512 characters**, and a `payment` needs both `amount` and `currency`.
- The query date range (`dateCreatedFrom` to `dateCreatedTo`) spans **at most 100 days**.

## Generate an identifier

`payment` and `description` are optional per invoice. Supply `payment` when you want the buyer to see the amount owed for that specific invoice.

```ts
const { collectiveIdentifierNumber } = await client.collectiveIdentifiers.generate({
  invoices: [
    {
      ksefNumber: '1111111111-20260701-0189AB-CD1234-EF',
      payment: { amount: 1230.45, currency: 'PLN' },
      description: 'Q3 delivery',
    },
    { ksefNumber: '1111111111-20260702-0189AB-CD5678-AB' },
  ],
});
```

### Checks before sending

`generate` refuses, with a `KSeFValidationError` and without contacting KSeF, a list that KSeF would certainly reject. The error's `details[0].field` points at the offending entry, e.g. `invoices[3].ksefNumber`.

| Check | KSeF would answer |
| ----- | ----------------- |
| Fewer than 2 or more than 5000 invoices | `21405`, or the context's invoice limit |
| A `ksefNumber` that does not match the KSeF number format (`NIP-YYYYMMDD-XXXXXXXXXXXX-CC`, uppercase hex, 35 or 36 characters) | `21405` |
| Invoices of different sellers — the seller is the NIP that opens every KSeF number | `71004` |
| The same KSeF number more than once | `71005` |
| A `description` longer than 512 characters | `21405` |
| A `payment` without `amount` or without `currency` | `21405` |

KSeF numbers are compared exactly as written. KSeF still accepts the 36-character form for compatibility with KSeF 1.0, but it looks each form up separately: the two forms of one number are not a repeat to KSeF, and the form the invoice was not issued under is simply not found (`71001`). The checksum and the currency code are left to KSeF.

## List identifiers in the context

Returns identifiers generated in the current context. For a NIP-type context it also returns identifiers where the subject appears as *Podmiot 1* on the invoice. Results are sorted by `dateCreated` descending, then `collectiveIdentifierNumber` descending.

```ts
// undefined on the first request, then page.continuationToken from the previous one
let previousContinuationToken: string | undefined;

const page = await client.collectiveIdentifiers.query(
  {
    dateCreatedFrom: '2026-07-01T00:00:00+00:00',
    dateCreatedTo: '2026-07-31T23:59:59+00:00',
    createdInCurrentContext: true,
  },
  100,                  // pageSize (10-200, default 10)
  previousContinuationToken,
);

for (const item of page.collectiveIdentifiers) {
  console.log(item.collectiveIdentifierNumber, item.invoiceCount);
}
```

Paginate by passing `page.continuationToken` back as the third argument until it is empty, or let the [paging helpers](#paging-through-every-result) do it.

## Look up identifiers by KSeF number

Answers "which collective identifiers does this invoice belong to?".

```ts
const result = await client.collectiveIdentifiers.getByKsefNumber(
  '1111111111-20260701-0189AB-CD1234-EF',
);
```

## List the invoices inside an identifier

A single query covers up to 10 identifiers, and every returned invoice names the one it belongs to:

```ts
const result = await client.collectiveIdentifiers.queryInvoices({
  collectiveIdentifierNumbers: [collectiveIdentifierNumber],
});

for (const invoice of result.invoices) {
  console.log(invoice.collectiveIdentifierNumber, invoice.ksefNumber);
}
```

### Payment disclosure and `detailsHidden`

Payment amount and currency are disclosed only to the subject that **created** the identifier, or to a subject named in a role on that invoice. For anyone else the amount fields are **omitted from the response entirely** and `detailsHidden` is `true`:

```ts
for (const invoice of result.invoices) {
  if (invoice.detailsHidden) {
    console.log(invoice.ksefNumber, 'payment details withheld');
  } else if (invoice.payment) {
    console.log(invoice.ksefNumber, invoice.payment.amount, invoice.payment.currency);
  } else {
    console.log(invoice.ksefNumber, 'no payment details were supplied');
  }
}
```

`detailsHidden` is `false` in two different situations — when you are allowed to see the details, and when no payment details were ever supplied at generation time. It therefore does not by itself tell you whether `payment` was set; check `payment` for that. This is why `payment` is modelled as optional rather than always present.

::: tip Naming
The KSeF endpoint prose calls this field `paymentDetailsHidden`, but the schema and the live API both return it as `detailsHidden`. This client follows the wire format.
:::

## Paging through every result

All three lists above page with a continuation token: KSeF returns it in the response body, the next request sends it in the `x-continuation-token` header, and an empty token marks the last page. Three async generators follow it for you and yield one page at a time:

| Helper | Endpoint | Default page size |
| ------ | -------- | ----------------- |
| `queryCollectiveIdentifierPages(client, request, options?)` | `POST /collective-identifiers/query` | 200 (KSeF allows 10-200) |
| `getCollectiveIdentifierPagesByKsefNumber(client, ksefNumber, options?)` | `GET /collective-identifiers/ksef/{ksefNumber}` | 200 (KSeF allows 10-200) |
| `queryCollectiveIdentifierInvoicePages(client, request, options?)` | `POST /collective-identifiers/invoices` | 500 (KSeF allows 10-500) |

The defaults are the largest pages KSeF serves, so a walk uses as few requests of the domain's rate limit as possible.

Each page is `{ items, continuationToken }`, where `continuationToken` is the token of the *next* page and `undefined` on the last one. Save it after you have handled a page, and pass it back as the `continuationToken` option to resume from the following page later:

```ts
import { queryCollectiveIdentifierInvoicePages } from 'ksef-client-ts';

// Where an earlier run stopped; undefined starts from the first page.
let savedToken: string | undefined = loadSavedToken();
const controller = new AbortController();

for await (const page of queryCollectiveIdentifierInvoicePages(
  client,
  { collectiveIdentifierNumbers: [collectiveIdentifierNumber] },
  { continuationToken: savedToken, signal: controller.signal },
)) {
  for (const invoice of page.items) {
    console.log(invoice.ksefNumber, invoice.payment?.amount);
  }
  savedToken = page.continuationToken; // undefined once the walk is complete
}
```

| Option | Default | Meaning |
| ------ | ------- | ------- |
| `pageSize` | 200 or 500 | Results per request. Values outside KSeF's range are left for KSeF to reject. |
| `continuationToken` | — | Token of the page to start from. |
| `maxPages` | 1000 | Safety cap on the number of requests. |
| `signal` | — | An `AbortSignal`. Once aborted, the walk rejects with the signal's reason before its next request; a request already in flight is not cancelled. |

When the page order does not matter, the `collectAll` variants drain a walk into one array: `collectAllCollectiveIdentifiers`, `collectAllCollectiveIdentifiersByKsefNumber` and `collectAllCollectiveIdentifierInvoices`. They take the same arguments.

A walk ends with a [`KSeFPaginationError`](/error-handling#ksefpaginationerror) instead of running forever in two cases: KSeF returns a token it has already returned, or the walk needs more than `maxPages` pages. Every page read before that has already been yielded. The error's `continuationToken` is the repeated token, or, at the cap, the token of the first unread page to resume from.

## CLI

```bash
# Generate from a comma-separated list of KSeF numbers
ksef collective-identifier generate --ksef "<ksefNumber1>,<ksefNumber2>"

# Generate from a JSON file (needed for per-invoice payment / description)
ksef collective-identifier generate --file invoices.json

# List identifiers created in a date range
ksef collective-identifier list --from 2026-07-01 [--to 2026-07-31] \
  [--number <id>] [--minInvoices N] [--maxInvoices N] [--currentContext] \
  [--pageSize N] [--continue <token>]

# Which identifiers does this invoice belong to?
ksef collective-identifier by-ksef <ksefNumber> [--pageSize N] [--continue <token>]

# What is inside this identifier?
ksef collective-identifier invoices <collectiveIdentifierNumber> [--pageSize N] [--continue <token>]

# Any of the three lists: fetch every page instead of one
ksef collective-identifier list --from 2026-07-01 --all
ksef collective-identifier invoices <collectiveIdentifierNumber> --all [--continue <token>]
```

Without `--all` each list command prints one page and, when there is more, the continuation token to pass to `--continue`. With `--all` it follows the tokens itself, starting from `--continue` when given, and prints every row; `--json` then prints the usual response shape with all items and no `continuationToken`.

`--file` accepts either a full request object or a bare array:

```json
{
  "invoices": [
    {
      "ksefNumber": "1111111111-20260701-0189AB-CD1234-EF",
      "payment": { "amount": 1230.45, "currency": "PLN" },
      "description": "Q3 delivery"
    },
    {
      "ksefNumber": "1111111111-20260702-0189AB-CD5678-AB"
    }
  ]
}
```

When `--to` is omitted from `list`, the current time is used.

## Errors

| Code | Meaning |
| ---- | ------- |
| `71001` | The invoice cannot be assigned to a collective identifier. |
| `71002` | The invoice already belongs to the maximum number of collective identifiers (132). |
| `71004` | The invoices have different sellers. The client catches this before sending. |
| `71005` | A KSeF number is repeated in the request. The client catches this before sending. |
| `21405` | Input validation failed. |

Rate limits for this domain are 20 requests/second, 120/minute, 240/hour (`collectiveIdentifier` category — see `ksef limits rate`). Not to be confused with the much lower ceiling the same category has on test-data rate-limit *overrides* (10/60/120), which bounds what you may set, not what KSeF enforces.
