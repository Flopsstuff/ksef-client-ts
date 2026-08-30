import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { VerificationLinkService } from '../../src/qr/verification-link-service.js';

// Spawn-based coverage for `ksef invoice pdf` — renders the whole preview set
// through the built CLI (dist/cli.js), no network and no authentication.
// Anonymous fixtures throughout: nothing here needs a real invoice.
//
// The assertions are deliberately shallow — a file appears, and it is a
// structurally complete PDF. Layout is judged by eye, not here; asserting on
// glyph positions would break on every deliberate design change and tell us
// nothing about whether the page actually reads well. What this does catch is
// the class of failure that is invisible in unit tests: a template that no
// longer validates at import, a bundling regression that drops the fonts, a
// flag that stops being wired, an optional peer that fails to load.
//
// Output goes to a stable directory so the rendered PDFs can be opened and
// reviewed after a run; override it with KSEF_PDF_OUT. Spec 36 writes its own
// `lib-` prefixed set into the same directory, so this one clears only what it
// owns — wiping the directory would race the sibling spec under a parallel run.

const repoRoot = resolve(fileURLToPath(import.meta.url), '..', '..', '..');
const cliEntry = join(repoRoot, 'dist', 'cli.js');
const fixtures = join(repoRoot, 'tests', 'fixtures', 'pdf');
const outDir = process.env.KSEF_PDF_OUT ?? join(repoRoot, '.pdf-preview');
const inputsDir = join(outDir, '_inputs');
const PREFIX = 'cli';

const fx = (name: string) => join(fixtures, name);

/** A KSeF number shaped like the real thing; this one identifies nobody. */
const KSEF_NUMBER = '1111111111-20260115-010000000000-00';

/**
 * The chain pages carry their own numbers: 07 names 06's in
 * `FakturaZaliczkowa`, and 09 names 08's, so the link between two pages of one
 * deal is visible on paper rather than asserted only in a fixture comment.
 */
const KSEF_ZAL_A = '1111111111-20250115-010000000000-A1';
const KSEF_ROZ_A = '1111111111-20250210-010000000000-A2';
const KSEF_ZAL_B = '1111111111-20250312-020000000000-B2';
const KSEF_ROZ_B = '1111111111-20250408-020000000000-B3';

/**
 * The QR group renders against TEST — the environment the rest of this suite
 * drives, so a page cannot name one environment while the spec beside it
 * authenticates against another. Nothing goes over the wire either way: a
 * verification link is computed, never called, and the documents are invented,
 * so no verifier resolves them anywhere. What naming a host buys is that every
 * code in the group points at the same one.
 */
const TEST_QR_HOST = 'https://qr-test.ksef.mf.gov.pl';

function run(args: string[]) {
  const result = spawnSync('node', [cliEntry, ...args], { encoding: 'utf-8', cwd: repoRoot });
  return { status: result.status ?? -1, stdout: result.stdout, stderr: result.stderr };
}

/** `%PDF-` header and an `%%EOF` trailer: a complete file, not a truncated one. */
function isCompletePdf(file: string): boolean {
  const bytes = readFileSync(file);
  const head = bytes.subarray(0, 5).toString('latin1');
  const tail = bytes.subarray(-8).toString('latin1').trim();
  return head === '%PDF-' && tail.endsWith('%%EOF');
}

/** Derived inputs that no fixture can hold on its own. */
let oldTotalsTemplate: string;
let multiDocumentUpo: string;
let certificateQrUrl: string;
let notesFile: string;
let oneSidedNotes: string;

function writeDerivedInputs(): void {
  // A copy of fa3-default whose totals read a single rate bucket — the shape the
  // template had before net/VAT started summing every P_13_*/P_14_*. Built from
  // the current template so it tracks unrelated layout edits.
  const template = JSON.parse(
    readFileSync(join(repoRoot, 'src', 'pdf', 'template', 'builtin', 'fa3-default.json'), 'utf-8'),
  ) as { blocks: Array<{ type: string; rows?: Array<Record<string, unknown>> }> };
  for (const block of template.blocks) {
    if (block.type !== 'totals') continue;
    for (const row of block.rows ?? []) {
      if (row.label === 'totalNet') { delete row.sum; row.path = 'Fa.P_13_1'; }
      if (row.label === 'totalVat') { delete row.sum; row.path = 'Fa.P_14_1'; }
    }
  }
  oldTotalsTemplate = join(inputsDir, 'cli-fa3-single-bucket-totals.json');
  writeFileSync(oldTotalsTemplate, JSON.stringify(template, null, 2));

  // A five-document session UPO, cloned from the single-document fixture.
  const upo = readFileSync(fx('upo-4_3.xml'), 'utf-8');
  const start = upo.indexOf('<Dokument>');
  const end = upo.indexOf('</Dokument>') + '</Dokument>'.length;
  const first = upo.slice(start, end);
  const clones = [2, 3, 4, 5].map((i) =>
    first
      .replace('010000000000-00', `${String(i).padStart(2, '0')}0000000000-00`)
      .replace('FA/2025/01/001', `FA/2025/01/00${i}`),
  );
  multiDocumentUpo = join(inputsDir, 'cli-upo-4_3-five-documents.xml');
  writeFileSync(multiDocumentUpo, upo.slice(0, end) + '\n' + clones.join('\n') + upo.slice(end));

  // Code II is signed with the issuer's offline-certificate key, so it can only
  // be built, never derived from the document. A throwaway EC key gives a URL of
  // realistic length — which is what decides how dense the printed code is.
  const key = generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey.export({
    type: 'pkcs8',
    format: 'pem',
  }) as string;
  notesFile = join(inputsDir, 'cli-notes.json');
  writeFileSync(
    notesFile,
    JSON.stringify([
      { head: 'Warunki dostawy', body: 'Towar wydany w magazynie sprzedawcy. Ryzyko przechodzi na kupującego z chwilą wydania.' },
      { head: 'Uwaga', body: 'Prosimy o podanie numeru faktury w tytule przelewu.' },
    ]),
  );

  // A note with only a head, and one with only a body — the two shapes page 12
  // is there to show.
  oneSidedNotes = join(inputsDir, 'cli-notes-one-sided.json');
  writeFileSync(oneSidedNotes, JSON.stringify([{ head: 'Tylko nagłówek' }, { body: 'Tylko treść.' }]));

  certificateQrUrl = new VerificationLinkService(TEST_QR_HOST).buildCertificateVerificationUrl(
    'Nip',
    '1111111111',
    '1111111111',
    '01F20A5D352AE590',
    randomBytes(32).toString('base64'),
    key,
  );
}

describe('35 - `ksef invoice pdf` renders the preview set', () => {
  beforeAll(() => {
    if (!existsSync(cliEntry)) {
      throw new Error(`Missing ${cliEntry}. Run \`yarn build\` before \`yarn test:e2e\`.`);
    }
    mkdirSync(inputsDir, { recursive: true });
    for (const stale of readdirSync(outDir)) {
      if (stale.startsWith(`${PREFIX}-`)) rmSync(join(outDir, stale), { force: true });
    }
    writeDerivedInputs();
  });

  afterAll(() => {
    // eslint-disable-next-line no-console
    console.log(`\n  rendered PDFs kept for review in ${outDir}\n`);
  });

  const LOGO = () => ['--logo', fx('e2e-logo.png')];
  /** The two hex forms the flag accepts, so the preview set exercises both. */
  const ACCENT = '#5AB595';
  const ACCENT_SHORT = '#b04';
  const SUPPLIED_CODE_I = `${TEST_QR_HOST}/invoice/1111111111/15-01-2026/SUPPLIED-VERBATIM`;

  /**
   * The preview set, laid out as a covering design rather than one variant per
   * feature. Nine dimensions are in play — document, locale, which QR codes,
   * links, logo, KSeF number, totals mode, accent colour, and where Code I comes
   * from — and a row per combination would be hundreds of PDFs nobody looks at.
   * Instead each row varies several at once so that every value of every
   * dimension appears, and the pairs that actually interact are covered.
   *
   * Between them these five rows already spend every totals mode — buckets,
   * summary, both, none — so the modes need no pages of their own.
   *
   *   #   document      locale  QR     links  logo  KSeF nr  totals   accent
   *   01  services-np   pl      I      no     yes   yes      buckets  #5AB595
   *   02  fa3           en      I      yes    no    yes      summary  no       (Code I supplied)
   *   03  buyer-no-id   uk      II     yes    yes   no       both     no
   *   04  vat-multi     en+pl   II     no     no    no       none     no
   *   05  vat-multi     pl+uk   both   yes    yes   no       both     no       (+ notes, template file)
   *
   * What each row is there to show, beyond its share of the grid: 01 the
   * everyday online invoice, and the accent against the default palette; 02 an
   * invoice whose Code I URL was handed over ready-made; 03 a foreign buyer
   * with no NIP, issued offline; 04 and 05 the layout cases — one code absent,
   * then both present — where the codes must stay against the right margin, and
   * 05 additionally the only page built from a template file.
   */
  const variants: Array<[name: string, args: () => string[]]> = [
    [`${PREFIX}-01-invoice-pl-code-i-accent`, () => [
      fx('e2e-services-np.xml'), '--ksef-number', KSEF_NUMBER, ...LOGO(),
      '--env', 'test', '--qr', '--totals', 'buckets', '--accent', ACCENT,
    ]],
    [`${PREFIX}-02-invoice-en-supplied-code-i-links`, () => [
      fx('fa3.xml'), '--ksef-number', KSEF_NUMBER, '--locale', 'en',
      '--qr-url', SUPPLIED_CODE_I, '--qr-links', '--totals', 'summary',
    ]],
    [`${PREFIX}-03-invoice-uk-offline-code-ii-links`, () => [
      fx('e2e-buyer-no-id.xml'), ...LOGO(), '--locale', 'uk',
      '--env', 'test', '--qr-cert-url', certificateQrUrl, '--qr-links', '--totals', 'both',
    ]],
    [`${PREFIX}-04-invoice-bilingual-offline-code-ii`, () => [
      fx('e2e-vat-multi.xml'), '--locale', 'en+pl',
      '--env', 'test', '--qr-cert-url', certificateQrUrl, '--totals', 'none',
    ]],
    // The only page drawn from a template file rather than a built-in, which is
    // what keeps --template-file wired. Its totals deliberately read the
    // standard-rate bucket alone instead of summing every bucket, so on this
    // multi-rate invoice the net and VAT lines are narrower than the line items
    // above them — that is the template choosing, not the renderer erring.
    // What the summing itself computes is pinned exactly in totals-sum.test.ts;
    // nothing here reads a figure off the page.
    [`${PREFIX}-05-invoice-pl-uk-custom-template-file`, () => [
      fx('e2e-vat-multi.xml'), ...LOGO(), '--locale', 'pl+uk',
      '--env', 'test', '--qr', '--qr-cert-url', certificateQrUrl, '--qr-links', '--totals', 'both',
      '--notes', notesFile, '--template-file', oldTotalsTemplate,
    ]],
    // Beyond the grid the pages come in *chains*, numbered so one deal runs from
    // page to page. Each chain is two documents and no more: an advance invoice
    // and the settlement that closes it, for a different buyer and a different
    // amount each time, with dates that only ever move forward.
    //
    //   06 → 07   Nabywca Przykładowy S.A.      order 615,00    remainder STATED
    //   08 → 09   Odbiorca Handlowy Sp. z o.o.  order 1 230,00  remainder COMPUTED
    //
    // Chain B renders in English. The document data stays Polish — labels are
    // what a locale switches — so the pair doubles as proof that every label
    // this story added has an English word behind it, not only a Polish one.
    //
    // The two chains exist because the FA schemas let a settlement invoice
    // state what is left in either of two ways, and the pages have to be right
    // for both. 10, 11 and 12 then stand alone: an ordinary invoice being paid
    // down, one that has been overpaid, and one whose notes each carry only
    // half of what a note can carry.

    // 06 — chain A, the advance invoice (ZAL). No `Fa.FaWiersz`: the goods sit
    // under `Fa.Zamowienie`, so the page shows the order table under its own
    // heading with no empty item table above it. `P_15` is 450,00 — money
    // *received*, not owed — and the two payments that make it up add to it
    // exactly. Its KSeF number is the one page 07 points back at.
    [`${PREFIX}-06-chain-a-advance`, () => [
      fx('fa3-zal.xml'), '--ksef-number', KSEF_ZAL_A,
      '--env', 'test', '--qr', '--totals', 'buckets',
    ]],
    // 07 — chain A, the settlement (ROZ) that closes 06. The lines and VAT
    // items show the whole 615,00 order while the tax summary and `P_15` cover
    // only the 165,00 still owed — the advance invoice already declared the tax
    // on its own share. Rendered with `--totals both`, so the derived bridge
    // between the two (`Wartość zamówienia netto` and `Rozliczono zaliczkami`)
    // is on the page: that reconciliation is computed, so it appears only where
    // the caller has accepted computed figures.
    [`${PREFIX}-07-chain-a-settlement-stated`, () => [
      fx('fa3-roz.xml'), '--ksef-number', KSEF_ROZ_A,
      '--env', 'test', '--qr', '--totals', 'both',
    ]],
    // 08 — chain B, a different buyer and a different deal: order 1 230,00,
    // advance 800,00 received in March.
    [`${PREFIX}-08-chain-b-advance`, () => [
      fx('fa3-zal-b.xml'), '--ksef-number', KSEF_ZAL_B, '--locale', 'en',
      '--env', 'test', '--qr', '--totals', 'buckets',
    ]],
    // 09 — chain B's settlement, which states the payments it received instead
    // of leaving them on 08. So `P_15` is the whole 1 230,00 and what is owed is
    // the difference the schema defines: `P_15` less the sum of the `P_15Z`
    // fields, 430,00. No field carries that number.
    [`${PREFIX}-09-chain-b-settlement-computed`, () => [
      fx('fa3-roz-b.xml'), '--ksef-number', KSEF_ROZ_B, '--locale', 'en',
      '--env', 'test', '--qr', '--totals', 'both',
    ]],
    // 10 — standalone: an ordinary invoice being paid down, which is a
    // different thing from an advance and reads differently. `Platnosc` takes
    // the branch no other page reaches (no `Zaplacono`, a partial marker, one
    // `ZaplataCzesciowa` per instalment), and the parts deliberately do *not*
    // add up to the total — that is what "paid in part" means.
    [`${PREFIX}-10-partial-payments`, () => [
      fx('fa3-czesciowa.xml'), '--ksef-number', KSEF_NUMBER,
      '--env', 'test', '--qr', '--totals', 'buckets',
    ]],
    // 11 — standalone, the opposite end of the same branch: `Rozliczenie`
    // states a `DoRozliczenia` overpayment rather than a `DoZaplaty`. Nothing
    // is owed, so nothing on the page may ask for payment.
    [`${PREFIX}-11-overpayment`, () => [
      fx('fa3-nadplata.xml'), '--ksef-number', KSEF_NUMBER,
      '--env', 'test', '--qr', '--totals', 'buckets',
    ]],
    // 12 — the notes flag, given a note with only a head and one with only a
    // body. The renderer prints whichever half a note carries, and the docs say
    // so, so the flag has to accept the same shape the library does: a CLI
    // stricter than the API it fronts rejects input the user was told was
    // valid. It is a page rather than an assertion because what a half-note
    // looks like — a heading with nothing under it, a paragraph with nothing
    // over it — is a layout question, and those are settled by eye here.
    [`${PREFIX}-12-notes-one-sided`, () => [fx('fa3.xml'), '--notes', oneSidedNotes]],
    // 13 — not a document shape but a template: `fa3-showcase` exists to
    // exercise the DSL (palette, letter spacing, highlighted text, colour bars
    // drawn as data-URI images), rendered with everything switched on so a DSL
    // change that breaks it is visible rather than discovered by a reader. It
    // carries the accent in its short hex form, and so is the page that shows
    // whether an accent wins over a template's own palette.
    [`${PREFIX}-13-showcase-template-accent`, () => [
      fx('e2e-vat-multi.xml'), '--template', 'fa3-showcase', ...LOGO(),
      '--env', 'test', '--qr', '--qr-cert-url', certificateQrUrl, '--qr-links',
      '--totals', 'summary', '--notes', notesFile, '--accent', ACCENT_SHORT,
    ]],
    // Receipts last: they are a different document and read as their own group.
    [`${PREFIX}-14-upo-pl`, () => [fx('upo-4_3.xml')]],
    [`${PREFIX}-15-upo-five-documents-bilingual`, () => [multiDocumentUpo, '--locale', 'en+pl']],
  ];

  /**
   * The grid above is only worth trusting if it actually is one. This reads the
   * rows back and checks that every value of every dimension is present, so a
   * row edited for one reason cannot quietly drop the only coverage of another.
   */
  it('covers every value of every dimension', () => {
    const args = variants.map(([, build]) => build().join(' '));
    const covered = (needle: string) => args.some((a) => a.includes(needle));

    for (const doc of [
      'e2e-services-np.xml', 'fa3.xml', 'e2e-buyer-no-id.xml', 'e2e-vat-multi.xml',
      // An advance invoice reaches a branch of the template no other document
      // does, so it is pinned here rather than left to be dropped by accident.
      // So does an invoice settled in instalments.
      'fa3-zal.xml', 'fa3-roz.xml', 'fa3-zal-b.xml', 'fa3-roz-b.xml',
      'fa3-czesciowa.xml', 'fa3-nadplata.xml', 'upo-4_3.xml',
    ]) {
      expect(covered(doc), `no variant renders ${doc}`).toBe(true);
    }
    for (const locale of ['en', 'uk', 'en+pl', 'pl+uk']) {
      expect(covered(`--locale ${locale}`), `no variant renders in ${locale}`).toBe(true);
    }
    for (const totals of ['none', 'buckets', 'summary', 'both']) {
      expect(covered(`--totals ${totals}`), `no variant renders --totals ${totals}`).toBe(true);
    }
    expect(covered('--qr '), 'Code I is never derived').toBe(true);
    expect(covered('--qr-url'), 'Code I is never supplied ready-made').toBe(true);
    expect(covered('--qr-cert-url'), 'Code II is never printed').toBe(true);
    expect(covered('--qr-links'), 'the links are never printed').toBe(true);
    expect(covered('--template-file'), 'a custom template file is never used').toBe(true);
    expect(covered('--template '), 'a built-in is never selected by name').toBe(true);
    expect(covered('--notes'), 'caller-supplied notes are never printed').toBe(true);
    // The accent repaints the title and both heading levels, so a themed render
    // differs from an unthemed one on every page — worth its own cover.
    expect(covered('--accent'), 'the accent colour is never applied').toBe(true);
    expect(covered('--logo'), 'the logo is never printed').toBe(true);
    for (const accent of ['#5AB595', '#b04']) {
      expect(covered(`--accent ${accent}`), `no variant renders with accent ${accent}`).toBe(true);
    }
    // The absences matter as much: a Polish default locale, an invoice with no
    // logo, and one still waiting for its KSeF number.
    expect(args.some((a) => !a.includes('--locale')), 'nothing renders in the default locale').toBe(true);
    expect(args.some((a) => !a.includes('--logo')), 'nothing renders without a logo').toBe(true);
    expect(args.some((a) => !a.includes('--ksef-number')), 'nothing renders as OFFLINE').toBe(true);
    expect(args.some((a) => !a.includes('--accent')), 'nothing renders in the default colours').toBe(true);
  });

  it.each(variants)('renders %s', (name, args) => {
    const out = join(outDir, `${name}.pdf`);
    const res = run(['invoice', 'pdf', ...args(), '--out', out]);

    expect(res.status, `exit ${res.status}\n${res.stderr}`).toBe(0);
    expect(existsSync(out), `${out} was not written`).toBe(true);
    expect(isCompletePdf(out), `${out} is not a complete PDF`).toBe(true);
  });

  it('renders every variant of the set', () => {
    // Guards against a variant being silently dropped from the table above:
    // the count is stated here so removing a row has to be deliberate.
    expect(variants).toHaveLength(15);
    for (const [name] of variants) {
      expect(existsSync(join(outDir, `${name}.pdf`)), `${name}.pdf missing`).toBe(true);
    }
  });

  it('fails loudly on an unknown template instead of writing a file', () => {
    const out = join(outDir, 'should-not-exist.pdf');
    const res = run(['invoice', 'pdf', fx('fa3.xml'), '--template', 'no-such-template', '--out', out]);
    expect(res.status).not.toBe(0);
    expect(existsSync(out)).toBe(false);
  });

  // Reading the template is the CLI's job — `./pdf` touches no filesystem — so
  // the path that does not exist has to be reported here, naming the file.
  it('names the template file it cannot read, and writes nothing', () => {
    const out = join(outDir, 'should-not-exist-3.pdf');
    const res = run([
      'invoice', 'pdf', fx('fa3.xml'), '--template-file', join(outDir, 'absent.json'), '--out', out,
    ]);
    expect(res.status).not.toBe(0);
    expect(`${res.stdout}${res.stderr}`).toMatch(/Failed to read template file/);
    expect(existsSync(out)).toBe(false);
  });

  it('rejects a UPO handed to an invoice template', () => {
    const out = join(outDir, 'should-not-exist-2.pdf');
    const res = run(['invoice', 'pdf', fx('upo-4_3.xml'), '--template', 'fa3-default', '--out', out]);
    expect(res.status).not.toBe(0);
    expect(existsSync(out)).toBe(false);
  });

  // Page 12 renders the note shapes the flag accepts; these two pin what it
  // still refuses, which writes no file at all.
  it('still refuses a note entry that carries neither half', () => {
    const empty = join(inputsDir, `${PREFIX}-notes-empty-entry.json`);
    writeFileSync(empty, JSON.stringify([{ note: 'wrong key' }]));
    const out = join(outDir, 'should-not-exist-5.pdf');
    const res = run(['invoice', 'pdf', fx('fa3.xml'), '--notes', empty, '--out', out]);
    expect(res.status).not.toBe(0);
    expect(`${res.stdout}${res.stderr}`).toMatch(/must have a string "head", a string "body", or both/);
    expect(existsSync(out)).toBe(false);
  });

  it('still refuses a note half that is present but not a string', () => {
    const wrongType = join(inputsDir, `${PREFIX}-notes-wrong-type.json`);
    writeFileSync(wrongType, JSON.stringify([{ head: 'ok', body: 42 }]));
    const out = join(outDir, 'should-not-exist-6.pdf');
    const res = run(['invoice', 'pdf', fx('fa3.xml'), '--notes', wrongType, '--out', out]);
    expect(res.status).not.toBe(0);
    expect(`${res.stdout}${res.stderr}`).toMatch(/non-string "body"/);
    expect(existsSync(out)).toBe(false);
  });

  // pdfmake silently ignores a colour it cannot parse, so an unrecognized accent
  // renders a document identical to an unthemed one. A misspelled colour name
  // has to fail at the flag, or it becomes a PDF that is quietly wrong.
  // A typo here used to resolve to the production QR host and the command still
  // reported success, so the invoice came out carrying a code that points at the
  // wrong registry — nothing on the page says which one it is.
  it('refuses an environment it cannot resolve a QR host for', () => {
    const out = join(outDir, 'should-not-exist-5.pdf');
    const res = run(['invoice', 'pdf', fx('fa3.xml'), '--qr', '--env', 'staging', '--out', out]);
    expect(res.status).not.toBe(0);
    expect(`${res.stdout}${res.stderr}`).toMatch(/Invalid --env/);
    expect(existsSync(out)).toBe(false);
  });

  it('refuses an accent colour that is not hex', () => {
    const out = join(outDir, 'should-not-exist-4.pdf');
    const res = run(['invoice', 'pdf', fx('fa3.xml'), '--accent', 'crimsonn', '--out', out]);
    expect(res.status).not.toBe(0);
    expect(`${res.stdout}${res.stderr}`).toMatch(/Invalid --accent/);
    expect(existsSync(out)).toBe(false);
  });

  // pdfmake draws PNG and JPEG and nothing else, so a vector or animated logo
  // has to be refused at the flag — accepting it only moves the failure into
  // the middle of the render, where the message names no file the caller passed.
  it('refuses a logo format the renderer cannot draw', () => {
    const svg = join(inputsDir, 'logo.svg');
    writeFileSync(svg, '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"/>');
    const out = join(outDir, 'should-not-exist-3.pdf');
    const res = run(['invoice', 'pdf', fx('fa3.xml'), '--logo', svg, '--out', out]);
    expect(res.status).not.toBe(0);
    expect(`${res.stdout}${res.stderr}`).toMatch(/Unsupported logo format/);
    expect(existsSync(out)).toBe(false);
  });
});
